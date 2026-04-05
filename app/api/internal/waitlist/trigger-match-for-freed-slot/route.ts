/**
 * POST /api/internal/waitlist/trigger-match-for-freed-slot
 * Secured by `x-caleno-waitlist-secret` — used by Cloud Functions after waitlist offer expiry.
 */

import { NextResponse } from "next/server";
import type { FreedBookingSlot } from "@/lib/bookingWaitlist/matchService";
import { triggerWaitlistMatchForFreedSlot } from "@/lib/bookingWaitlist/triggerWaitlistMatch";

function parseFreedSlot(raw: unknown): FreedBookingSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const dateYmd = typeof o.dateYmd === "string" ? o.dateYmd.trim() : "";
  const timeHHmm = typeof o.timeHHmm === "string" ? o.timeHHmm.trim() : "";
  const serviceName = typeof o.serviceName === "string" ? o.serviceName : "";
  if (!dateYmd || !timeHHmm || !serviceName) return null;
  const primaryDurationMin = Math.max(1, Math.round(Number(o.primaryDurationMin ?? o.durationMin ?? 60)));
  const w = o.workerId;
  const workerId = w != null && String(w).trim() !== "" ? String(w).trim() : null;
  const fw = o.followUpWorkerId;
  const followUpWorkerId =
    fw != null && String(fw).trim() !== "" ? String(fw).trim() : null;
  return {
    dateYmd,
    timeHHmm,
    workerId,
    workerName: typeof o.workerName === "string" ? o.workerName : null,
    serviceTypeId: typeof o.serviceTypeId === "string" && o.serviceTypeId.trim() ? o.serviceTypeId.trim() : null,
    serviceId: typeof o.serviceId === "string" && o.serviceId.trim() ? o.serviceId.trim() : null,
    serviceName,
    durationMin: primaryDurationMin,
    primaryDurationMin,
    waitMinutes: Math.max(0, Math.round(Number(o.waitMinutes ?? 0))),
    followUpDurationMin: Math.max(0, Math.round(Number(o.followUpDurationMin ?? 0))),
    followUpWorkerId,
    followUpWorkerName: typeof o.followUpWorkerName === "string" ? o.followUpWorkerName : null,
    followUpServiceName:
      o.followUpServiceName != null && String(o.followUpServiceName).trim() !== ""
        ? String(o.followUpServiceName).trim()
        : null,
  };
}

export async function POST(request: Request) {
  const expected = process.env.CALENO_WAITLIST_INTERNAL_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const secret = request.headers.get("x-caleno-waitlist-secret")?.trim();
  if (secret !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    siteId?: string;
    slot?: unknown;
    skipEntryIds?: string[];
  } | null;
  const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : "";
  const slot = parseFreedSlot(body?.slot);
  const skipEntryIds = Array.isArray(body?.skipEntryIds)
    ? body!.skipEntryIds!.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];

  if (!siteId || !slot) {
    return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 });
  }

  try {
    const r = await triggerWaitlistMatchForFreedSlot(siteId, slot, {
      skipEntryIds: skipEntryIds.length ? skipEntryIds : undefined,
    });
    return NextResponse.json({
      ok: true,
      notified: r.notified,
      entryId: r.entryId ?? null,
      reason: r.reason ?? null,
    });
  } catch (e) {
    console.error("[internal/waitlist/trigger-match-for-freed-slot]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
