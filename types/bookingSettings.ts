export type DayHours = {
  enabled: boolean;
  start: string; // "09:00"
  end: string; // "18:00"
};

export type BookingSettings = {
  slotMinutes: number; // 15/30/60
  days: Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", DayHours>; // Sunday=0
};

export const defaultBookingSettings: BookingSettings = {
  slotMinutes: 30,
  days: {
    "0": { enabled: false, start: "09:00", end: "17:00" },
    "1": { enabled: true, start: "09:00", end: "17:00" },
    "2": { enabled: true, start: "09:00", end: "17:00" },
    "3": { enabled: true, start: "09:00", end: "17:00" },
    "4": { enabled: true, start: "09:00", end: "17:00" },
    "5": { enabled: true, start: "09:00", end: "13:00" },
    "6": { enabled: false, start: "09:00", end: "17:00" },
  },
};

