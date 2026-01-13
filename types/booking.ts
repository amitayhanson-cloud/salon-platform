export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export interface OpeningHours {
  day: Weekday;
  label: string; // Hebrew day name for UI
  open: string | null; // "09:00" or null if closed
  close: string | null; // "18:00" or null if closed
}

export interface Worker {
  id: string;
  name: string;
  role?: string;
  color?: string;
}

export interface Booking {
  id: string;
  workerId: string;
  workerName: string;
  date: string; // ISO date "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  clientName: string;
  service?: string;
  notes?: string;
}

export interface SalonBookingState {
  openingHours: OpeningHours[];
  workers: Worker[];
  bookings: Booking[];
  defaultSlotMinutes: number;
}

export const defaultBookingState: SalonBookingState = {
  defaultSlotMinutes: 30,
  openingHours: [
    { day: "sun", label: "ראשון", open: "09:00", close: "18:00" },
    { day: "mon", label: "שני", open: "09:00", close: "18:00" },
    { day: "tue", label: "שלישי", open: "09:00", close: "18:00" },
    { day: "wed", label: "רביעי", open: "09:00", close: "18:00" },
    { day: "thu", label: "חמישי", open: "09:00", close: "18:00" },
    { day: "fri", label: "שישי", open: "09:00", close: "14:00" },
    { day: "sat", label: "שבת", open: null, close: null },
  ],
  workers: [
    { id: "w1", name: "מעצב ראשי", role: "תספורות" },
    { id: "w2", name: "צבע ותסרוקות", role: "צבע" },
  ],
  bookings: [],
};

