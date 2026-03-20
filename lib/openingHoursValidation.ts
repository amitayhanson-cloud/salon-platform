import type { OpeningHours, SalonBookingState } from "@/types/booking";

/** Same rules as admin UI: breaks within open window, ordered, non-overlapping. */
export function getBreaksErrorForDay(day: OpeningHours): string | null {
  if (!day?.open || !day?.close) return null;
  const breaks = day.breaks ?? [];
  const openMin = day.open.split(":").reduce((a, b, i) => a + (i === 0 ? parseInt(b, 10) * 60 : parseInt(b, 10)), 0);
  const closeMin = day.close.split(":").reduce((a, b, i) => a + (i === 0 ? parseInt(b, 10) * 60 : parseInt(b, 10)), 0);
  for (let i = 0; i < breaks.length; i++) {
    const b = breaks[i]!;
    const [sH, sM] = b.start.split(":").map(Number);
    const [eH, eM] = b.end.split(":").map(Number);
    const sMin = (sH ?? 0) * 60 + (sM ?? 0);
    const eMin = (eH ?? 0) * 60 + (eM ?? 0);
    if (sMin >= eMin) return `הפסקה ${i + 1}: שעת התחלה חייבת להיות לפני שעת סיום`;
    if (sMin < openMin || eMin > closeMin) return `הפסקה ${i + 1}: חייבת להיות בתוך שעות הפתיחה`;
    for (let j = i + 1; j < breaks.length; j++) {
      const o = breaks[j]!;
      const oS = (parseInt(o.start.split(":")[0], 10) || 0) * 60 + (parseInt(o.start.split(":")[1], 10) || 0);
      const oE = (parseInt(o.end.split(":")[0], 10) || 0) * 60 + (parseInt(o.end.split(":")[1], 10) || 0);
      if (sMin < oE && eMin > oS) return "הפסקות לא יכולות לחפוף";
    }
  }
  return null;
}

/** At least one open day; open < close on open days; valid breaks. */
export function isSalonBookingHoursValidForWizard(state: SalonBookingState): boolean {
  let hasOpenDay = false;
  for (const day of state.openingHours) {
    if (day.open && day.close) {
      hasOpenDay = true;
      const openMin = day.open.split(":").reduce((a, b, i) => a + (i === 0 ? parseInt(b, 10) * 60 : parseInt(b, 10)), 0);
      const closeMin = day.close.split(":").reduce((a, b, i) => a + (i === 0 ? parseInt(b, 10) * 60 : parseInt(b, 10)), 0);
      if (openMin >= closeMin) return false;
      if (getBreaksErrorForDay(day)) return false;
    }
  }
  return hasOpenDay;
}

/** Full-state validation for save (Hebrew messages with day label). */
export function validateSalonBookingBreaks(state: SalonBookingState): string | null {
  for (const day of state.openingHours) {
    const err = getBreaksErrorForDay(day);
    if (err) return `${day.label}: ${err}`;
  }
  return null;
}
