/**
 * DEV-ONLY: Wipe ALL bookings and client history for a site.
 * Uses Firebase Admin SDK. Requires FIREBASE_SERVICE_ACCOUNT_* or FIREBASE_SERVICE_ACCOUNT_PATH.
 *
 * Safety: Refuses to run unless NODE_ENV=development OR DEV_RESET_SECRET env var is set.
 * Refuses to run when FIRESTORE_EMULATOR_HOST is set unless --allow-emulator is passed.
 *
 * Usage:
 *   npm run dev-reset-site -- <siteId> [--dry-run] [--allow-emulator] [--booking-doc-id <id>] [--probe-booking <docId>]
 *   With --probe-booking: only read and log one booking doc (no delete). Example:
 *   npm run dev-reset-site -- <siteId> --probe-booking <docId>
 */

import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

function isDevResetAllowed(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.DEV_RESET_SECRET) return true;
  return false;
}

function parseArgs(): {
  siteId: string;
  dryRun: boolean;
  allowEmulator: boolean;
  bookingDocId: string | null;
  probeBookingId: string | null;
} {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const allowEmulator = argv.includes("--allow-emulator");
  const bookingDocIdIdx = argv.indexOf("--booking-doc-id");
  const bookingDocId =
    bookingDocIdIdx >= 0 && argv[bookingDocIdIdx + 1]
      ? String(argv[bookingDocIdIdx + 1]).trim()
      : null;
  const probeBookingIdx = argv.indexOf("--probe-booking");
  const probeBookingId =
    probeBookingIdx >= 0 && argv[probeBookingIdx + 1]
      ? String(argv[probeBookingIdx + 1]).trim()
      : null;
  const skipPositional = (a: string) =>
    (bookingDocIdIdx >= 0 && a === argv[bookingDocIdIdx + 1]) ||
    (probeBookingIdx >= 0 && a === argv[probeBookingIdx + 1]);
  const positionals = argv.filter((a) => !a.startsWith("--") && !skipPositional(a));
  const siteId = positionals[0]?.trim() ?? "";
  return { siteId, dryRun, allowEmulator, bookingDocId, probeBookingId };
}

async function main() {
  const { siteId, dryRun, allowEmulator, bookingDocId, probeBookingId } = parseArgs();

  if (!siteId) {
    console.error(
      "Usage: npm run dev-reset-site -- <siteId> [--dry-run] [--allow-emulator] [--booking-doc-id <id>] [--probe-booking <docId>]"
    );
    process.exit(1);
  }

  if (!isDevResetAllowed()) {
    console.error(
      "Refusing to run: dev reset is only allowed when NODE_ENV=development or DEV_RESET_SECRET is set."
    );
    process.exit(1);
  }

  // Emulator: refuse to run against emulator unless explicitly allowed (avoids wiping emulator by mistake)
  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  console.log("[dev-reset-site] FIRESTORE_EMULATOR_HOST:", firestoreEmulator ?? "(not set)");
  console.log("[dev-reset-site] FIREBASE_AUTH_EMULATOR_HOST:", authEmulator ?? "(not set)");

  if (firestoreEmulator && !allowEmulator) {
    console.error(
      "[dev-reset-site] FIRESTORE_EMULATOR_HOST is set. Refusing to run (would target emulator, not production). Pass --allow-emulator to run against the emulator."
    );
    process.exit(1);
  }

  // Force production Firestore when not using emulator: unset emulator env so Admin SDK connects to prod
  if (!allowEmulator) {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  }

  const { getAdminDb, getAdminProjectId } = await import("../lib/firebaseAdmin");
  const db = getAdminDb();

  // Log Firestore connection (projectId, databaseId, and settings snapshot for emulator detection)
  const projectId = (db as { projectId?: string }).projectId ?? getAdminProjectId() ?? "unknown";
  const databaseId = (db as { databaseId?: string }).databaseId ?? "(default)";
  console.log("[dev-reset-site] Firestore projectId:", projectId);
  console.log("[dev-reset-site] Firestore databaseId:", databaseId);
  const settings = (db as { _settings?: { host?: string; ssl?: boolean } })._settings;
  if (settings && typeof settings === "object") {
    console.log("[dev-reset-site] Firestore _settings (host/ssl):", {
      host: settings.host ?? "(default)",
      ssl: settings.ssl,
    });
  }

  // Diagnostic: getDoc on optional booking doc
  if (bookingDocId) {
    const bookingRef = db.collection("sites").doc(siteId).collection("bookings").doc(bookingDocId);
    const snap = await bookingRef.get();
    console.log("[dev-reset-site] getDoc(sites/" + siteId + "/bookings/" + bookingDocId + ") exists:", snap.exists);
  }

  // Diagnostic: list one booking and one client
  const oneBookingSnap = await db.collection("sites").doc(siteId).collection("bookings").limit(1).get();
  const firstBookingId = oneBookingSnap.empty ? null : oneBookingSnap.docs[0].id;
  console.log("[dev-reset-site] list one booking (limit 1):", firstBookingId ?? "(none)");

  const oneClientSnap = await db.collection("sites").doc(siteId).collection("clients").limit(1).get();
  const firstClientId = oneClientSnap.empty ? null : oneClientSnap.docs[0].id;
  console.log("[dev-reset-site] list one client (limit 1):", firstClientId ?? "(none)");

  // Probe mode: read one known booking doc and exit (no delete)
  if (probeBookingId) {
    const ref = db.doc(`sites/${siteId}/bookings/${probeBookingId}`);
    const snap = await ref.get();
    console.log("[probe] booking path:", ref.path);
    console.log("[probe] booking exists:", snap.exists);
    if (snap.exists) {
      console.log("[probe] booking keys:", Object.keys(snap.data() ?? {}));
    }
    return;
  }

  console.log("[dev-reset-site] Starting reset", { siteId, dryRun });

  const { devResetSite } = await import("../lib/devResetSite");
  const result = await devResetSite(db, siteId, { dryRun });

  console.log("[dev-reset-site] Done", result);
  if (result.dryRun) {
    console.log("(dry run: no documents were deleted)");
  }
  if (
    !result.dryRun &&
    result.deletedBookings === 0 &&
    result.deletedClientsScanned === 0
  ) {
    console.log(
      "[dev-reset-site] Tip: If you expected docs to be deleted, ensure FIREBASE_SERVICE_ACCOUNT_* (or FIREBASE_SERVICE_ACCOUNT_PATH) points to the same Firebase project where the data lives (see projectId in logs above)."
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
