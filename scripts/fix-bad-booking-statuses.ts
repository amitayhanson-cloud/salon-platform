/**
 * One-time dev script: fix bookings that have whatsappStatus === "awaiting_confirmation"
 * but incorrectly have status === "confirmed". Sets status to "booked" so reminder flow
 * never leaves status as confirmed.
 *
 * Usage (dev only):
 *   NODE_ENV=development npx tsx scripts/fix-bad-booking-statuses.ts --fix-bad-statuses
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON (or split env vars).
 */

import admin from "firebase-admin";
import { getAdminDb } from "../lib/firebaseAdmin";

const FLAG = "--fix-bad-statuses";
const BATCH_SIZE = 400;

async function main() {
  if (process.env.NODE_ENV !== "development") {
    console.error("This script may only run in NODE_ENV=development.");
    process.exit(1);
  }
  if (!process.argv.includes(FLAG)) {
    console.error("Usage: NODE_ENV=development npx tsx scripts/fix-bad-booking-statuses.ts --fix-bad-statuses");
    process.exit(1);
  }

  const db = getAdminDb();
  const snapshot = await db
    .collectionGroup("bookings")
    .where("whatsappStatus", "==", "awaiting_confirmation")
    .get();

  const toFix: { ref: admin.firestore.DocumentReference; id: string; siteId: string }[] = [];
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const status = (data.status as string) ?? "";
    if (status.trim().toLowerCase() === "confirmed") {
      const siteId = doc.ref.parent?.parent?.id ?? "";
      toFix.push({ ref: doc.ref, id: doc.id, siteId });
    }
  });

  console.log("[fix-bad-statuses] Found", toFix.length, "bookings with whatsappStatus=awaiting_confirmation and status=confirmed");

  if (toFix.length === 0) {
    console.log("[fix-bad-statuses] Nothing to fix.");
    return;
  }

  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toFix.slice(i, i + BATCH_SIZE);
    for (const { ref } of chunk) {
      batch.update(ref, { status: "booked", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    }
    await batch.commit();
    console.log("[fix-bad-statuses] Updated", chunk.length, "docs (batch)", Math.floor(i / BATCH_SIZE) + 1);
  }

  console.log("[fix-bad-statuses] Done. Fixed", toFix.length, "bookings.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
