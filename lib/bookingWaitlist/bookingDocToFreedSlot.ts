import type { FreedBookingSlot } from "./matchService";

/** Build slot descriptor from a live booking doc before it is archived. */
export function bookingDocToFreedSlot(data: Record<string, unknown>): FreedBookingSlot | null {
  const phase = data.phase;
  if (phase === 2) return null;

  const dateYmd = String(data.dateISO ?? data.date ?? "").trim().slice(0, 10);
  const timeRaw = String(data.timeHHmm ?? data.time ?? "").trim();
  const timeHHmm = timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !/^\d{1,2}:\d{2}$/.test(timeHHmm)) return null;

  const workerId =
    data.workerId != null && String(data.workerId).trim() !== "" ? String(data.workerId).trim() : null;
  if (!workerId) return null;

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

  return {
    dateYmd,
    timeHHmm,
    workerId,
    workerName: data.workerName != null ? String(data.workerName) : null,
    serviceTypeId,
    serviceId,
    serviceName,
    durationMin,
  };
}
