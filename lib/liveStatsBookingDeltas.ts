/**
 * Pure helpers: map booking documents to live-stats increments (Israel appointment day).
 */

import { isDocCancelled } from "@/lib/cancelledBookingShared";
import { isFollowUpBooking } from "@/lib/normalizeBooking";
import { bookingDayYmdIsrael } from "@/lib/bookingDayKey";
import type { LiveStatsBookingEffect, LiveStatsDelta } from "@/lib/liveStatsScorekeeper";

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

/** Safe map key for `trafficSources.{key}` (Firestore path segment). */
export function sanitizeTrafficSourceKeyForFirestore(raw: string): string | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
  return s || null;
}

/** Resolves attributed traffic from booking fields (bookingTrafficSource, trafficSource, utm_source). */
export function resolveTrafficSourceKey(data: Record<string, unknown>): string | null {
  const candidates = [data.bookingTrafficSource, data.trafficSource, data.utm_source];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return sanitizeTrafficSourceKeyForFirestore(c);
    }
  }
  return null;
}

/** Metrics added when an active (non-cancelled) booking doc is created. */
export function liveStatsDeltaForBookingCreated(data: Record<string, unknown>): LiveStatsBookingEffect | null {
  if (isDocCancelled(data)) return null;
  const ymd = bookingDayYmdIsrael(data);
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

/**
 * Undo what {@link liveStatsDeltaForBookingCreated} counted, and record one cancellation
 * (customer/admin cancel, archive-delete of an active booking).
 */
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

/** Undo create increments only (no cancellation) — mistaken permanent delete. */
export function liveStatsDeltaUndoCreatedOnly(data: Record<string, unknown>): LiveStatsBookingEffect | null {
  const created = liveStatsDeltaForBookingCreated(data);
  if (!created) return null;
  if (isDocCancelled(data)) return null;
  const delta: LiveStatsDelta = {};
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
  const hasMetrics = Object.keys(delta).length > 0;
  const hasTraffic = trafficSourceDeltas && Object.keys(trafficSourceDeltas).length > 0;
  return hasMetrics || hasTraffic ? { ymd: created.ymd, delta, trafficSourceDeltas } : null;
}

/** Follow-up doc removed: undo minutes + optional revenue only. */
export function liveStatsDeltaUndoFollowUpOnly(data: Record<string, unknown>): LiveStatsBookingEffect | null {
  if (!isFollowUpBooking(data)) return null;
  const ymd = bookingDayYmdIsrael(data);
  if (!ymd || ymd.length < 10) return null;
  const dur = durationMin(data);
  const delta: LiveStatsDelta = { bookedMinutes: -dur };
  if (isRevenueEligible(data)) {
    const p = numericBookingPrice(data);
    if (p > 0) delta.revenue = -p;
  }
  return { ymd, delta };
}
