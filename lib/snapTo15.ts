/**
 * Snap a numeric value to the nearest multiple of 15 (for minute/duration inputs).
 * Used so spinners and blur always yield 0, 15, 30, 45, 60, ...
 */

/**
 * Snaps n to the nearest multiple of 15.
 * - NaN / invalid -> 0
 * - Optionally clamps to [min, max] (min/max are also treated as inclusive).
 */
export function snapTo15(
  n: number,
  options?: { min?: number; max?: number }
): number {
  const parsed = Number(n);
  if (!Number.isFinite(parsed)) return 0;
  const snapped = Math.round(parsed / 15) * 15;
  if (options?.min != null && snapped < options.min) return options.min;
  if (options?.max != null && snapped > options.max) return options.max;
  return snapped;
}
