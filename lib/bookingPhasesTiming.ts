/**
 * Single source of truth for phase 1 + follow-up (phase 2) timing.
 * Used by booking creation, calendar, and availability so gap === waitMinutes exactly.
 */

export interface ComputePhasesInput {
  /** Phase 1 start (Date or Firestore Timestamp) */
  startAt: Date | { toDate: () => Date };
  /** Phase 1 duration in minutes (main service) */
  durationMinutes: number;
  /** Gap after phase 1 before phase 2; null/undefined => 0 */
  waitMinutes?: number | null;
  /** Phase 2 duration in minutes (follow-up) */
  followUpDurationMinutes: number;
}

export interface ComputePhasesResult {
  phase1StartAt: Date;
  phase1EndAt: Date;
  phase2StartAt: Date;
  phase2EndAt: Date;
}

function toDate(val: Date | { toDate: () => Date }): Date {
  if (val instanceof Date) return val;
  return (val as { toDate: () => Date }).toDate();
}

/**
 * Compute phase 1 and phase 2 timestamps. Gap between phase1EndAt and phase2StartAt === waitMinutes.
 * Formula: follow-up starts at (first service start + first service duration + waiting time).
 * Example: first at 10:00, duration 30 min, wait 60 min => phase1 ends 10:30, follow-up starts 11:30.
 * - phase1EndAt = phase1StartAt + durationMinutes (phase 1 end only; NOT + wait).
 * - phase2StartAt = phase1EndAt + waitMinutes.
 * - phase2EndAt = phase2StartAt + followUpDurationMinutes
 */
export function computePhases(input: ComputePhasesInput): ComputePhasesResult {
  const start = toDate(input.startAt);
  const durationMin = Math.max(0, input.durationMinutes);
  const waitMin = input.waitMinutes != null ? Math.max(0, input.waitMinutes) : 0;
  const followUpMin = Math.max(0, input.followUpDurationMinutes);

  const phase1StartAt = new Date(start.getTime());
  const phase1EndAt = new Date(phase1StartAt.getTime() + durationMin * 60 * 1000);
  const phase2StartAt = new Date(phase1EndAt.getTime() + waitMin * 60 * 1000);
  const phase2EndAt = new Date(phase2StartAt.getTime() + followUpMin * 60 * 1000);

  if (process.env.NODE_ENV !== "production") {
    const gapMs = phase2StartAt.getTime() - phase1EndAt.getTime();
    const gapMinutes = Math.round(gapMs / (60 * 1000));
    if (gapMinutes !== waitMin) {
      console.warn("[computePhases] gap !== waitMinutes", {
        durationMinutes: durationMin,
        waitMinutes: waitMin,
        gapMinutes,
        expected: "gap === waitMinutes",
      });
    }
  }

  return { phase1StartAt, phase1EndAt, phase2StartAt, phase2EndAt };
}

/**
 * Dev-only assertion: duration=30, wait=60, followUp=45 => phase2Start = start + 30 + 60 (not +30+60+30).
 * Call from a test or dev check.
 */
export function assertComputePhasesExample(): void {
  const start = new Date(2025, 0, 15, 10, 0, 0, 0); // 10:00
  const result = computePhases({
    startAt: start,
    durationMinutes: 30,
    waitMinutes: 60,
    followUpDurationMinutes: 45,
  });
  const phase2StartExpected = new Date(start.getTime() + (30 + 60) * 60 * 1000); // 10:00 + 90 min = 11:30
  const gapMs = result.phase2StartAt.getTime() - result.phase1EndAt.getTime();
  const gapMinutes = Math.round(gapMs / (60 * 1000));
  if (result.phase2StartAt.getTime() !== phase2StartExpected.getTime()) {
    throw new Error(
      `computePhases example failed: phase2Start expected ${phase2StartExpected.toISOString()}, got ${result.phase2StartAt.toISOString()}`
    );
  }
  if (gapMinutes !== 60) {
    throw new Error(`computePhases example failed: gap should be 60 minutes, got ${gapMinutes}`);
  }
}

if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
  try {
    assertComputePhasesExample();
  } catch (e) {
    console.error("[bookingPhasesTiming] dev check failed:", e);
  }
}
