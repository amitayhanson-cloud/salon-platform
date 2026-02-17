/**
 * Multi-booking combos (rule-based): CRUD and subscribe for sites/{siteId}/multiBookingCombos.
 * Schema: triggerServiceTypeIds (set) + orderedServiceTypeIds (sequence). Service types = pricing item ids.
 */

import {
  getDocs,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { multiBookingCombosCollection, multiBookingComboDoc } from "./firestorePaths";
import { sanitizeForFirestore } from "./sanitizeForFirestore";
import type { MultiBookingCombo, MultiBookingComboInput, MultiBookingAutoStep } from "@/types/multiBookingCombo";

function toStrArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter((id): id is string => typeof id === "string");
}

function parseAutoSteps(value: unknown): MultiBookingAutoStep[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const out: MultiBookingAutoStep[] = [];
  for (const item of value) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const serviceId = typeof o.serviceId === "string" ? o.serviceId.trim() : "";
    const durationMinutesOverride = typeof o.durationMinutesOverride === "number" ? o.durationMinutesOverride : 0;
    const position = o.position === "end" ? "end" : typeof o.position === "number" ? o.position : "end";
    if (!serviceId || durationMinutesOverride < 1) continue;
    out.push({ serviceId, durationMinutesOverride, position });
  }
  return out.length ? out : undefined;
}

function docToCombo(id: string, data: Record<string, unknown>): MultiBookingCombo {
  const trigger = toStrArray(data.triggerServiceTypeIds);
  const ordered = toStrArray(data.orderedServiceTypeIds);
  const autoSteps = parseAutoSteps(data.autoSteps);
  const base = (t: string[], o: string[]) => ({
    id,
    name: typeof data.name === "string" ? data.name : "",
    isActive: data.isActive === true,
    triggerServiceTypeIds: t,
    orderedServiceTypeIds: o,
    ...(autoSteps && { autoSteps }),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
  });
  if (trigger.length === 0 && ordered.length === 0) {
    const legacyTrigger = toStrArray(data.triggerServiceIds);
    const legacyOrdered = toStrArray(data.orderedServiceIds);
    if (legacyTrigger.length > 0 || legacyOrdered.length > 0) {
      return base(legacyTrigger, legacyOrdered.length > 0 ? legacyOrdered : legacyTrigger);
    }
    const legacy = toStrArray(data.serviceIds);
    return base(legacy, legacy);
  }
  return base(trigger, ordered);
}

export function subscribeMultiBookingCombos(
  siteId: string,
  onData: (combos: MultiBookingCombo[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const col = multiBookingCombosCollection(siteId);
  return onSnapshot(
    col,
    (snapshot) => {
      const combos = snapshot.docs.map((d) => docToCombo(d.id, d.data() as Record<string, unknown>));
      onData(combos);
    },
    (err) => {
      console.error("[subscribeMultiBookingCombos]", err);
      onError?.(err as Error);
    }
  );
}

export async function getMultiBookingCombos(siteId: string): Promise<MultiBookingCombo[]> {
  const snapshot = await getDocs(multiBookingCombosCollection(siteId));
  return snapshot.docs.map((d) => docToCombo(d.id, d.data() as Record<string, unknown>));
}

export async function createMultiBookingCombo(
  siteId: string,
  input: MultiBookingComboInput
): Promise<string> {
  const col = multiBookingCombosCollection(siteId);
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    triggerServiceTypeIds: input.triggerServiceTypeIds,
    orderedServiceTypeIds: input.orderedServiceTypeIds,
    isActive: input.isActive !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.autoSteps?.length) payload.autoSteps = input.autoSteps;
  const ref = await addDoc(col, sanitizeForFirestore(payload) as Record<string, unknown>);
  return ref.id;
}

export async function updateMultiBookingCombo(
  siteId: string,
  comboId: string,
  input: Partial<MultiBookingComboInput>
): Promise<void> {
  const ref = multiBookingComboDoc(siteId, comboId);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.triggerServiceTypeIds !== undefined) payload.triggerServiceTypeIds = input.triggerServiceTypeIds;
  if (input.orderedServiceTypeIds !== undefined) payload.orderedServiceTypeIds = input.orderedServiceTypeIds;
  if (input.isActive !== undefined) payload.isActive = input.isActive;
  if (input.autoSteps !== undefined) payload.autoSteps = input.autoSteps;
  await updateDoc(ref, sanitizeForFirestore(payload) as Record<string, unknown>);
}

export async function deleteMultiBookingCombo(siteId: string, comboId: string): Promise<void> {
  await deleteDoc(multiBookingComboDoc(siteId, comboId));
}

function setEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

/**
 * Find an active combo whose triggerServiceTypeIds match selectedServiceTypeIds exactly (set equality).
 * If multiple match: pick largest trigger set, then by updatedAt desc.
 * Defensive: never access .length on possibly-undefined; skip invalid combos instead of crashing.
 */
export function findMatchingCombo(
  combos: MultiBookingCombo[],
  selectedServiceTypeIds: string[] | undefined
): MultiBookingCombo | null {
  const selected = Array.isArray(selectedServiceTypeIds) ? selectedServiceTypeIds : [];
  const combosList = Array.isArray(combos) ? combos : [];

  if (process.env.NODE_ENV !== "production") {
    console.log("MULTI BOOKING MATCH INPUT", {
      selectedServiceTypeIds,
      selectedArray: selected,
      selectedLength: selected.length,
      combosCount: combosList.length,
    });
  }

  if (selected.length === 0) return null;

  const active = combosList.filter((c) => c && c.isActive === true);
  const matches = active.filter((c) => {
    const trigger = Array.isArray(c.triggerServiceTypeIds) ? c.triggerServiceTypeIds : [];
    const ordered = Array.isArray(c.orderedServiceTypeIds) ? c.orderedServiceTypeIds : [];
    if (trigger.length === 0 || ordered.length === 0) return false;
    const orderedSet = new Set(ordered);
    for (const id of trigger) {
      if (!orderedSet.has(id)) return false;
    }
    if (ordered.length !== new Set(ordered).size) return false;
    if (process.env.NODE_ENV !== "production") {
      const autoSteps = Array.isArray(c.autoSteps) ? c.autoSteps : [];
      console.log("COMBO CANDIDATE", {
        id: c.id,
        triggerLen: trigger.length,
        orderedLen: ordered.length,
        autoStepsLen: autoSteps.length,
      });
    }
    return setEquals(trigger, selected);
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;

  matches.sort((a, b) => {
    const aTrigger = Array.isArray(a.triggerServiceTypeIds) ? a.triggerServiceTypeIds : [];
    const bTrigger = Array.isArray(b.triggerServiceTypeIds) ? b.triggerServiceTypeIds : [];
    if (bTrigger.length !== aTrigger.length) {
      return bTrigger.length - aTrigger.length;
    }
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
  });
  return matches[0]!;
}
