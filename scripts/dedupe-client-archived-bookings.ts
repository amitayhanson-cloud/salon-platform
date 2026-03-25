/**
 * Run dedupe for one client (or all clients) in a site.
 * Usage: npx tsx scripts/dedupe-client-archived-bookings.ts <siteId> [clientId]
 * If clientId is omitted, dedupes all clients that have legacy archived bookings
 * and dedupes archivedServiceTypes for every client doc.
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { getAdminDb } from "../lib/firebaseAdmin";
import {
  dedupeClientArchivedBookings,
  dedupeAllClientsArchivedBookings,
  dedupeArchivedServiceTypesSubcollectionForClient,
  dedupeArchivedServiceTypesForSite,
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
    const cid = clientId.trim();
    const legacy = await dedupeClientArchivedBookings(db, siteId, cid);
    const archived = await dedupeArchivedServiceTypesSubcollectionForClient(db, siteId, cid);
    console.log("Result:", { legacy, archivedSubcollection: archived });
    return;
  }

  const legacy = await dedupeAllClientsArchivedBookings(db, siteId);
  const archived = await dedupeArchivedServiceTypesForSite(db, siteId);
  console.log("Result:", { legacy, archivedSubcollection: archived });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
