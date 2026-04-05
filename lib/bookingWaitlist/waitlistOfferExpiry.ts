/**
 * Shared expiry rules for waitlist slot offers (aligned with {@link WAITLIST_OFFER_TTL_MS}).
 */

import admin from "firebase-admin";
import type { BookingWaitlistEntry } from "@/types/bookingWaitlist";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { offerSlotToFreedSlot } from "./matchService";
import { clearWaitlistSlotTimeLock, waitlistSlotLockDocId } from "./slotLock";
import { triggerWaitlistMatchForFreedSlot } from "./triggerWaitlistMatch";
import { WAITLIST_OFFER_TTL_MS } from "./waitlistOfferConstants";

export { WAITLIST_EXPIRED_BODY_LINE1, WAITLIST_EXPIRED_CTA_LINE, WAITLIST_EXPIRED_CUSTOMER_HE } from "./waitlistOfferMessages";
import { isWaitlistPendingOfferStatus } from "./waitlistStatus";

function tsToMillis(ts: unknown): number | null {
  if (ts != null && typeof (ts as { toMillis?: () => number }).toMillis === "function") {
    return (ts as { toMillis: () => number }).toMillis();
  }
  return null;
}

/** True if the offer must be treated as expired (do not book). */
export function isWaitlistEntryOfferExpired(entry: BookingWaitlistEntry, nowMs = Date.now()): boolean {
  const exp = tsToMillis(entry.offerExpiresAt);
  if (exp != null && exp < nowMs) return true;
  const sent = tsToMillis(entry.offerSentAt);
  if (sent != null && sent + WAITLIST_OFFER_TTL_MS < nowMs) return true;
  if (sent == null && exp == null) return true;
  return false;
}

/** Mark entry expired, clear lock, offer next waitlist person the same slot window. */
export async function expireWaitlistOfferAndRematch(
  siteId: string,
  docId: string,
  entry: BookingWaitlistEntry
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries").doc(docId);
  const offer = entry.offer;

  await ref.update({
    status: "expired_offer",
    offer: admin.firestore.FieldValue.delete(),
    offerSentAt: admin.firestore.FieldValue.delete(),
    offerExpiresAt: admin.firestore.FieldValue.delete(),
    offerWebConfirmToken: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (offer) {
    const lockId = waitlistSlotLockDocId(offer.dateYmd, offer.timeHHmm, offer.workerId ?? null);
    try {
      await clearWaitlistSlotTimeLock(db, siteId, lockId);
    } catch (e) {
      console.error("[waitlistOfferExpiry] clear slot lock failed", e);
    }
    try {
      await triggerWaitlistMatchForFreedSlot(siteId, offerSlotToFreedSlot(offer), {
        skipEntryIds: [docId],
      });
    } catch (e) {
      console.error("[waitlistOfferExpiry] rematch after expiry failed", e);
    }
  }
}

/**
 * Cron: expire pending offers past TTL and re-run waitlist matching for the freed slot.
 */
export async function runWaitlistExpiredOfferSweep(): Promise<{ expiredCount: number }> {
  const db = getAdminDb();
  let expiredCount = 0;
  const sitesSnap = await db.collection("sites").get();
  for (const siteDoc of sitesSnap.docs) {
    const siteId = siteDoc.id;
    const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");
    for (const status of ["pending_offer", "notified"] as const) {
      let snap;
      try {
        snap = await col.where("status", "==", status).limit(400).get();
      } catch {
        continue;
      }
      for (const doc of snap.docs) {
        const entry = doc.data() as BookingWaitlistEntry;
        if (!isWaitlistPendingOfferStatus(entry.status) || !entry.offer) continue;
        if (!isWaitlistEntryOfferExpired(entry)) continue;
        await expireWaitlistOfferAndRematch(siteId, doc.id, entry);
        expiredCount++;
      }
    }
  }
  return { expiredCount };
}
