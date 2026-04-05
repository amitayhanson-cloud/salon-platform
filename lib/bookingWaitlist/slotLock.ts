import type { Firestore } from "firebase-admin/firestore";
import admin from "firebase-admin";

const COLLECTION = "waitlistSlotLocks";

export function waitlistSlotLockDocId(dateYmd: string, timeHHmm: string, workerId: string | null): string {
  const t = timeHHmm.replace(/:/g, "");
  const w = workerId && String(workerId).trim() ? String(workerId).trim().replace(/\//g, "_") : "_open";
  return `${dateYmd}_${t}_${w}`.slice(0, 700);
}

export type WaitlistSlotLockDoc = {
  lockedUntil: { toMillis: () => number };
  offeredPhonesE164: string[];
  offeredEntryIds: string[];
  updatedAt: unknown;
};

export async function getSlotLockData(
  db: Firestore,
  siteId: string,
  lockId: string
): Promise<WaitlistSlotLockDoc | null> {
  const ref = db.collection("sites").doc(siteId).collection(COLLECTION).doc(lockId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return snap.data() as WaitlistSlotLockDoc;
}

export async function tryAcquireWaitlistSlotOffer(
  db: Firestore,
  siteId: string,
  lockId: string,
  params: {
    lockDurationMs: number;
    customerPhoneE164: string;
    entryId: string;
    bypassLock?: boolean;
  }
): Promise<{ ok: true } | { ok: false; reason: "locked" | "already_offered_this_phone" }> {
  const { lockDurationMs, customerPhoneE164, entryId, bypassLock } = params;
  const ref = db.collection("sites").doc(siteId).collection(COLLECTION).doc(lockId);
  const now = Date.now();
  const newUntil = admin.firestore.Timestamp.fromMillis(now + lockDurationMs);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as WaitlistSlotLockDoc) : null;
    const untilMs =
      data?.lockedUntil && typeof data.lockedUntil.toMillis === "function"
        ? data.lockedUntil.toMillis()
        : 0;
    const phones = Array.isArray(data?.offeredPhonesE164) ? [...data!.offeredPhonesE164] : [];
    const entries = Array.isArray(data?.offeredEntryIds) ? [...data!.offeredEntryIds] : [];

    if (phones.includes(customerPhoneE164)) {
      return { ok: false as const, reason: "already_offered_this_phone" as const };
    }

    if (!bypassLock && untilMs > now) {
      return { ok: false as const, reason: "locked" as const };
    }

    if (!phones.includes(customerPhoneE164)) phones.push(customerPhoneE164);
    if (!entries.includes(entryId)) entries.push(entryId);

    tx.set(
      ref,
      {
        lockedUntil: newUntil,
        offeredPhonesE164: phones,
        offeredEntryIds: entries,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true as const };
  });
}

/**
 * After a decline, release the time lock so the next waitlist candidate can be offered,
 * while keeping `offeredPhonesE164` so the same customer is not offered this slot again.
 */
export async function clearWaitlistSlotTimeLock(
  db: Firestore,
  siteId: string,
  lockId: string
): Promise<void> {
  const ref = db.collection("sites").doc(siteId).collection(COLLECTION).doc(lockId);
  await ref.set(
    {
      lockedUntil: admin.firestore.Timestamp.fromMillis(0),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** @deprecated Use clearWaitlistSlotTimeLock — extending lock blocked the next offer. */
export async function refreshLockAfterDecline(
  db: Firestore,
  siteId: string,
  lockId: string,
  _lockDurationMs: number
): Promise<void> {
  await clearWaitlistSlotTimeLock(db, siteId, lockId);
}

/** Undo a failed send after tryAcquire succeeded: drop lock window and remove this attempt from the lock doc. */
export async function rollbackWaitlistOfferAcquire(
  db: Firestore,
  siteId: string,
  lockId: string,
  customerPhoneE164: string,
  entryId: string
): Promise<void> {
  const ref = db.collection("sites").doc(siteId).collection(COLLECTION).doc(lockId);
  await ref.set(
    {
      lockedUntil: admin.firestore.Timestamp.fromMillis(0),
      offeredPhonesE164: admin.firestore.FieldValue.arrayRemove(customerPhoneE164),
      offeredEntryIds: admin.firestore.FieldValue.arrayRemove(entryId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
