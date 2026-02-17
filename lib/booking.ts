import { addDoc, getDocs, getDoc, setDoc, query, where, orderBy, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebaseClient";
import { bookingsCollection, bookingDoc } from "./firestorePaths";
import { getOrCreateClient } from "./firestoreClients";
import { computePhases } from "./bookingPhasesTiming";
import { getPersonalPricing } from "./firestorePersonalPricing";
import { resolveServicePrice } from "./pricingUtils";
import { validateChainAssignments, type WorkersForValidation } from "./multiServiceChain";
import { workerCanDoService } from "./workerServiceCompatibility";
import type { MultiBookingSelectionPayload } from "@/types/multiBookingCombo";

/** Removes keys with value undefined so Firestore never receives undefined. Preserves Timestamp and FieldValue. */
function cleanUndefined<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (typeof (value as { toMillis?: unknown }).toMillis === "function") return value; // Firestore Timestamp
  if (typeof (value as { toDate?: unknown }).toDate === "function") return value; // Firestore Timestamp (toDate)
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return value; // FieldValue / other sentinels
  if (Array.isArray(value)) {
    return value.map(cleanUndefined).filter((v) => v !== undefined) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = cleanUndefined(v);
  }
  return out as T;
}

export interface BookingData {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceType?: string | null; // Optional type/variant from pricing item
  pricingItemId?: string | null; // Optional pricing item ID
  serviceColor?: string | null; // Denormalized service color for display
  workerId: string | null; // Primary worker (legacy + convenience)
  workerName: string | null;
  /** Secondary worker for multi-phase (phase 2); optional */
  secondaryWorkerId?: string | null;
  secondaryWorkerName?: string | null;
  /** Phase 2 (follow-up) display – from follow-up service type when secondaryServiceTypeId is set */
  secondaryServiceName?: string | null;
  secondaryServiceType?: string | null;
  secondaryServiceColor?: string | null;
  date: string; // YYYY-MM-DD (primary phase start)
  time: string; // HH:mm (primary phase start)
  name: string;
  phone: string;
  note?: string;
  price?: number | null; // Resolved price (personal override or default)
  priceSource?: "personal" | "default" | null; // Source of the price for auditability
  createdAt: string; // ISO string
}

/**
 * @deprecated Use Firestore directly. Kept for backward compatibility.
 */
export function getBookings(siteId: string): BookingData[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(`bookings:${siteId}`);
    if (!raw) return [];
    return JSON.parse(raw) as BookingData[];
  } catch (e) {
    console.error("Failed to parse bookings", e);
    return [];
  }
}

/**
 * Resolve the price for a booking, considering personal pricing overrides
 * @param serviceTypeId - The pricing item ID (service type ID)
 */
export async function resolveBookingPrice(
  siteId: string,
  phone: string,
  serviceTypeId: string | null,
  defaultPrice: number
): Promise<{ price: number; priceSource: "personal" | "default" }> {
  try {
    // If no serviceTypeId, use default price
    if (!serviceTypeId) {
      return {
        price: defaultPrice,
        priceSource: "default",
      };
    }
    
    const personalPricing = await getPersonalPricing(siteId, phone, serviceTypeId);
    const resolvedPrice = resolveServicePrice({
      serviceDefaultPrice: defaultPrice,
      clientOverridePrice: personalPricing?.price,
    });
    
    return {
      price: resolvedPrice,
      priceSource: personalPricing ? "personal" : "default",
    };
  } catch (error) {
    console.error("[resolveBookingPrice] Error resolving price", error);
    // Fallback to default price on error
    return {
      price: defaultPrice,
      priceSource: "default",
    };
  }
}

/** Follow-up config for saveBooking (free-text phase 2) */
export interface SaveBookingFollowUp {
  name: string;
  durationMinutes: number;
  waitMinutes: number;
}

/** Pricing item shape for saveBooking (durations + follow-up) */
export interface SaveBookingPricingItem {
  durationMinMinutes?: number;
  durationMaxMinutes?: number;
  durationMinutes?: number;
  /** Follow-up: hasFollowUp + followUp { name, durationMinutes, waitMinutes } */
  hasFollowUp?: boolean;
  followUp?: SaveBookingFollowUp | null;
}

const DEBUG_GAP = false;

function fmtDate(d: Date): string {
  return d.toISOString();
}
function diffMinutes(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (60 * 1000));
}

