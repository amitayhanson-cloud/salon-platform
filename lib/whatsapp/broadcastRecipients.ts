/**
 * Server-only: resolve E.164 phones for WhatsApp broadcast filters.
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import { isValidE164, normalizeE164 } from "@/lib/whatsapp/e164";
import type { BroadcastAutomatedStatus, BroadcastRecipientFilters } from "@/lib/whatsapp/broadcastConstants";
import { broadcastFiltersAreEmpty } from "@/lib/whatsapp/broadcastConstants";
import type { DocumentSnapshot } from "firebase-admin/firestore";

export type BroadcastRecipient = {
  e164: string;
  /** Display name for template {שם_לקוח} */
  name: string;
  currentStatus?: BroadcastAutomatedStatus;
  manualTagIds?: string[];
};

/**
 * Returns unique recipients (valid E.164 only). Skips archived clients and invalid phones.
 */
function passesSegmentRules(
  data: Record<string, unknown>,
  filters: BroadcastRecipientFilters
): boolean {
  if (filters.includeEveryone) return true;
  if (filters.statuses.length > 0) {
    const st = typeof data.currentStatus === "string" ? data.currentStatus : "";
    if (!filters.statuses.includes(st as BroadcastAutomatedStatus)) return false;
  }
  if (filters.tagIds.length > 0) {
    const tags = Array.isArray(data.manualTagIds)
      ? data.manualTagIds.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
      : [];
    const hit = filters.tagIds.some((tid) => tags.includes(tid));
    if (!hit) return false;
  }
  return true;
}

function tryAddClientDoc(
  docSnap: DocumentSnapshot,
  seen: Set<string>,
  out: BroadcastRecipient[]
): void {
  if (!docSnap.exists) return;
  const data = docSnap.data() as Record<string, unknown>;
  if (data.archived === true) return;

  const phoneRaw =
    typeof data.phone === "string" && data.phone.trim() ? data.phone.trim() : docSnap.id;
  const e164 = normalizeE164(phoneRaw, "IL");
  if (!isValidE164(e164)) return;

  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "לקוח";
  const currentStatus =
    typeof data.currentStatus === "string" &&
    ["new", "active", "normal", "sleeping"].includes(data.currentStatus)
      ? (data.currentStatus as BroadcastAutomatedStatus)
      : undefined;
  const manualTagIds = Array.isArray(data.manualTagIds)
    ? data.manualTagIds.filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  if (!seen.has(e164)) {
    seen.add(e164);
    out.push({ e164, name, currentStatus, manualTagIds });
  }
}

/**
 * Recipients = (explicit clientIds) ∪ (clients matching segment filters when any status/tag selected).
 */
export async function listBroadcastRecipients(
  siteId: string,
  filters: BroadcastRecipientFilters
): Promise<BroadcastRecipient[]> {
  if (broadcastFiltersAreEmpty(filters)) {
    throw new Error("BROADCAST_FILTERS_EMPTY");
  }

  const db = getAdminDb();
  const clientsRef = db.collection("sites").doc(siteId.trim()).collection("clients");
  const seen = new Set<string>();
  const out: BroadcastRecipient[] = [];

  const uniqueIds = [...new Set(filters.clientIds.map((c) => c.trim()).filter(Boolean))];
  const chunkSize = 20;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const slice = uniqueIds.slice(i, i + chunkSize);
    const snaps = await Promise.all(slice.map((id) => clientsRef.doc(id).get()));
    for (const docSnap of snaps) {
      tryAddClientDoc(docSnap, seen, out);
    }
  }

  const needSegmentScan = filters.includeEveryone || filters.statuses.length > 0 || filters.tagIds.length > 0;
  if (needSegmentScan) {
    const snap = await clientsRef.get();
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (!passesSegmentRules(data, filters)) continue;
      tryAddClientDoc(d, seen, out);
    }
  }

  return out;
}
