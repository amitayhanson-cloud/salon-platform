import type { FreedBookingSlot } from "./matchService";

/** Normalize stored time to HH:mm (accepts 9:5, 09:05:00, etc.). */
export function normalizeBookingTimeHHmm(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = /^(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*\d{1,2})?/.exec(s);
  if (!m) return null;
  let hh = parseInt(m[1], 10);
  let mm = parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  hh = Math.min(23, Math.max(0, hh));
  mm = Math.min(59, Math.max(0, mm));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Build primary-only fields from a live phase-1 booking doc before it is archived. */
export function bookingDocToFreedSlot(data: Record<string, unknown>): FreedBookingSlot | null {
  const phase = data.phase;
  if (phase === 2) return null;

  const dateYmd = String(data.dateISO ?? data.date ?? "").trim().slice(0, 10);
  const timeHHmm = normalizeBookingTimeHHmm(data.timeHHmm ?? data.time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !timeHHmm) return null;

  const workerIdRaw =
    data.workerId != null && String(data.workerId).trim() !== "" ? String(data.workerId).trim() : null;

  const durationRaw = data.durationMin;
  const durationMin =
    typeof durationRaw === "number" && Number.isFinite(durationRaw) ? Math.max(1, Math.round(durationRaw)) : 60;

  const serviceTypeId =
    data.serviceTypeId != null && String(data.serviceTypeId).trim() !== ""
      ? String(data.serviceTypeId).trim()
      : data.serviceType != null && String(data.serviceType).trim() !== ""
        ? String(data.serviceType).trim()
        : null;

  const serviceId =
    data.serviceId != null && String(data.serviceId).trim() !== "" ? String(data.serviceId).trim() : null;

  const serviceName =
    data.serviceName != null && String(data.serviceName).trim() !== ""
      ? String(data.serviceName).trim()
      : "שירות";

  const waitRaw = data.waitMinutes;
  const waitMinutes =
    typeof waitRaw === "number" && Number.isFinite(waitRaw) ? Math.max(0, Math.round(waitRaw)) : 0;

  return {
    dateYmd,
    timeHHmm,
    workerId: workerIdRaw,
    workerName: data.workerName != null ? String(data.workerName) : null,
    serviceTypeId,
    serviceId,
    serviceName,
    durationMin,
    primaryDurationMin: durationMin,
    waitMinutes,
    followUpDurationMin: 0,
    followUpWorkerId: null,
    followUpWorkerName: null,
    followUpServiceName: null,
  };
}

/**
 * Enrich a phase-1 freed slot with optional phase-2 doc (same cancelled visit).
 */
export function mergeFreedSlotWithPhase2(
  phase1: Record<string, unknown>,
  phase2: Record<string, unknown> | null | undefined
): FreedBookingSlot | null {
  const base = bookingDocToFreedSlot(phase1);
  if (!base) return null;
  if (!phase2) return base;

  const durRaw = phase2.durationMin;
  const followUpDurationMin =
    typeof durRaw === "number" && Number.isFinite(durRaw) ? Math.max(0, Math.round(durRaw)) : 0;
  if (followUpDurationMin <= 0) return base;

  const fuWid =
    phase2.workerId != null && String(phase2.workerId).trim() !== ""
      ? String(phase2.workerId).trim()
      : null;

  const fuName =
    phase2.workerName != null && String(phase2.workerName).trim() !== ""
      ? String(phase2.workerName).trim()
      : null;

  const fuSvc =
    phase2.serviceName != null && String(phase2.serviceName).trim() !== ""
      ? String(phase2.serviceName).trim()
      : null;

  return {
    ...base,
    followUpDurationMin,
    followUpWorkerId: fuWid,
    followUpWorkerName: fuName,
    followUpServiceName: fuSvc,
  };
}
