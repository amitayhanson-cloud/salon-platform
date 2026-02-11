/**
 * POST /api/cron/whatsapp-reminders
 * 24-hour reminder job for external scheduler (e.g. cron-job.org).
 * Protected by query param only: ?secret=CRON_SECRET (no Authorization header).
 *
 * Window: startAt in [now+24h-60min, now+24h+60min). Idempotent: only sends when
 * whatsappStatus === "booked" and reminder24hSentAt is null/missing.
 *
 * Every invocation writes to Firestore cron_runs for observability.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { runReminders } from "@/lib/whatsapp/runReminders";
import { writeCronRun } from "@/lib/cronRuns";
import { validateCronEnv } from "@/lib/whatsapp/validateCronEnv";

export const maxDuration = 60;

const ROUTE = "/api/cron/whatsapp-reminders";

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST with ?secret=CRON_SECRET" },
    { status: 405 }
  );
}

function isIndexRequiredError(e: unknown): boolean {
  const code = (e as { code?: number }).code;
  const message = (e as { message?: string }).message ?? "";
  return code === 9 || message.includes("FAILED_PRECONDITION") || message.includes("requires an index");
}

function getEnvLabel(): string {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
}

export async function POST(request: NextRequest) {
  const env = getEnvLabel();
  const secretParam = request.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET?.trim();

  let db: ReturnType<typeof getAdminDb>;
  try {
    db = getAdminDb();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        auth: "ok",
        env,
        route: ROUTE,
        error: "Firebase Admin not available",
        errorMessage: msg,
      },
      { status: 500 }
    );
  }

  const envCheck = validateCronEnv();
  if (!envCheck.ok) {
    try {
      await writeCronRun(db, {
        env,
        route: ROUTE,
        ok: false,
        auth: "ok",
        errorMessage: envCheck.error,
      });
    } catch {
      // ignore
    }
    return NextResponse.json(
      {
        ok: false,
        auth: "ok",
        env,
        route: ROUTE,
        error: envCheck.error,
        errorMessage: envCheck.error,
      },
      { status: 500 }
    );
  }

  const authOk = !!(expectedSecret && secretParam === expectedSecret);
  if (!authOk) {
    try {
      await writeCronRun(db, {
        env,
        route: ROUTE,
        ok: false,
        auth: "forbidden",
        errorMessage: "secret query param missing or invalid",
      });
    } catch {
      // ignore write failure
    }
    return NextResponse.json(
      { ok: false, auth: "forbidden", env, route: ROUTE, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const result = await runReminders(db);

    const payload = {
      ok: true,
      auth: "ok" as const,
      env,
      route: ROUTE,
      windowStartIso: result.windowStart,
      windowEndIso: result.windowEnd,
      foundCount: result.bookingCount,
      sentCount: result.sent,
      skippedCount: result.skippedCount,
      errorMessage: result.errors > 0 ? `${result.errors} send error(s)` : null,
    };

    try {
      await writeCronRun(db, payload);
    } catch {
      // log but don't fail response
    }

    return NextResponse.json({
      ...payload,
      serverNow: result.serverNow,
      windowStart: result.windowStart,
      windowEnd: result.windowEnd,
      bookingCount: result.bookingCount,
      sent: result.sent,
      errors: result.errors,
      details: result.details,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const indexHint = isIndexRequiredError(e)
      ? "Create the composite index for collectionGroup('bookings'): whatsappStatus (ASC), startAt (ASC). See docs/WHATSAPP_TWILIO.md and run: firebase deploy --only firestore:indexes"
      : null;

    try {
      await writeCronRun(db, {
        env,
        route: ROUTE,
        ok: false,
        auth: "ok",
        errorMessage: indexHint ?? message,
      });
    } catch {
      // ignore
    }

    if (isIndexRequiredError(e)) {
      return NextResponse.json(
        {
          ok: false,
          auth: "ok",
          env,
          route: ROUTE,
          error: "Firestore index required",
          errorMessage: indexHint ?? message,
          hint: indexHint,
          original: message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        auth: "ok",
        env,
        route: ROUTE,
        error: message,
        errorMessage: message,
      },
      { status: 500 }
    );
  }
}
