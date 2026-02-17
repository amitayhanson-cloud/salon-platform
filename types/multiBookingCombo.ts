/**
 * Multi-booking combo: rule-based "trigger set → ordered plan" using SERVICE TYPES (pricing item ids).
 * Optional service-based auto steps at end with duration override (multi-booking only).
 */

/** Auto-added step: chosen from SERVICES list; duration override stored on combo. */
export interface MultiBookingAutoStep {
  serviceId: string;
  durationMinutesOverride: number;
  position: "end" | number;
}

export interface MultiBookingCombo {
  id: string;
  name: string;
  isActive: boolean;
  triggerServiceTypeIds: string[];
  orderedServiceTypeIds: string[];
  /** Optional steps appended after ordered types (service-based, duration override). */
  autoSteps?: MultiBookingAutoStep[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MultiBookingComboInput {
  name: string;
  triggerServiceTypeIds: string[];
  orderedServiceTypeIds: string[];
  autoSteps?: MultiBookingAutoStep[];
  isActive?: boolean;
}

export function validateMultiBookingComboInput(input: MultiBookingComboInput): { valid: boolean; error?: string } {
  const triggerSet = new Set(input.triggerServiceTypeIds);
  const orderedSet = new Set(input.orderedServiceTypeIds);
  if (input.triggerServiceTypeIds.length === 0) {
    return { valid: false, error: "triggerServiceTypeIds cannot be empty" };
  }
  if (input.orderedServiceTypeIds.length === 0) {
    return { valid: false, error: "orderedServiceTypeIds cannot be empty" };
  }
  if (input.orderedServiceTypeIds.length !== orderedSet.size) {
    return { valid: false, error: "orderedServiceTypeIds must not contain duplicates" };
  }
  for (const id of triggerSet) {
    if (!orderedSet.has(id)) {
      return { valid: false, error: "orderedServiceTypeIds must contain every triggerServiceTypeId" };
    }
  }
  if (input.autoSteps?.length) {
    for (let i = 0; i < input.autoSteps.length; i++) {
      const step = input.autoSteps[i]!;
      if (!step.serviceId?.trim()) {
        return { valid: false, error: `autoSteps[${i}]: serviceId is required` };
      }
      if (!Number.isFinite(step.durationMinutesOverride) || step.durationMinutesOverride < 1) {
        return { valid: false, error: `autoSteps[${i}]: durationMinutesOverride must be at least 1` };
      }
      if (step.position !== "end" && (typeof step.position !== "number" || step.position < 0)) {
        return { valid: false, error: `autoSteps[${i}]: position must be "end" or a non-negative number` };
      }
    }
  }
  return { valid: true };
}

/** Applied auto step (stored on booking for immutability). */
export interface AppliedAutoStep {
  serviceId: string;
  durationMinutesOverride: number;
}

/**
 * Multi-booking payload (client → saveMultiServiceBooking). Only when isMultiBooking and >1 service.
 */
export interface MultiBookingSelectionPayload {
  isMultiBooking: true;
  selectedServiceTypeIds: string[];
  orderedServiceTypeIds: string[];
  multiBookingComboId: string | null;
  computedOffsetsMinutes?: number[];
  /** Auto steps that were applied (serviceId + override duration). */
  appliedAutoSteps?: AppliedAutoStep[];
}
