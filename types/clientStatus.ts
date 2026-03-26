export type AutomatedClientStatus = "new" | "active" | "normal" | "sleeping";

export type SleepingWindowUnit = "days" | "months";

export type ClientStatusRules = {
  /**
   * "חדש" if the client has fewer than this many **lifetime** qualifying (non-cancelled) visits,
   * including clients with no qualifying history.
   */
  newMaxTotalBookings: number;
  /** "פעיל" if at least this many **past** visits fall inside `activeWindowDays`. */
  activeMinBookings: number;
  /** Recent window size in days for active check (counts only visits on/before "now"). */
  activeWindowDays: number;
  /** "רדום" if there is no **past** visit in this lookback window (and rules above don't apply). */
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
