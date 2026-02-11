/**
 * Write cron invocation results to Firestore "cron_runs" (top-level) for observability.
 * Used by /api/cron/whatsapp-reminders and /api/cron/debug-reminder.
 */

import type { Firestore } from "firebase-admin/firestore";

export type CronRunPayload = {
  ranAt: unknown; // Firestore Timestamp
  env: string;
  route: string;
  ok: boolean;
  auth: "ok" | "forbidden";
  windowStartIso?: string;
  windowEndIso?: string;
  foundCount?: number;
  sentCount?: number;
  skippedCount?: number;
  errorMessage?: string | null;
};

export async function writeCronRun(
  db: Firestore,
  payload: Omit<CronRunPayload, "ranAt"> & { ranAt?: unknown }
): Promise<void> {
  const { Timestamp } = await import("firebase-admin/firestore");
  const doc = {
    ...payload,
    ranAt: payload.ranAt ?? Timestamp.now(),
  };
  await db.collection("cron_runs").add(doc);
}
