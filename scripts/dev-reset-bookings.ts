/**
 * Dev-only: reset all bookings and archived history for a site (optionally one client).
 * Uses Firebase Admin SDK directly (no API auth). Requires FIREBASE_SERVICE_ACCOUNT_JSON
 * or FIREBASE_SERVICE_ACCOUNT_PATH (or .env.local with FIREBASE_SERVICE_ACCOUNT_PATH).
 *
 * Usage:
 *   npm run dev-reset-bookings -- <siteId> [clientId] [--dry-run]
 *   npx tsx scripts/dev-reset-bookings.ts <siteId> [clientId] [--dry-run]
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { getAdminDb } from "../lib/firebaseAdmin";
import { devResetBookings, ARCHIVED_SERVICE_TYPES_COLLECTION } from "../lib/devResetBookings";

async function main() {
  const args = process.argv.slice(2);
  const siteId = args.find((a) => !a.startsWith("--"));
  const clientId = args.filter((a) => !a.startsWith("--"))[1];
  const dryRun = args.includes("--dry-run");

  if (!siteId) {
    console.error("Usage: npm run dev-reset-bookings -- <siteId> [clientId] [--dry-run]");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production") {
    console.error("This script is for development only. Refusing to run in production.");
    process.exit(1);
  }

  console.log("[dev-reset-bookings] Starting", {
    siteId,
    clientId: clientId || "(all clients)",
    dryRun,
  });

  const db = getAdminDb();
  const result = await devResetBookings(db, siteId, {
    clientId: clientId && clientId.trim() !== "" ? clientId.trim() : undefined,
    dryRun,
  });

  console.log("[dev-reset-bookings] Done", result);
  if (result.deletedByPath && Object.keys(result.deletedByPath).length > 0) {
    console.log("[dev-reset-bookings] Collection paths deleted (archivedServiceTypes):");
    for (const [path, count] of Object.entries(result.deletedByPath)) {
      console.log(`  ${path}  =>  ${count} doc(s)`);
    }
  }
  console.log("[dev-reset-bookings] Subcollection name used:", ARCHIVED_SERVICE_TYPES_COLLECTION);
  if (result.dryRun) {
    console.log("(dry run: no documents were deleted)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
