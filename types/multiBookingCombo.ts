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
    return { valid: false, error: "נא לבחור לפחות שירות אחד בתנאי ההפעלה." };
  }
  if (input.orderedServiceTypeIds.length === 0) {
    return { valid: false, error: "נא להגדיר את סדר השירותים ביומן." };
  }
  if (input.orderedServiceTypeIds.length !== orderedSet.size) {
    return { valid: false, error: "אותו סוג שירות לא יכול להופיע פעמיים בסדר." };
  }
  for (const id of triggerSet) {
    if (!orderedSet.has(id)) {
      return { valid: false, error: "כל השירותים שבחרת בתנאים חייבים להופיע גם בסדר היומן." };
    }
  }
  if (input.autoSteps?.length) {
    for (let i = 0; i < input.autoSteps.length; i++) {
      const step = input.autoSteps[i]!;
      if (!step.serviceId?.trim()) {
        return { valid: false, error: "בשלב הנוסף חסר בחירת שירות." };
      }
      if (!Number.isFinite(step.durationMinutesOverride) || step.durationMinutesOverride < 1) {
        return { valid: false, error: "משך הזמן המותאם לשלב נוסף חייב להיות לפחות דקה אחת." };
      }
      if (step.position !== "end" && (typeof step.position !== "number" || step.position < 0)) {
        return { valid: false, error: "תצורת החבילה לא תקינה. נא לנסות שוב או לרענן את הדף." };
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
