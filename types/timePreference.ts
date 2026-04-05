export const TIME_PREFERENCE_VALUES = ["morning", "afternoon", "evening", "anytime"] as const;
export type TimePreferenceValue = (typeof TIME_PREFERENCE_VALUES)[number];
