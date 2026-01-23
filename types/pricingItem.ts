export interface PricingItem {
  id: string;
  serviceId: string; // Required: Service ID/name (from business services list) - used for grouping
  service?: string; // Optional: Service name (for backward compatibility, use serviceId)
  type?: string | null; // Optional: Sub-type/variation (e.g., "רבע ראש", "חצי ראש")
  // Duration range (new)
  durationMinMinutes: number; // Minimum duration in minutes
  durationMaxMinutes: number; // Maximum duration in minutes
  // Legacy field (for backward compatibility - deprecated, use durationMinMinutes/durationMaxMinutes)
  durationMinutes?: number; // Deprecated: kept for backward compatibility
  waitMinutes?: number; // Single waiting time (deprecated - use waitTimeMin/waitTimeMax for range)
  waitTimeMin?: number; // Minimum waiting time in minutes (for range mode)
  waitTimeMax?: number; // Maximum waiting time in minutes (for range mode)
  price?: number; // Single price
  priceRangeMin?: number; // Range start (if using range)
  priceRangeMax?: number; // Range end (if using range)
  notes?: string; // Optional notes
  // Follow-up service fields
  hasFollowUp?: boolean; // Whether this service has a follow-up
  followUpServiceId?: string | null; // Follow-up service name (from business services)
  followUpDurationMinutes?: number | null; // Follow-up duration in minutes
  followUpWaitMinutes?: number | null; // Follow-up wait time in minutes
  createdAt: string;
  updatedAt: string;
  order?: number; // For sorting within service
}

export interface PricingCategory {
  id: string;
  name: string;
  order: number;
}
