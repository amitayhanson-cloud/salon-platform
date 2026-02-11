/**
 * Persist inbound webhook receipt and status to Firestore whatsapp_inbound for production diagnostics.
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export type InboundStatus =
  | "received"
  | "signature_failed"
  | "matched_yes"
  | "matched_no"
  | "no_match"
  | "no_booking"
  | "ambiguous"
  | "error";

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

export async function updateInboundDoc(
  inboundId: string,
  update: {
    status: InboundStatus;
    bookingRef?: string | null;
    errorMessage?: string | null;
  }
): Promise<void> {
  const db = getAdminDb();
  const ref = db.collection("whatsapp_inbound").doc(inboundId);
  await ref.update({
    ...update,
    updatedAt: Timestamp.now(),
  });
}
