/**
 * Run dedupe for one client (or all clients) in a site.
 * Usage: npx tsx scripts/dedupe-client-archived-bookings.ts <siteId> [clientId]
 * If clientId is omitted, dedupes all clients that have legacy archived bookings.
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getAdminDb } from "../lib/firebaseAdmin";
import {
  dedupeClientArchivedBookings,
  dedupeAllClientsArchivedBookings,
} from "../lib/dedupeArchivedBookings";

async function main() {
  const siteId = process.argv[2];
  const clientId = process.argv[3]; // optional

  if (!siteId) {
    console.error("Usage: npx tsx scripts/dedupe-client-archived-bookings.ts <siteId> [clientId]");
    process.exit(1);
  }

  const db = getAdminDb();

  if (clientId && clientId.trim() !== "") {
    const result = await dedupeClientArchivedBookings(db, siteId, clientId.trim());
    console.log("Result:", result);
    return;
  }

  const result = await dedupeAllClientsArchivedBookings(db, siteId);
  console.log("Result:", result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