/**
 * Save booking to Firestore. When service has follow-up, creates two booking docs (phase 1 + phase 2).
 * Phase 1: endAt = startAt + durationMin only (NOT + wait). Phase 2: startAt = phase1EndAt + waitMinutes.
 * Wait time creates no booking and blocks no worker.
 */
export async function saveBooking(
  siteId: string,
  booking: Omit<BookingData, "id">,
  pricingItem?: SaveBookingPricingItem,
  serviceColor?: string
): Promise<string> {
  if (!db) {
    throw new Error("Firestore db not initialized");
  }

  try {
    const clientId = await getOrCreateClient(siteId, {
      name: booking.name,
      phone: booking.phone,
      email: undefined,
      notes: booking.note,
    });

    const [y, m, d] = booking.date.split("-").map(Number);
    const [hh, mm] = booking.time.split(":").map(Number);
    const phase1StartAt = new Date(y, m - 1, d, hh, mm, 0, 0);

    const durationMinutes = pricingItem?.durationMinMinutes ?? pricingItem?.durationMinutes ?? 60;
    const primaryWorkerId = booking.workerId ?? null;
    const followUp = pricingItem?.hasFollowUp === true ? pricingItem?.followUp ?? null : null;
    const hasFollowUp = !!followUp && followUp.name.trim() !== "" && followUp.durationMinutes >= 1;
    const waitMinutes = Number(
      (followUp?.waitMinutes ?? (booking as { waitMinutes?: number }).waitMinutes ?? 0)
    );
    const waitMin = hasFollowUp ? Math.max(0, waitMinutes) : 0;
    const followUpDurationMinutes = followUp ? followUp.durationMinutes : 0;

    const phases = computePhases({
      startAt: phase1StartAt,
      durationMinutes,
      waitMinutes: waitMin,
      followUpDurationMinutes: hasFollowUp ? followUpDurationMinutes : 0,
    });

    if (DEBUG_GAP && hasFollowUp) {
      const computedGapMin = diffMinutes(phases.phase2StartAt, phases.phase1EndAt);
      console.debug("[GAP] saveBooking", {
        bookingId: "(new)",
        phase1Start: fmtDate(phases.phase1StartAt),
        phase1End: fmtDate(phases.phase1EndAt),
        waitMin,
        computedFollowUpStart: fmtDate(phases.phase2StartAt),
        computedGapMin,
      });
      if (computedGapMin !== waitMin) {
        console.warn("[GAP] computedGapMin must equal waitMin", { computedGapMin, waitMin });
      }
    }

    const dateStr = booking.date;
    const timeStr = booking.time;
    const bookingsRef = bookingsCollection(siteId);

    const bookingA: Record<string, unknown> = {
      siteId,
      clientId,
      customerName: booking.name,
      customerPhone: booking.phone,
      workerId: primaryWorkerId,
      workerName: booking.workerName ?? null,
      serviceTypeId: booking.pricingItemId ?? null,
      serviceName: booking.serviceName,
      serviceType: booking.serviceType ?? null,
      durationMin: durationMinutes,
      startAt: Timestamp.fromDate(phases.phase1StartAt),
      endAt: Timestamp.fromDate(phases.phase1EndAt),
      dateISO: dateStr,
      timeHHmm: timeStr,
      date: dateStr,
      time: timeStr,
      status: "confirmed",
      phase: 1,
      note: booking.note ?? null,
      serviceColor: serviceColor ?? booking.serviceColor ?? null,
      price: booking.price ?? null,
      priceSource: booking.priceSource ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(hasFollowUp && { waitMinutes: waitMin }),
    };
    const payloadA = cleanUndefined(bookingA) as Record<string, unknown>;
    const refA = await addDoc(bookingsRef, payloadA);
    const bookingAId = refA.id;
    if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log("TRACE_BOOKING_SAVED", JSON.stringify({ siteId, bookingGroupId: null, documentId: refA.id, workerId: primaryWorkerId, serviceId: booking.pricingItemId ?? null, serviceName: booking.serviceName, phase: 1 }));
    }
    if (process.env.NODE_ENV !== "production" && hasFollowUp) {
      const gapMinutes = diffMinutes(phases.phase2StartAt, phases.phase1EndAt);
      console.log("[saveBooking] phase1 duration=" + durationMinutes + " min, waitMin=" + waitMin + ", computed gap=" + gapMinutes + " min", gapMinutes === waitMin ? "(ok)" : "MISMATCH");
    }
    console.log("[saveBooking] booking A created id:", bookingAId);

    if (hasFollowUp && primaryWorkerId) {
      const phase2Start = phases.phase2StartAt;
      const phase2End = phases.phase2EndAt;
      const phase2DateStr = phase2Start.getFullYear() + "-" + String(phase2Start.getMonth() + 1).padStart(2, "0") + "-" + String(phase2Start.getDate()).padStart(2, "0");
      const phase2TimeStr = String(phase2Start.getHours()).padStart(2, "0") + ":" + String(phase2Start.getMinutes()).padStart(2, "0");

      // Phase 2 may be assigned to a different worker (secondaryWorkerId) or same as phase 1
      const phase2WorkerId = booking.secondaryWorkerId ?? primaryWorkerId;
      const phase2WorkerName = booking.secondaryWorkerName ?? booking.workerName ?? null;

      if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
        console.log("TRACE_BOOKING_ASSIGNMENT", JSON.stringify({ siteId, bookingGroupId: null, itemIndex: 2, phase: 2, serviceId: null, serviceName: followUp!.name.trim(), requestedPreferredWorkerId: primaryWorkerId, candidateWorkerIdsConsidered: [], chosenWorkerId: phase2WorkerId, chosenWorkerName: phase2WorkerName, chosenWorkerAllowedServices: [], workerCanDoServiceResult: null, workerCanDoWhy: "single_booking_path" }));
      }

      const bookingB: Record<string, unknown> = {
        siteId,
        clientId,
        customerName: booking.name,
        customerPhone: booking.phone,
        workerId: phase2WorkerId,
        workerName: phase2WorkerName,
        serviceTypeId: null,
        serviceName: followUp.name.trim(),
        serviceType: null,
        durationMin: followUp.durationMinutes,
        startAt: Timestamp.fromDate(phase2Start),
        endAt: Timestamp.fromDate(phase2End),
        dateISO: phase2DateStr,
        timeHHmm: phase2TimeStr,
        date: phase2DateStr,
        time: phase2TimeStr,
        status: "confirmed",
        phase: 2,
        parentBookingId: bookingAId,
        note: booking.note ?? null,
        serviceColor: serviceColor ?? booking.serviceColor ?? null,
        price: null,
        priceSource: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const payloadB = cleanUndefined(bookingB) as Record<string, unknown>;
      const refB = await addDoc(bookingsRef, payloadB);
      if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
        console.log("TRACE_BOOKING_SAVED", JSON.stringify({ siteId, bookingGroupId: null, documentId: refB.id, workerId: phase2WorkerId, serviceId: null, serviceName: followUp!.name.trim(), phase: 2 }));
      }
      console.log("[saveBooking] booking B created id:", refB.id, "parentBookingId:", bookingAId);
    }

    return bookingAId;
  } catch (e) {
    console.error("Failed to save booking to Firestore", e);
    throw e;
  }
}

