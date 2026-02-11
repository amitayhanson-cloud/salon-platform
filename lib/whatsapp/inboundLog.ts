/**
 * Persist inbound webhook receipt and status to Firestore whatsapp_inbound.
 * Doc id = MessageSid for idempotency (one reply per Twilio message).
 */

import admin from "firebase-admin";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();

export type InboundStatus =
  | "received"
  | "signature_failed"
  | "matched_yes"
  | "matched_no"
  | "no_match"
  | "no_booking"
  | "ambiguous"
  | "error"
  | "missing_index";

/** If doc exists and has processedAt, the message was already replied to (dedupe). */
export async function getInboundByMessageSid(messageSid: string): Promise<{
  processedAt: Timestamp | null;
  replyBody?: string;
} | null> {
  const db = getAdminDb();
  const snap = await db.collection("whatsapp_inbound").doc(messageSid).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  const processedAt =
    data.processedAt != null && data.processedAt instanceof Timestamp ? data.processedAt : null;
  return {
    processedAt,
    replyBody: data.replyBody as string | undefined,
  };
}

/** Atomically create doc if not exists. Returns true if we claimed (created), false if doc already existed. */
export async function tryClaimInbound(
  messageSid: string,
  params: { fromE164: string; to: string; body: string }
): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.collection("whatsapp_inbound").doc(messageSid);
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, {
      messageSid,
      fromE164: params.fromE164,
      to: params.to,
      body: params.body,
      createdAt: serverTimestamp(),
      status: "received",
    });
    return true;
  });
}

/** Write processed result and reply; call before sending so dedupe can skip send. */
export async function setInboundProcessed(
  docId: string,
  params: {
    resultStatus: string;
    replyBody?: string | null;
    bookingRef?: string | null;
    error?: string | null;
  }
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection("whatsapp_inbound").doc(docId);
  await ref.update({
    processedAt: serverTimestamp(),
    resultStatus: params.resultStatus,
    ...(params.replyBody != null && { replyBody: params.replyBody }),
    ...(params.bookingRef != null && { bookingRef: params.bookingRef }),
    ...(params.error != null && { error: params.error }),
    updatedAt: serverTimestamp(),
  });
}

/** One-off write for received state when MessageSid is missing (no dedupe). */
export async function writeInboundReceived(
  docId: string,
  params: { messageSid: string; fromE164: string; to: string; body: string }
): Promise<void> {
  const db = getAdminDb();
  await db.collection("whatsapp_inbound").doc(docId).set({
    messageSid: params.messageSid,
    fromE164: params.fromE164,
    to: params.to,
    body: params.body,
    createdAt: serverTimestamp(),
    status: "received",
  });
}

/** Write signature_failed (403 path); doc id = MessageSid. */
export async function writeInboundSignatureFailed(
  messageSid: string,
  params: { from: string; to: string; body: string }
): Promise<void> {
  const db = getAdminDb();
  await db.collection("whatsapp_inbound").doc(messageSid).set({
    messageSid,
    from: params.from,
    to: params.to,
    body: params.body,
    createdAt: serverTimestamp(),
    status: "signature_failed",
    errorMessage: "Invalid signature",
  });
}

/** Legacy: create doc by arbitrary id (e.g. for diagnostics). Prefer tryClaimInbound + setInboundProcessed. */
export async function createInboundDoc(params: {
  inboundId: string;
  from: string;
  to: string;
  body: string;
  messageSid: string;
  status: InboundStatus;
  errorMessage?: string | null;
}): Promise<void> {
  const db = getAdminDb();
  await db.collection("whatsapp_inbound").doc(params.inboundId).set({
    inboundId: params.inboundId,
    receivedAt: Timestamp.now(),
    from: params.from,
    to: params.to,
    body: params.body,
    messageSid: params.messageSid,
    status: params.status,
    ...(params.errorMessage != null && { errorMessage: params.errorMessage }),
  });
}

/** Legacy: update by doc id. Used for error path (status/errorCode/errorStack). */
export async function updateInboundDoc(
  docId: string,
  update: {
    status: InboundStatus;
    bookingRef?: string | null;
    errorMessage?: string | null;
    errorCode?: number | string | null;
    errorStack?: string | null;
  }
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection("whatsapp_inbound").doc(docId);
  const data: Record<string, unknown> = { ...update, updatedAt: Timestamp.now() };
  if (update.errorCode !== undefined) data.errorCode = update.errorCode;
  if (update.errorStack !== undefined) data.errorStack = update.errorStack;
  await ref.update(data);
}
