/**
 * Deep-clean ONE site: wipe selected subcollections, clear analytics history (monthly +
 * deepArchiveMerge), reset dashboardCurrent.
 * Does NOT delete sites/{siteId} (owner, name, config stay).
 *
 * Target: Pf6lHadtkDyDHOFiFI2e (override with env DEEP_CLEAN_SITE_ID=mySiteId).
 *
 * DRY RUN (default):
 *   npx tsx scripts/deepCleanSingleSite.ts
 *
 * EXECUTE:
 *   npx tsx scripts/deepCleanSingleSite.ts --execute
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_* in .env.local (same as cleanSlate).
 */

import path from "path";
import dotenv from "dotenv";
import { FieldPath, type CollectionReference, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const EXECUTE = process.argv.includes("--execute");

/** Main site to deep-clean. */
const DEFAULT_SITE_ID = "Pf6lHadtkDyDHOFiFI2e";

const SITE_ID = (process.env.DEEP_CLEAN_SITE_ID || DEFAULT_SITE_ID).trim();

const BATCH = 450;

const SUBCOLLECTIONS_TO_CLEAR = [
  "bookings",
  "pricingItems",
  "settings",
  "tasks",
  "workers",
  "multiBookingCombos",
] as const;

async function forEachDocumentPage(
  ref: CollectionReference,
  onPage: (docs: QueryDocumentSnapshot[]) => Promise<void>
): Promise<number> {
  let total = 0;
  let last: QueryDocumentSnapshot | undefined;
  for (let guard = 0; guard < 500_000; guard++) {
    let q = ref.orderBy(FieldPath.documentId()).limit(BATCH);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    total += snap.docs.length;
    await onPage(snap.docs);
    last = snap.docs[snap.docs.length - 1];
  }
  return total;
}

async function wipeFlatCollectionRef(db: Firestore, ref: CollectionReference, label: string): Promise<number> {
  let total = 0;
  await forEachDocumentPage(ref, async (docs) => {
    total += docs.length;
    if (!EXECUTE) return;
    const batch = db.batch();
    for (const d of docs) batch.delete(d.ref);
    await batch.commit();
  });
  if (EXECUTE) console.log(`    [${label}] removed ${total} docs`);
  else console.log(`    [${label}] would delete ${total} docs`);
  return total;
}

async function wipeFlatCollection(db: Firestore, siteId: string, name: string, label: string): Promise<number> {
  const ref = db.collection("sites").doc(siteId).collection(name);
  return wipeFlatCollectionRef(db, ref, label);
}

async function wipeClientsWithArchives(db: Firestore, siteId: string): Promise<void> {
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  const clientIds: string[] = [];

  await forEachDocumentPage(clientsRef, async (docs) => {
    for (const d of docs) clientIds.push(d.id);
  });

  let archivedTotal = 0;
  for (const clientId of clientIds) {
    const archRef = clientsRef.doc(clientId).collection("archivedServiceTypes");
    await forEachDocumentPage(archRef, async (docs) => {
      archivedTotal += docs.length;
      if (!EXECUTE) return;
      const batch = db.batch();
      for (const d of docs) batch.delete(d.ref);
      await batch.commit();
    });
  }

  let clientsRemoved = 0;
  await forEachDocumentPage(clientsRef, async (docs) => {
    clientsRemoved += docs.length;
    if (!EXECUTE) return;
    const batch = db.batch();
    for (const d of docs) batch.delete(d.ref);
    await batch.commit();
  });

  if (EXECUTE) {
    console.log(`    [clients] removed ${clientsRemoved} clients; cleared ${archivedTotal} archivedServiceTypes docs`);
  } else {
    console.log(
      `    [clients] would delete ${clientIds.length} clients; would clear ${archivedTotal} archivedServiceTypes docs`
    );
  }
}

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log(`  DEEP CLEAN SITE: ${SITE_ID}`);
  console.log(`  Mode: ${EXECUTE ? "EXECUTE (destructive)" : "DRY RUN"}`);
  console.log("=".repeat(70) + "\n");

  const { getAdminDb } = await import("../lib/firebaseAdmin");
  const { resetDashboardCurrentForSite } = await import("../lib/liveStatsScorekeeper");
  const db = getAdminDb();

  const siteRef = db.collection("sites").doc(SITE_ID);
  const siteSnap = await siteRef.get();
  if (!siteSnap.exists) {
    console.error(`[FATAL] sites/${SITE_ID} does not exist.`);
    process.exit(1);
  }

  const preview = siteSnap.data() as { name?: string; ownerEmail?: string; ownerUid?: string };
  console.log("  Site doc preserved (not deleting sites/" + SITE_ID + "):");
  console.log(`    name: ${preview.name ?? "(none)"}`);
  console.log(`    ownerEmail: ${preview.ownerEmail ?? "(none)"}`);
  console.log(`    ownerUid: ${preview.ownerUid ?? "(none)"}`);
  console.log("");

  for (const sub of SUBCOLLECTIONS_TO_CLEAR) {
    console.log(`  Clearing: ${sub}`);
    await wipeFlatCollection(db, SITE_ID, sub, sub);
  }

  console.log(`  Clearing: clients (+ archivedServiceTypes)`);
  await wipeClientsWithArchives(db, SITE_ID);

  console.log(`  Clearing: analytics/monthly/months (archived month totals)`);
  const monthlyMonthsRef = db
    .collection("sites")
    .doc(SITE_ID)
    .collection("analytics")
    .doc("monthly")
    .collection("months");
  await wipeFlatCollectionRef(db, monthlyMonthsRef, "analytics/monthly/months");

  const deepMergeRef = db.collection("sites").doc(SITE_ID).collection("analytics").doc("deepArchiveMerge");
  const deepMergeSnap = await deepMergeRef.get();
  if (EXECUTE) {
    if (deepMergeSnap.exists) {
      await deepMergeRef.delete();
      console.log(`    [analytics/deepArchiveMerge] deleted`);
    } else {
      console.log(`    [analytics/deepArchiveMerge] (absent, skip)`);
    }
  } else {
    console.log(
      `    [analytics/deepArchiveMerge] would ${deepMergeSnap.exists ? "delete" : "skip (absent)"}`
    );
  }

  console.log(`  Resetting: analytics/dashboardCurrent`);
  if (EXECUTE) {
    await resetDashboardCurrentForSite(db, SITE_ID);
    console.log("    dashboardCurrent set to zeros + empty days + trafficSources");
  } else {
    console.log("    would call resetDashboardCurrentForSite(...)");
  }

  console.log("\n" + "=".repeat(70));
  if (EXECUTE) {
    console.log("  Done. Site document was NOT deleted.");
  } else {
    console.log("  DRY RUN complete. Run: npx tsx scripts/deepCleanSingleSite.ts --execute");
  }
  console.log("=".repeat(70) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