/** Chain slot from multiServiceChain.resolveChainWorkers (with workers resolved). */
export interface ChainSlotForSave {
  serviceOrder: number;
  serviceName: string;
  serviceId?: string | null;
  serviceType: string | null;
  durationMin: number;
  startAt: Date;
  endAt: Date;
  workerId: string | null;
  workerName: string | null;
  serviceColor?: string | null;
  pricingItemId?: string | null;
  followUp?: {
    serviceName: string;
    serviceId?: string | null;
    durationMin: number;
    waitMin: number;
    startAt: Date;
    endAt: Date;
    workerId: string | null;
    workerName: string | null;
  };
}

/** One booking document = one service item. Worker is per item, not shared across the chain. */
export interface ServiceItemForSave {
  serviceId: string | null;
  serviceName: string;
  workerId: string | null;
  workerName: string | null;
  startAt: Date;
  endAt: Date;
  durationMin: number;
  serviceOrder: number;
  phase: 1 | 2;
  pricingItemId?: string | null;
  serviceType?: string | null;
  serviceColor?: string | null;
}

/**
 * Build a flat list of service items from chain slots. Each item has its own workerId and time window.
 * No single workerId at chain level; main and follow-up are independent items.
 */
export function buildServiceItemsFromChain(chainSlots: ChainSlotForSave[]): ServiceItemForSave[] {
  const items: ServiceItemForSave[] = [];
  for (const slot of chainSlots) {
    const serviceId = (slot.serviceId && slot.serviceId.trim()) ? slot.serviceId : null;
    items.push({
      serviceId,
      serviceName: slot.serviceName,
      workerId: slot.workerId,
      workerName: slot.workerName ?? null,
      startAt: slot.startAt,
      endAt: slot.endAt,
      durationMin: slot.durationMin,
      serviceOrder: slot.serviceOrder,
      phase: 1,
      pricingItemId: slot.pricingItemId ?? null,
      serviceType: slot.serviceType ?? null,
      serviceColor: slot.serviceColor ?? null,
    });
    if (slot.followUp && slot.followUp.durationMin >= 1 && slot.followUp.serviceName) {
      const fu = slot.followUp;
      const fuServiceId = (fu.serviceId && fu.serviceId.trim()) ? fu.serviceId : null;
      items.push({
        serviceId: fuServiceId,
        serviceName: fu.serviceName,
        workerId: fu.workerId,
        workerName: fu.workerName ?? null,
        startAt: fu.startAt,
        endAt: fu.endAt,
        durationMin: fu.durationMin,
        serviceOrder: slot.serviceOrder,
        phase: 2,
        pricingItemId: null,
        serviceType: null,
        serviceColor: null,
      });
    }
  }
  return items;
}

