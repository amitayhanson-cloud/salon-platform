export type BreakRange = { start: string; end: string }; // "HH:mm"

export type DayHours = {
  enabled: boolean;
  start: string; // "09:00"
  end: string; // "18:00"
  /** Break ranges within the day (no bookings during breaks). Omit or empty = no breaks. */
  breaks?: BreakRange[];
};

/** A specific calendar date when the business is closed (e.g. holiday). Full day in site timezone. */
export type ClosedDateEntry = {
  date: string; // YYYY-MM-DD
  label?: string;
};

/** Single client type in site settings. Regular has isSystem: true and cannot be deleted. */
export type ClientTypeEntry = {
  id: string;
  labelHe: string;
  isSystem?: boolean;
  sortOrder: number;
  createdAt?: import("firebase/firestore").Timestamp;
};

/** Stable id for the required default type. Must always exist. */
export const REGULAR_CLIENT_TYPE_ID = "regular";

/** Default client types. Regular is first and required (isSystem: true). */
export const DEFAULT_CLIENT_TYPE_ENTRIES: ClientTypeEntry[] = [
  { id: REGULAR_CLIENT_TYPE_ID, labelHe: "רגיל", isSystem: true, sortOrder: 0 },
  { id: "new", labelHe: "חדש", isSystem: false, sortOrder: 1 },
  { id: "vip", labelHe: "VIP", isSystem: false, sortOrder: 2 },
  { id: "active", labelHe: "פעיל", isSystem: false, sortOrder: 3 },
  { id: "inactive", labelHe: "לא פעיל", isSystem: false, sortOrder: 4 },
];

export type BookingSettings = {
  slotMinutes: number; // 15/30/60
  days: Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", DayHours>; // Sunday=0
  /** Specific dates when the business is closed (holidays). No availability for any worker. */
  closedDates?: ClosedDateEntry[];
  /** Client types per site. Must include one with id === REGULAR_CLIENT_TYPE_ID. */
  clientTypes?: ClientTypeEntry[] | string[];
};

/** Default for booking doc only. Client types live in settings/clients, not here. */
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

