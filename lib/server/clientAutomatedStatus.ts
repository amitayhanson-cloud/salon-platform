/**
 * Admin SDK: load bookings for a client, compute automated status, persist on client doc.
 */

import { Timestamp } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { calculateAutomatedClientStatus, type BookingForStatus } from "@/lib/clientStatusEngine";
import { firestoreBookingRecordToBookingForStatus, normalizeClientPhoneKey } from "@/lib/bookingForClientStatus";
import { normalizeClientStatusRules } from "@/lib/clientStatusRules";
import type { ClientStatusRules } from "@/types/clientStatus";
import { DEFAULT_CLIENT_STATUS_RULES } from "@/types/clientStatus";

export async function loadClientStatusRulesForSite(
  db: Firestore,
  siteId: string
): Promise<ClientStatusRules> {
  const snap = await db.collection("sites").doc(siteId).collection("settings").doc("clients").get();
  const raw = snap.data()?.statusRules as Partial<ClientStatusRules> | undefined;
  return normalizeClientStatusRules(raw ?? DEFAULT_CLIENT_STATUS_RULES);
}

/**
 * Collect unique booking docs for a client: match `clientId` or `customerPhone` for each lookup key
 * (doc id, stored `phone`, and optional hints from a booking row).
 */
export async function fetchBookingsForClientStatus(
  db: Firestore,
  siteId: string,
  clientDocId: string,
  extraLookupKeys: string[] = []
): Promise<BookingForStatus[]> {
  const keys = new Set<string>();
  const trimmedId = clientDocId.trim();
  if (trimmedId) {
    keys.add(trimmedId);
    keys.add(normalizeClientPhoneKey(trimmedId));
  }
  for (const k of extraLookupKeys) {
    const t = String(k ?? "").trim();
    if (!t) continue;
    keys.add(t);
    keys.add(normalizeClientPhoneKey(t));
  }

  const clientSnap = await db.collection("sites").doc(siteId).collection("clients").doc(clientDocId).get();
  if (clientSnap.exists) {
    const p = (clientSnap.data() as { phone?: unknown } | undefined)?.phone;
    if (typeof p === "string" && p.trim()) {
      keys.add(p.trim());
      keys.add(normalizeClientPhoneKey(p.trim()));
    }
  }

  const bookingsCol = db.collection("sites").doc(siteId).collection("bookings");
  const byDocId = new Map<string, BookingForStatus>();

  for (const key of keys) {
    if (!key) continue;
    const [snapClientId, snapPhone] = await Promise.all([
      bookingsCol.where("clientId", "==", key).get(),
      bookingsCol.where("customerPhone", "==", key).get(),
    ]);
    for (const doc of snapClientId.docs) {
      byDocId.set(doc.id, firestoreBookingRecordToBookingForStatus(doc.data() as Record<string, unknown>));
    }
    for (const doc of snapPhone.docs) {
      byDocId.set(doc.id, firestoreBookingRecordToBookingForStatus(doc.data() as Record<string, unknown>));
    }
  }

  // Include archived booking history (the same source used by client history UI)
  // so automated status reflects full booking history, not only active calendar docs.
  const archivedCol = db
    .collection("sites")
    .doc(siteId)
    .collection("clients")
    .doc(clientDocId)
    .collection("archivedServiceTypes");
  const archivedSnap = await archivedCol.get();
  for (const doc of archivedSnap.docs) {
    byDocId.set(`archived:${doc.id}`, firestoreBookingRecordToBookingForStatus(doc.data() as Record<string, unknown>));
  }

  return [...byDocId.values()];
}

/**
 * Resolve Firestore client document id from a booking (clientId preferred; else normalized customer phone).
 */
export function resolveClientDocIdFromBookingData(data: Record<string, unknown>): string | null {
  const clientId = typeof data.clientId === "string" ? data.clientId.trim() : "";
  if (clientId) return clientId;
  const rawPhone =
    (typeof data.customerPhone === "string" && data.customerPhone.trim()) ||
    (typeof data.phone === "string" && data.phone.trim()) ||
    "";
  if (!rawPhone) return null;
  return normalizeClientPhoneKey(rawPhone);
}

/**
 * Recompute automated status from all bookings and merge onto `sites/{siteId}/clients/{clientDocId}`.
 * No-op if that client document does not exist.
 */
export async function refreshClientAutomatedStatus(
  db: Firestore,
  siteId: string,
  clientDocId: string,
  bookingHint?: Record<string, unknown>
): Promise<void> {
  const clientRef = db.collection("sites").doc(siteId).collection("clients").doc(clientDocId);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) return;

  const hints: string[] = [];
  if (bookingHint) {
    const cid = typeof bookingHint.clientId === "string" ? bookingHint.clientId.trim() : "";
    const cp = typeof bookingHint.customerPhone === "string" ? bookingHint.customerPhone.trim() : "";
    const ph = typeof bookingHint.phone === "string" ? bookingHint.phone.trim() : "";
    if (cid) hints.push(cid);
    if (cp) hints.push(cp);
    if (ph) hints.push(ph);
  }

  const statusRules = await loadClientStatusRulesForSite(db, siteId);
  const bookings = await fetchBookingsForClientStatus(db, siteId, clientDocId, hints);
  const currentStatus = calculateAutomatedClientStatus(bookings, statusRules);

  await clientRef.set(
    { currentStatus, currentStatusUpdatedAt: Timestamp.now() },
    { merge: true }
  );
}

/** After a booking write: update that customer's automated status (best-effort). */
export async function refreshClientAutomatedStatusFromBooking(
  db: Firestore,
  siteId: string,
  bookingData: Record<string, unknown>
): Promise<void> {
  const clientDocId = resolveClientDocIdFromBookingData(bookingData);
  if (!clientDocId) return;
  await refreshClientAutomatedStatus(db, siteId, clientDocId, bookingData);
}