/**
 * Save multi-service booking chain. Creates one booking doc per service (and per follow-up).
 * If workers are provided, validates every (workerId, serviceId) with workerCanDoService before write.
 */
export async function saveMultiServiceBooking(
  siteId: string,
  chainSlots: ChainSlotForSave[],
  client: { name: string; phone: string; note?: string },
  options?: { workers?: WorkersForValidation; multiPayload?: MultiBookingSelectionPayload }
): Promise<{ visitGroupId: string; firstBookingId: string }> {
  if (!db) throw new Error("Firestore db not initialized");
  if (chainSlots.length === 0) throw new Error("Chain must have at least one service");

  const workers = options?.workers ?? [];
  const multiPayload = options?.multiPayload;
  if (multiPayload) {
    if (multiPayload.multiBookingComboId == null || String(multiPayload.multiBookingComboId).trim() === "") {
      throw new Error("Multi-booking requires a valid combo match.");
    }
  }
  if (workers.length > 0) {
    const validation = validateChainAssignments(chainSlots, workers);
    if (!validation.valid) {
      const msg = validation.errors[0] ?? "ההקצאה אינה תקינה";
      throw new Error(msg);
    }
  }

  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
    for (let i = 0; i < chainSlots.length; i++) {
      const slot = chainSlots[i]!;
      const serviceId = (slot.serviceId && slot.serviceId.trim()) ? slot.serviceId : slot.serviceName;
      const worker = slot.workerId ? workers.find((w) => w.id === slot.workerId) : null;
      const allowedLen = worker && Array.isArray(worker.services) ? worker.services.length : 0;
      const canDo = worker && slot.workerId ? workerCanDoService(worker, serviceId) : false;
      console.debug("[saveMultiServiceBooking] slot", i + 1, { serviceId, chosenWorkerId: slot.workerId, chosenWorkerAllowedServiceIdsLength: allowedLen, workerCanDoService: canDo });
      if (slot.followUp && slot.followUp.workerId && slot.followUp.serviceName) {
        const fuId = (slot.followUp.serviceId && slot.followUp.serviceId.trim()) ? slot.followUp.serviceId : slot.followUp.serviceName;
        const fuWorker = workers.find((w) => w.id === slot.followUp!.workerId);
        const fuAllowedLen = fuWorker && Array.isArray(fuWorker.services) ? fuWorker.services.length : 0;
        const fuCanDo = fuWorker ? workerCanDoService(fuWorker, fuId) : false;
        console.debug("[saveMultiServiceBooking] slot", i + 1, "followUp", { serviceId: fuId, chosenWorkerId: slot.followUp!.workerId, chosenWorkerAllowedServiceIdsLength: fuAllowedLen, workerCanDoService: fuCanDo });
      }
    }
  }

  const serviceItems = buildServiceItemsFromChain(chainSlots);
  const bookingGroupId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `visit-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
    serviceItems.forEach((item, index) => {
      const worker = item.workerId ? workers.find((w) => w.id === item.workerId) : null;
      const chosenWorkerAllowedServices = worker && Array.isArray(worker.services) ? [...worker.services] : [];
      const canDoById = worker && (item.serviceId && String(item.serviceId).trim()) ? workerCanDoService(worker, String(item.serviceId)) : false;
      const canDoByName = worker && item.serviceName ? workerCanDoService(worker, String(item.serviceName)) : false;
      const workerCanDoResult = canDoById || canDoByName;
      const why = workerCanDoResult ? (canDoByName ? "match_by_name" : "match_by_id") : "no_match";
      console.log(
        "TRACE_BOOKING_ASSIGNMENT",
        JSON.stringify({
          siteId,
          bookingGroupId,
          itemIndex: index + 1,
          phase: item.phase,
          serviceId: item.serviceId ?? null,
          serviceName: item.serviceName,
          requestedPreferredWorkerId: null,
          candidateWorkerIdsConsidered: [],
          chosenWorkerId: item.workerId,
          chosenWorkerName: item.workerName ?? null,
          chosenWorkerAllowedServices: chosenWorkerAllowedServices,
          workerCanDoServiceResult: workerCanDoResult,
          workerCanDoWhy: why,
        })
      );
    });
  }

  const clientId = await getOrCreateClient(siteId, {
    name: client.name,
    phone: client.phone,
    email: undefined,
    notes: client.note,
  });

  const bookingsRef = bookingsCollection(siteId);
  let firstBookingId = "";
  let lastPhase1DocId: string | null = null;
  const orderedTypeCount = multiPayload?.orderedServiceTypeIds?.length ?? 0;

  for (let stepIndex = 0; stepIndex < serviceItems.length; stepIndex++) {
    const item = serviceItems[stepIndex]!;
    const dateStr =
      item.startAt.getFullYear() +
      "-" +
      String(item.startAt.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(item.startAt.getDate()).padStart(2, "0");
    const timeStr =
      String(item.startAt.getHours()).padStart(2, "0") +
      ":" +
      String(item.startAt.getMinutes()).padStart(2, "0");

    const payload: Record<string, unknown> = {
      siteId,
      clientId,
      bookingGroupId,
      visitGroupId: bookingGroupId,
      customerName: client.name,
      customerPhone: client.phone,
      workerId: item.workerId,
      workerName: item.workerName ?? null,
      serviceId: item.serviceId ?? null,
      serviceName: item.serviceName,
      serviceTypeId: item.phase === 1 ? item.pricingItemId ?? null : null,
      serviceType: item.serviceType ?? null,
      durationMin: item.durationMin,
      startAt: Timestamp.fromDate(item.startAt),
      endAt: Timestamp.fromDate(item.endAt),
      dateISO: dateStr,
      timeHHmm: timeStr,
      date: dateStr,
      time: timeStr,
      status: "confirmed",
      phase: item.phase,
      serviceOrder: item.serviceOrder,
      note: client.note ?? null,
      serviceColor: item.serviceColor ?? null,
      price: null,
      priceSource: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (item.phase === 2 && lastPhase1DocId) {
      payload.parentBookingId = lastPhase1DocId;
    }
    if (multiPayload) {
      payload.isMultiBooking = true;
      payload.selectedServiceTypeIds = multiPayload.selectedServiceTypeIds;
      payload.orderedServiceTypeIds = multiPayload.orderedServiceTypeIds;
      payload.orderedServiceTypeIdsUsed = multiPayload.orderedServiceTypeIds;
      payload.multiBookingComboId = multiPayload.multiBookingComboId;
      payload.stepIndex = stepIndex;
      if (stepIndex >= orderedTypeCount) {
        payload.stepKind = "auto";
        const autoStep = multiPayload.appliedAutoSteps?.[stepIndex - orderedTypeCount];
        if (autoStep) {
          payload.durationMinutesOverride = autoStep.durationMinutesOverride;
        }
      }
      if (multiPayload.computedOffsetsMinutes?.length) {
        payload.computedOffsetsMinutes = multiPayload.computedOffsetsMinutes;
      }
      if (multiPayload.appliedAutoSteps?.length) {
        payload.appliedAutoSteps = multiPayload.appliedAutoSteps;
      }
    }
    const ref = await addDoc(bookingsRef, cleanUndefined(payload) as Record<string, unknown>);
    if (!firstBookingId) firstBookingId = ref.id;
    if (item.phase === 1) lastPhase1DocId = ref.id;

    if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log(
        "TRACE_BOOKING_SAVED",
        JSON.stringify({
          siteId,
          bookingGroupId,
          documentId: ref.id,
          workerId: item.workerId ?? null,
          serviceId: item.serviceId ?? null,
          serviceName: item.serviceName,
          phase: item.phase,
        })
      );
    }
  }

  return { visitGroupId: bookingGroupId, firstBookingId };
}

/**
 * Check if a slot is taken by querying Firestore
 */
export async function isSlotTaken(
  siteId: string,
  workerId: string,
  date: string,
  time: string
): Promise<boolean> {
  if (!db) return false;

  try {
    const bookingsRef = bookingsCollection(siteId);
    const q = query(
      bookingsRef,
      where("date", "==", date),
      where("time", "==", time),
      where("workerId", "==", workerId),
      where("status", "in", ["active", "confirmed"])
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (e) {
    console.error("Failed to check if slot is taken", e);
    return false;
  }
}

/**
 * Cancel a booking (soft delete - sets status to cancelled)
 */
export async function cancelBooking(
  siteId: string, 
  bookingId: string, 
  cancellationReason?: string,
  cancelledBy?: string
): Promise<void> {
  if (!db) {
    throw new Error("Firestore db not initialized");
  }

  try {
    await updateDoc(bookingDoc(siteId, bookingId), {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledBy: cancelledBy || "admin",
      cancellationReason: cancellationReason || null,
      updatedAt: serverTimestamp(),
    });
    console.log("[cancelBooking] cancelled booking", { siteId, bookingId });
  } catch (e) {
    console.error("Failed to cancel booking in Firestore", e);
    throw e;
  }
}

/**
 * Archive a booking (soft delete). It disappears from the calendar but remains in DB and in client history.
 * Replaces the document with only: date, serviceName, serviceType, workerId, workerName, customerPhone,
 * customerName, and archive metadata (isArchived, archivedAt, archivedReason) to save space.
 * Use archivedReason "manual" for user-initiated delete, "auto" for expired/cleanup.
 */
export async function archiveBooking(
  siteId: string,
  bookingId: string,
  reason: "manual" | "auto"
): Promise<void> {
  if (!db) {
    throw new Error("Firestore db not initialized");
  }
  const ref = bookingDoc(siteId, bookingId);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new Error("Booking not found");
    }
    const d = snap.data();
    const statusAtArchive = (d.status != null && String(d.status).trim()) ? String(d.status).trim() : "booked";
    if (process.env.NODE_ENV !== "production") {
      console.log("ARCHIVE PAYLOAD", { bookingId, status: d.status, statusAtArchive });
    }
    const dateStr = (d.date as string) ?? (d.dateISO as string) ?? "";
    const customerPhone = (d.customerPhone as string) ?? (d.phone as string) ?? "";
    const minimal: Record<string, unknown> = {
      date: dateStr,
      serviceName: (d.serviceName as string) ?? "",
      serviceType: (d.serviceType as string) ?? null,
      serviceId: (d.serviceId as string) ?? null,
      workerId: (d.workerId as string) ?? null,
      workerName: (d.workerName as string) ?? null,
      customerPhone,
      customerName: (d.customerName as string) ?? (d.name as string) ?? "",
      clientId: (d.clientId as string) ?? null,
      bookingGroupId: (d.bookingGroupId as string) ?? (d.visitGroupId as string) ?? null,
      isArchived: true,
      archivedAt: serverTimestamp(),
      archivedReason: reason,
      statusAtArchive,
    };
    await setDoc(ref, cleanUndefined(minimal));
    console.log("[archiveBooking] archived and trimmed booking", { siteId, bookingId, reason });
  } catch (e) {
    console.error("Failed to archive booking in Firestore", e);
    throw e;
  }
}

/**
 * "Delete" a booking: archives it (soft delete) so it stays in client history but is hidden from the calendar.
 * UI wording can stay "delete"; behavior is archive.
 */
export async function deleteBooking(siteId: string, bookingId: string): Promise<void> {
  await archiveBooking(siteId, bookingId, "manual");
}
