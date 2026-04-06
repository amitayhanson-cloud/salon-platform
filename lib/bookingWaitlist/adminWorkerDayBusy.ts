/**
 * Worker busy intervals for waitlist / horizon scan — aligned with {@link getWorkerBusyIntervals} /
 * {@link toPhaseEvents}: phase 1 + 2 hands only, excludes cancelled/archived.
 * Loads all bookings for the calendar day (not worker-filtered query) so phase-2-only appearances
 * on a worker are not missed when the Firestore doc `workerId` is the primary stylist.
 */

import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { fromZonedTime } from "date-fns-tz";

import { toPhaseEvents, type BookingLike } from "@/lib/bookingPhases";
import type { BreakRange } from "@/types/bookingSettings";

import { normalizeBookingTimeHHmm } from "./bookingDocToFreedSlot";
import { mergeBusyIntervalsMs, siteDayWallBoundsUtcMs, type BusyIntervalMs } from "./matchService";

/**
 * Map a Firestore booking doc (admin SDK) to {@link BookingLike} for {@link toPhaseEvents}.
 */
export function adminFirestoreDocToBookingLike(
  docId: string,
  data: Record<string, unknown>
): BookingLike | null {
  if (data.isArchived === true) return null;
  const st = String(data.status ?? "").toLowerCase();
  if (st === "cancelled" || st === "canceled") return null;

  const workerId = data.workerId != null ? String(data.workerId).trim() : "";

  const timeHHmmRaw = normalizeBookingTimeHHmm(data.timeHHmm ?? data.time);

  return {
    id: docId,
    workerId: workerId || undefined,
    secondaryWorkerId:
      data.secondaryWorkerId != null ? String(data.secondaryWorkerId).trim() : undefined,
    date: data.date != null ? String(data.date).slice(0, 10) : undefined,
    time: data.time != null ? String(data.time) : undefined,
    timeHHmm: timeHHmmRaw ?? undefined,
    durationMin: typeof data.durationMin === "number" ? data.durationMin : undefined,
    primaryDurationMin: typeof data.primaryDurationMin === "number" ? data.primaryDurationMin : undefined,
    waitMinutes: typeof data.waitMinutes === "number" ? data.waitMinutes : undefined,
    waitMin: typeof data.waitMin === "number" ? data.waitMin : undefined,
    secondaryDurationMin:
      typeof data.secondaryDurationMin === "number" ? data.secondaryDurationMin : undefined,
    hasSecondary: data.hasSecondary === true,
    customerName: data.customerName != null ? String(data.customerName) : undefined,
    clientName: data.clientName != null ? String(data.clientName) : undefined,
    serviceName: data.serviceName != null ? String(data.serviceName) : undefined,
    status: data.status != null ? String(data.status) : undefined,
    serviceColor: data.serviceColor as string | null | undefined,
    clientId: data.clientId != null ? String(data.clientId) : undefined,
    phase: typeof data.phase === "number" ? (data.phase as 1 | 2) : undefined,
    parentBookingId: data.parentBookingId != null ? String(data.parentBookingId) : null,
    startAt: data.startAt as BookingLike["startAt"],
    endAt: data.endAt as BookingLike["endAt"],
    start: data.start as BookingLike["start"],
    end: data.end as BookingLike["end"],
    followUpStartAt: data.followUpStartAt as BookingLike["followUpStartAt"],
    followUpEndAt: data.followUpEndAt as BookingLike["followUpEndAt"],
    followUpWorkerId: data.followUpWorkerId != null ? String(data.followUpWorkerId) : null,
    secondaryStartAt: data.secondaryStartAt as BookingLike["secondaryStartAt"],
    secondaryEndAt: data.secondaryEndAt as BookingLike["secondaryEndAt"],
    phases: data.phases as BookingLike["phases"] | undefined,
  };
}

/** All booking docs for a site calendar day (same queries as legacy waitlist, higher limit for multi-worker days). */
export async function fetchSiteDayBookingDocsAdmin(
  db: Firestore,
  siteId: string,
  dateYmd: string
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const col = db.collection("sites").doc(siteId).collection("bookings");
  const mapDocs = (docs: QueryDocumentSnapshot[]) =>
    docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));

  try {
    const snap = await col.where("date", "==", dateYmd).limit(600).get();
    return mapDocs(snap.docs);
  } catch {
    try {
      const snap = await col.where("dateISO", "==", dateYmd).limit(600).get();
      return mapDocs(snap.docs);
    } catch {
      return [];
    }
  }
}

function breaksToBusyUtcMs(
  dateYmd: string,
  breaks: BreakRange[] | undefined,
  siteTz: string
): BusyIntervalMs[] {
  if (!breaks?.length) return [];
  const out: BusyIntervalMs[] = [];
  for (const br of breaks) {
    const start = String(br.start ?? "").trim();
    const end = String(br.end ?? "").trim();
    if (!start || !end) continue;
    const hs = start.length >= 5 ? start.slice(0, 5) : start;
    const he = end.length >= 5 ? end.slice(0, 5) : end;
    try {
      const sm = fromZonedTime(`${dateYmd}T${hs}:00`, siteTz).getTime();
      const em = fromZonedTime(`${dateYmd}T${he}:00`, siteTz).getTime();
      if (em > sm) out.push({ startMs: sm, endMsExclusive: em });
    } catch {
      continue;
    }
  }
  return mergeBusyIntervalsMs(out);
}

/**
 * Merge salon lunch/break windows into worker busy (same as manual booking: no offers during breaks).
 */
export function mergeBusyWithSalonBreaks(
  busy: BusyIntervalMs[],
  dateYmd: string,
  siteTz: string,
  day: Pick<{ breaks?: BreakRange[] }, "breaks">
): BusyIntervalMs[] {
  const b = breaksToBusyUtcMs(dateYmd, day.breaks, siteTz);
  if (b.length === 0) return busy;
  return mergeBusyIntervalsMs([...busy, ...b]);
}

/**
 * Busy UTC intervals for `workerId` on `dateYmd`, from all day bookings (phase-aware) clipped to the site day.
 */
export function workerPhaseBusyIntervalsUtcMsForDay(
  bookingDocs: Array<{ id: string; data: Record<string, unknown> }>,
  workerId: string,
  dateYmd: string,
  siteTz: string
): BusyIntervalMs[] {
  const bounds = siteDayWallBoundsUtcMs(dateYmd, siteTz);
  if (!bounds) return [];
  const wid = workerId.trim();
  if (!wid) return [];

  const raw: BusyIntervalMs[] = [];
  for (const { id, data } of bookingDocs) {
    const like = adminFirestoreDocToBookingLike(id, data);
    if (!like) continue;
    const events = toPhaseEvents(like);
    for (const ev of events) {
      if (ev.workerId !== wid) continue;
      const st = ev.startAt.getTime();
      const en = ev.endAt.getTime();
      if (!(en > st)) continue;
      const s = Math.max(st, bounds.dayStartMs);
      const e = Math.min(en, bounds.dayEndExclusiveMs);
      if (e > s) raw.push({ startMs: s, endMsExclusive: e });
    }
  }
  return mergeBusyIntervalsMs(raw);
}
