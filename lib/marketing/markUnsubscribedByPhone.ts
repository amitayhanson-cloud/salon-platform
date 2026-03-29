/**
 * Platform-wide marketing opt-out: users, all site clients matching phone, waitlist leads.
 * Used by WhatsApp webhook and public /unsubscribe flow.
 */

import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { markWaitlistLeadsOptedOutByPhone } from "@/lib/waitlist/markWaitlistOptOut";

/**
 * Sets isSubscribed: false on matching users + collectionGroup clients; waitlist optedOut.
 * @returns approximate count of user+client docs touched (waitlist counted separately in logs).
 */
export async function markUnsubscribedByPhone(phoneE164: string): Promise<number> {
  const db = getAdminDb();
  let updated = 0;
  const now = Timestamp.now();
  const candidates = [phoneE164, phoneE164.replace(/^\+/, "")].filter(Boolean);
  const userSnaps = await Promise.all(
    candidates.map((p) => db.collection("users").where("phone", "==", p).limit(50).get())
  );
  for (const snap of userSnaps) {
    for (const doc of snap.docs) {
      await doc.ref.set({ isSubscribed: false, updatedAt: now }, { merge: true });
      updated += 1;
    }
  }

  const clientFieldQueries = [
    db.collectionGroup("clients").where("phone", "==", phoneE164).limit(200).get(),
    db.collectionGroup("clients").where("customerPhone", "==", phoneE164).limit(200).get(),
    db.collectionGroup("clients").where("customerPhoneE164", "==", phoneE164).limit(200).get(),
  ];
  const clientSnaps = await Promise.allSettled(clientFieldQueries);
  for (const res of clientSnaps) {
    if (res.status !== "fulfilled") continue;
    for (const doc of res.value.docs) {
      await doc.ref.set({ isSubscribed: false, updatedAt: now }, { merge: true });
      updated += 1;
    }
  }

  try {
    await markWaitlistLeadsOptedOutByPhone(phoneE164);
  } catch (e) {
    console.error("[marketingOptOut] waitlist_leads_opt_out_failed", e);
  }

  return updated;
}
