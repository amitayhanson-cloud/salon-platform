/**
 * Booking → live-stats deltas for Cloud Functions (keep aligned with lib/liveStatsBookingDeltas.ts).
 */

const CANCELLED = new Set(["cancelled", "canceled", "cancelled_by_salon", "no_show"]);

import type { LiveStatsBookingEffect, LiveStatsDelta } from "./liveStatsScorekeeper";

function isCancelledStatus(s: string): boolean {
  return CANCELLED.has(s.toLowerCase());
}

export function isDocCancelled(data: Record<string, unknown>): boolean {
  const status = String((data.status as string) ?? "");
  const statusAtArchive = String((data.statusAtArchive as string) ?? "");
  const displayedStatus = String((data.displayedStatus as string) ?? "");
  return isCancelledStatus(status) || isCancelledStatus(statusAtArchive) || isCancelledStatus(displayedStatus);
}

function isFollowUpBooking(data: Record<string, unknown>): boolean {
  const v = data.parentBookingId;
  return v != null && String(v).trim() !== "";
}

function normalizeBookingYmd(data: Record<string, unknown>): string | null {
  const raw = String((data.dateISO as string) || (data.date as string) || "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function bookingYmdIsrael(data: Record<string, unknown>): string {
  const n = normalizeBookingYmd(data);
  return n ?? "";
}

function isRevenueEligible(data: Record<string, unknown>): boolean {
  if (isDocCancelled(data)) return false;
  const s = String((data.status as string) ?? "").trim().toLowerCase();
  return s === "completed" || s === "confirmed" || s === "active" || s === "booked";
}

function numericBookingPrice(data: Record<string, unknown>): number {
  const raw = data.price ?? data.priceApplied ?? data.finalPrice;
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

function durationMin(data: Record<string, unknown>): number {
  const dur = data.durationMin;
  return typeof dur === "number" && Number.isFinite(dur) ? Math.max(0, dur) : 60;
}

function sanitizeTrafficSourceKeyForFirestore(raw: string): string | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
  return s || null;
}

function resolveTrafficSourceKey(data: Record<string, unknown>): string | null {
  const candidates = [data.bookingTrafficSource, data.trafficSource, data.utm_source];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return sanitizeTrafficSourceKeyForFirestore(c);
    }
  }
  return null;
}

export function liveStatsDeltaForBookingCreated(data: Record<string, unknown>): LiveStatsBookingEffect | null {
  if (isDocCancelled(data)) return null;
  const ymd = bookingYmdIsrael(data);
  if (!ymd || ymd.length < 10) return null;

  const followUp = isFollowUpBooking(data);
  const dur = durationMin(data);
  const delta: LiveStatsDelta = { bookedMinutes: dur };
  let trafficSourceDeltas: Record<string, number> | undefined;

  if (!followUp) {
    delta.bookings = 1;
    const tk = resolveTrafficSourceKey(data);
    if (tk) {
      delta.trafficAttributedBookings = 1;
      trafficSourceDeltas = { [tk]: 1 };
    }
  }
  if (isRevenueEligible(data)) {
    const p = numericBookingPrice(data);
    if (p > 0) delta.revenue = p;
  }
  return { ymd, delta, trafficSourceDeltas };
}

export function liveStatsDeltaForActiveCancellation(data: Record<string, unknown>): LiveStatsBookingEffect | null {
  const created = liveStatsDeltaForBookingCreated(data);
  if (!created) return null;
  const delta: LiveStatsDelta = { cancellations: 1 };
  for (const [k, v] of Object.entries(created.delta)) {
    if (v == null || !Number.isFinite(v)) continue;
    (delta as Record<string, number>)[k] = -Number(v);
  }
  let trafficSourceDeltas: Record<string, number> | undefined;
  if (created.trafficSourceDeltas) {
    trafficSourceDeltas = {};
    for (const [k, v] of Object.entries(created.trafficSourceDeltas)) {
      trafficSourceDeltas[k] = -Number(v);
    }
  }
  return { ymd: created.ymd, delta, trafficSourceDeltas };
}

export function liveStatsDeltaUndoFollowUpOnly(data: Record<string, unknown>): LiveStatsBookingEffect | null {
  if (!isFollowUpBooking(data)) return null;
  const ymd = bookingYmdIsrael(data);
  if (!ymd || ymd.length < 10) return null;
  const dur = durationMin(data);
  const delta: LiveStatsDelta = { bookedMinutes: -dur };
  if (isRevenueEligible(data)) {
    const p = numericBookingPrice(data);
    if (p > 0) delta.revenue = -p;
  }
  return { ymd, delta };
}
