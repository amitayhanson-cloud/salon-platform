/** Follow-up config: phase 2 service (by id/name) + duration + wait gap. */
export interface FollowUpConfig {
  /** Service name (from business services); used for display and worker–service matching. */
  name: string;
  /** Optional service id (SiteService.id) for strict worker–service compatibility. */
  serviceId?: string;
  durationMinutes: number;
  waitMinutes: number;
  /** Optional suffix/label for display (e.g. "קרטין"). Shown as "המשך טיפול: {name} - {text}". */
  text?: string;
}

export interface PricingItem {
  id: string;
  serviceId: string; // Required: Service ID/name (from business services list) - used for grouping
  service?: string; // Optional: Service name (for backward compatibility, use serviceId)
  type?: string | null; // Optional: Sub-type/variation (e.g., "רבע ראש", "חצי ראש")
  // Duration range
  durationMinMinutes: number;
  durationMaxMinutes: number;
  durationMinutes?: number; // Legacy: use durationMinMinutes/durationMaxMinutes
  waitTimeMin?: number;
  waitTimeMax?: number;
  price?: number;
  priceRangeMin?: number;
  priceRangeMax?: number;
  notes?: string;
  /** When true, phase 2 is a separate booking with free-text name + duration + wait. */
  hasFollowUp?: boolean;
  /** Follow-up: name (free text), durationMinutes, waitMinutes. Null when hasFollowUp is false. */
  followUp?: FollowUpConfig | null;
  createdAt: string;
  updatedAt: string;
  order?: number;
  // Legacy (do not use; removed from schema; kept for me/admin and old data)
  secondaryDurationMin?: number;
  secondaryServiceTypeId?: string | null;
  followUpServiceId?: string | null;
  followUpServiceRefId?: string | null;
  followUpDurationMinutes?: number | null;
  followUpWaitMinutes?: number | null;
  waitMinutes?: number | null;
}

export interface PricingCategory {
  id: string;
  name: string;
  order: number;
}
