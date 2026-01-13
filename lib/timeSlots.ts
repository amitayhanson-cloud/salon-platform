import type { OpeningHours } from "@/types/booking";

export function getWeekdayFromDate(date: Date): number {
  // Sunday = 0, Monday = 1, etc.
  return date.getDay();
}

export function getWeekdayKey(dayIndex: number): "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat" {
  const map: Record<number, "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat"> = {
    0: "sun",
    1: "mon",
    2: "tue",
    3: "wed",
    4: "thu",
    5: "fri",
    6: "sat",
  };
  return map[dayIndex] || "sun";
}

export function getScheduleForDate(
  date: Date,
  openingHours: OpeningHours[]
): { open: string | null; close: string | null } {
  const weekday = getWeekdayKey(getWeekdayFromDate(date));
  const daySchedule = openingHours.find((h) => h.day === weekday);
  
  if (!daySchedule || !daySchedule.open || !daySchedule.close) {
    return { open: null, close: null };
  }

  return {
    open: daySchedule.open,
    close: daySchedule.close,
  };
}

export function generateTimeSlots(
  date: Date,
  openingHours: OpeningHours[],
  slotIntervalMinutes: number = 30,
  serviceDurationMinutes: number = 30
): string[] {
  const schedule = getScheduleForDate(date, openingHours);

  if (!schedule.open || !schedule.close) {
    return [];
  }

  const slots: string[] = [];
  const [openHour, openMin] = schedule.open.split(":").map(Number);
  const [closeHour, closeMin] = schedule.close.split(":").map(Number);

  const openTime = openHour * 60 + openMin; // minutes from midnight
  const closeTime = closeHour * 60 + closeMin;

  let currentTime = openTime;

  while (currentTime + serviceDurationMinutes <= closeTime) {
    const hours = Math.floor(currentTime / 60);
    const minutes = currentTime % 60;
    const timeString = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    slots.push(timeString);
    currentTime += slotIntervalMinutes;
  }

  return slots;
}

export function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "numeric",
  });
}

export function getNext14Days(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push(date);
  }

  return days;
}

