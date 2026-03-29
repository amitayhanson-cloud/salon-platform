/**
 * Mark waitlistLeads opted out when user sends "הסר אותי מהרשימה" (e.g. broadcast quick reply).
 * Doc id from submit: waitlist_${phone} with various phone formats.
 */

import { Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeE164 } from "@/lib/whatsapp/e164";

export async function markWaitlistLeadsOptedOutByPhone(rawPhone: string): Promise<number> {
  const e164 = normalizeE164(rawPhone.replace(/^whatsapp:/, ""), "IL");
  if (!e164) return 0;
  const stripped = e164.replace(/^\+/, "");
  const phoneVariants = Array.from(
    new Set([e164, stripped, `+${stripped}`].filter(Boolean))
  );
  const db = getAdminDb();
  const now = Timestamp.now();
  const toUpdate = new Map<string, DocumentReference>();

  for (const p of phoneVariants) {
    const ref = db.collection("waitlistLeads").doc(`waitlist_${p}`);
    const snap = await ref.get();
    if (snap.exists) toUpdate.set(ref.path, ref);
  }

  for (const p of phoneVariants) {
    const q = await db.collection("waitlistLeads").where("phone", "==", p).limit(25).get();
    for (const doc of q.docs) toUpdate.set(doc.ref.path, doc.ref);
  }

  for (const ref of toUpdate.values()) {
    await ref.set(
      { optedOut: true, optedOutAt: now, updatedAt: now },
      { merge: true }
    );
  }

  return toUpdate.size;
}
