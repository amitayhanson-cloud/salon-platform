/**
 * Stable import key for idempotency: same row => same key => skip duplicate.
 * importKey = hash(siteId + phone + date + startTime + duration + serviceTypeId + workerId + phase + parentGroupKey)
 */

export function hashString(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h = h & h;
  }
  return Math.abs(h).toString(36);
}

export function bookingImportKey(params: {
  siteId: string;
  phone: string;
  date: string;
  startTime: string;
  durationMin: number;
  serviceTypeId: string;
  workerId: string;
  phase: number;
  parentGroupKey?: string;
}): string {
  const parts = [
    params.siteId,
    params.phone,
    params.date,
    params.startTime,
    String(params.durationMin),
    params.serviceTypeId,
    params.workerId,
    String(params.phase),
    params.parentGroupKey ?? "",
  ];
  return hashString(parts.join("|"));
}
