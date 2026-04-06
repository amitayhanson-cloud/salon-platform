/**
 * When a customer gets a real booking, mark matching waitlist rows as `booked` so they drop off the queue.
 * Matches by normalized phone + calendar day (same as waitlist join). Skips phase-2 docs and cancelled bookings.
 */

import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { getBookingPhoneE164 } from "@/lib/whatsapp/getBookingPhone";

const TERMINAL = new Set(["cancelled", "canceled", "declined", "expired_offer"]);

function bookingDateYmd(data: Record<string, unknown>): string | null {
  const raw = String(data.dateISO ?? data.date ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function waitlistPreferredYmd(entry: Record<string, unknown>): string | null {
  const raw = String(entry.preferredDateYmd ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function entryMatchesBookingDay(entry: Record<string, unknown>, bookingYmd: string): boolean {
  const pref = waitlistPreferredYmd(entry);
  if (!pref) return true;
  return pref === bookingYmd;
}

/**
 * Call after a phase-1 (or single) booking doc is written. Idempotent for waitlist-accept flow (already `booked`).
 */
export async function markWaitlistEntriesBookedForNewBooking(
  db: Firestore,
  siteId: string,
  bookingId: string,
  bookingData: Record<string, unknown>
): Promise<void> {
  const status = String(bookingData.status ?? "").toLowerCase();
  if (TERMINAL.has(status)) return;

  const phase = bookingData.phase;
  if (phase === 2) return;
  const parentId = bookingData.parentBookingId != null ? String(bookingData.parentBookingId).trim() : "";
  if (parentId) return;

  const dateYmd = bookingDateYmd(bookingData);
  if (!dateYmd) return;

  const phoneResult = getBookingPhoneE164(bookingData, "IL");
  if ("error" in phoneResult) return;

  const e164 = phoneResult.e164;
  const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");
  const snap = await col.where("customerPhoneE164", "==", e164).limit(120).get();
  if (snap.empty) return;

  const batch = db.batch();
  let n = 0;

  for (const doc of snap.docs) {
    const entry = doc.data() as Record<string, unknown>;
    const st = String(entry.status ?? "").toLowerCase();
    if (st === "booked" && String(entry.bookedBookingId ?? "") === bookingId) continue;
    if (st === "booked") continue;
    if (TERMINAL.has(st)) continue;
    if (!entryMatchesBookingDay(entry, dateYmd)) continue;

    batch.update(doc.ref, {
      status: "booked",
      bookedBookingId: bookingId,
      offer: admin.firestore.FieldValue.delete(),
      offerSentAt: admin.firestore.FieldValue.delete(),
      offerExpiresAt: admin.firestore.FieldValue.delete(),
      offerWebConfirmToken: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    n++;
    if (n >= 400) break;
  }

  if (n > 0) {
    await batch.commit();
  }
}
