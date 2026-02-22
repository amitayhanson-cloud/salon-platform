/**
 * Shared booking cleanup core. Used by:
 * - POST /api/admin/run-booking-cleanup (manual / dev test)
 * - POST /api/admin/ensure-daily-cleanup (lazy daily trigger)
 *
 * Rules (must not change):
 * - Past bookings: archive with correct status (booked/confirmed/cancelled etc.)
 * - No duplicate archived entries (serviceType uniqueness)
 * - Follow-up bookings: delete only, do NOT archive
 * - Cancelled bookings: archived as cancelled → show on Cancelled Bookings page
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  runPastBookingsCleanup,
  type RunPastBookingsCleanupResult,
} from "@/lib/runPastBookingsCleanup";

export type RunBookingCleanupForSiteOptions = {
  /** YYYY-MM-DD for "start of today" in site TZ. Bookings with date < this are cleaned. */
  cutoffStartOfToday: string;
  dryRun?: boolean;
};

export type RunBookingCleanupResult = {
  scanned: number;
  deletedActive: number;
  archived: number;
  skippedFollowups: number;
  errors: number;
  minDate: string | null;
  maxDate: string | null;
};

/**
 * Run cleanup for all bookings before cutoff (start of today).
 * Reuses the same core logic as manual cleanup.
 */
export async function runBookingCleanupForSite(
  db: Firestore,
  siteId: string,
  options: RunBookingCleanupForSiteOptions
): Promise<RunBookingCleanupResult> {
  const { cutoffStartOfToday, dryRun = false } = options;

  const result: RunPastBookingsCleanupResult = await runPastBookingsCleanup(db, siteId, {
    siteTz: "Asia/Jerusalem",
    beforeDate: cutoffStartOfToday,
    dryRun,
  });

  return {
    scanned: result.scanned,
    deletedActive: result.deleted,
    archived: result.archived,
    skippedFollowups: result.skippedFollowups,
    errors: result.errors,
    minDate: result.minDate,
    maxDate: result.maxDate,
  };
}
