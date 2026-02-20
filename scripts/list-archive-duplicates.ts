/**
 * List archived booking duplicates per client (grouped by serviceTypeId, count > 1).
 * Usage: npx tsx scripts/list-archive-duplicates.ts <siteId> <clientIdOrPhone>
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON (or GOOGLE_APPLICATION_CREDENTIALS).
 *
 * Example: npx tsx scripts/list-archive-duplicates.ts mySiteId 0501234567
 */

import { getAdminDb } from "../lib/firebaseAdmin";
import { getServiceTypeKey } from "../lib/archiveReplace";

function getServiceTypeKeyFromDoc(d: Record<string, unknown>): string {
  return getServiceTypeKey(d);
}

async function main() {
  const siteId = process.argv[2];
  const clientIdOrPhone = process.argv[3];
  if (!siteId || !clientIdOrPhone) {
    console.error("Usage: npx tsx scripts/list-archive-duplicates.ts <siteId> <clientIdOrPhone>");
    process.exit(1);
  }

  const db = getAdminDb();
  const col = db.collection("sites").doc(siteId).collection("bookings");

  const byClientId = await col.where("isArchived", "==", true).where("clientId", "==", clientIdOrPhone).get();
  const byPhone = await col.where("isArchived", "==", true).where("customerPhone", "==", clientIdOrPhone).get();
  const seen = new Map<string, { id: string; data: Record<string, unknown> }>();
  for (const doc of byClientId.docs) {
    seen.set(doc.id, { id: doc.id, data: doc.data() as Record<string, unknown> });
  }
  for (const doc of byPhone.docs) {
    if (!seen.has(doc.id)) seen.set(doc.id, { id: doc.id, data: doc.data() as Record<string, unknown> });
  }

  const byServiceKey = new Map<string, { id: string; data: Record<string, unknown> }[]>();
  for (const { id, data } of seen.values()) {
    const key = getServiceTypeKeyFromDoc(data);
    const list = byServiceKey.get(key) ?? [];
    list.push({ id, data });
    byServiceKey.set(key, list);
  }

  const duplicates = Array.from(byServiceKey.entries()).filter(([, list]) => list.length > 1);
  if (duplicates.length === 0) {
    console.log(`No duplicate archived bookings for siteId=${siteId} clientIdOrPhone=${clientIdOrPhone}`);
    return;
  }
  console.log(`Duplicates by serviceTypeId (siteId=${siteId}, clientIdOrPhone=${clientIdOrPhone}):\n`);
  for (const [serviceKey, list] of duplicates) {
    console.log(`  serviceTypeId/serviceType: "${serviceKey}" count=${list.length}`);
    for (const { id, data } of list) {
      const date = (data.date as string) ?? (data.dateISO as string) ?? "";
      const archivedAt = data.archivedAt;
      console.log(`    - docId=${id} date=${date} archivedAt=${archivedAt != null ? "(set)" : "(missing)"}`);
    }
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
