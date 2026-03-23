export type AutomatedClientStatus = "new" | "active" | "normal" | "sleeping";

export type SleepingWindowUnit = "days" | "months";

export type ClientStatusRules = {
  /** "חדש" if total bookings is less than this value. */
  newMaxTotalBookings: number;
  /** "פעיל" if bookings in recent window are at least this value. */
  activeMinBookings: number;
  /** Recent window size in days for active check. */
  activeWindowDays: number;
  /** "רדום" if no bookings in this window. */
  sleepingNoBookingsFor: number;
  sleepingWindowUnit: SleepingWindowUnit;
};

export type ManualClientTag = {
  id: string;
  label: string;
  sortOrder: number;
};

export type ClientStatusSettings = {
  statusRules: ClientStatusRules;
  manualTags: ManualClientTag[];
};

export const DEFAULT_CLIENT_STATUS_RULES: ClientStatusRules = {
  newMaxTotalBookings: 2,
  activeMinBookings: 2,
  activeWindowDays: 30,
  sleepingNoBookingsFor: 60,
  sleepingWindowUnit: "days",
};

export const DEFAULT_CLIENT_STATUS_SETTINGS: ClientStatusSettings = {
  statusRules: DEFAULT_CLIENT_STATUS_RULES,
  manualTags: [{ id: "vip", label: "VIP", sortOrder: 0 }],
};

export const CLIENT_STATUS_LABELS_HE: Record<AutomatedClientStatus, string> = {
  new: "חדש",
  active: "פעיל",
  normal: "רגיל",
  sleeping: "רדום",
};
