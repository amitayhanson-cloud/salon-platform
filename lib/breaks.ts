/**
 * Business-hours break helpers. Used to exclude break ranges from available slots.
 */

export type BreakRange = { start: string; end: string };

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True if [slotStartMin, slotEndMin) overlaps any break. */
export function slotOverlapsBreaks(
  slotStartMin: number,
  slotEndMin: number,
  breaks: BreakRange[] | undefined
): boolean {
  if (!breaks?.length) return false;
  for (const b of breaks) {
    const bStart = timeToMinutes(b.start);
    const bEnd = timeToMinutes(b.end);
    if (slotStartMin < bEnd && slotEndMin > bStart) return true;
  }
  return false;
}

/** Filter time strings ("HH:mm") so that no slot [t, t+durationMin) overlaps any break. */
export function filterTimesByBreaks(
  times: string[],
  durationMin: number,
  breaks: BreakRange[] | undefined
): string[] {
  if (!breaks?.length) return times;
  return times.filter((t) => {
    const [h, m] = t.split(":").map(Number);
    const startMin = (h ?? 0) * 60 + (m ?? 0);
    const endMin = startMin + durationMin;
    return !slotOverlapsBreaks(startMin, endMin, breaks);
  });
}

export type ServiceSegment = { startMin: number; endMin: number };

/**
 * True if any SERVICE segment overlaps any break. Use this for multi-part bookings:
 * only service/work intervals are checked; wait gaps are ignored.
 */
export function anyServiceSegmentOverlapsBreaks(
  segments: ServiceSegment[],
  breaks: BreakRange[] | undefined
): boolean {
  if (!breaks?.length || segments.length === 0) return false;
  const debug = typeof process !== "undefined" && process.env?.NODE_ENV === "development";
  if (debug) {
    const breakIntervals = breaks.map((b) => {
      const [sh, sm] = b.start.split(":").map(Number);
      const [eh, em] = b.end.split(":").map(Number);
      return { startMin: (sh ?? 0) * 60 + (sm ?? 0), endMin: (eh ?? 0) * 60 + (em ?? 0) };
    });
    console.debug("[breaks] segments tested vs breaks", {
      segments: segments.map((s) => ({ startMin: s.startMin, endMin: s.endMin })),
      breakIntervals,
    });
  }
  for (const seg of segments) {
    if (slotOverlapsBreaks(seg.startMin, seg.endMin, breaks)) return true;
  }
  return false;
}
