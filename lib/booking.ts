import { addDoc, getDocs, getDoc, setDoc, query, where, orderBy, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebaseClient";
import { bookingsCollection, bookingDoc } from "./firestorePaths";
import { getOrCreateClient } from "./firestoreClients";
import { computePhases } from "./bookingPhasesTiming";
import { getPersonalPricing } from "./firestorePersonalPricing";
import { resolveServicePrice } from "./pricingUtils";

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
    durationMin: number;
    waitMin: number;
    startAt: Date;
    endAt: Date;
    workerId: string | null;
    workerName: string | null;
  };
}

/**
 * Save multi-service booking chain. Creates one booking doc per service (and per follow-up).
 * Adds visitGroupId and serviceOrder. Does not change existing saveBooking.
 */
export async function saveMultiServiceBooking(
  siteId: string,
  chainSlots: ChainSlotForSave[],
  client: { name: string; phone: string; note?: string }
): Promise<{ visitGroupId: string; firstBookingId: string }> {
  if (!db) throw new Error("Firestore db not initialized");
  if (chainSlots.length === 0) throw new Error("Chain must have at least one service");

  const visitGroupId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `visit-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const clientId = await getOrCreateClient(siteId, {
    name: client.name,
    phone: client.phone,
    email: undefined,
    notes: client.note,
  });

  const bookingsRef = bookingsCollection(siteId);
  let firstBookingId = "";

  for (const slot of chainSlots) {
    const dateStr =
      slot.startAt.getFullYear() +
      "-" +
      String(slot.startAt.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(slot.startAt.getDate()).padStart(2, "0");
    const timeStr =
      String(slot.startAt.getHours()).padStart(2, "0") +
      ":" +
      String(slot.startAt.getMinutes()).padStart(2, "0");

    const phase1: Record<string, unknown> = {
      siteId,
      clientId,
      customerName: client.name,
      customerPhone: client.phone,
      workerId: slot.workerId,
      workerName: slot.workerName ?? null,
      serviceTypeId: slot.pricingItemId ?? null,
      serviceName: slot.serviceName,
      serviceType: slot.serviceType ?? null,
      durationMin: slot.durationMin,
      startAt: Timestamp.fromDate(slot.startAt),
      endAt: Timestamp.fromDate(slot.endAt),
      dateISO: dateStr,
      timeHHmm: timeStr,
      date: dateStr,
      time: timeStr,
      status: "confirmed",
      phase: 1,
      note: client.note ?? null,
      serviceColor: slot.serviceColor ?? null,
      price: null,
      priceSource: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      visitGroupId,
      serviceOrder: slot.serviceOrder,
      ...(slot.followUp && slot.followUp.durationMin >= 1 && { waitMinutes: slot.followUp.waitMin }),
    };
    const refA = await addDoc(bookingsRef, cleanUndefined(phase1) as Record<string, unknown>);
    if (!firstBookingId) firstBookingId = refA.id;

    if (slot.followUp && slot.followUp.durationMin >= 1 && slot.followUp.serviceName) {
      const fu = slot.followUp;
      const fuDateStr =
        fu.startAt.getFullYear() +
        "-" +
        String(fu.startAt.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(fu.startAt.getDate()).padStart(2, "0");
      const fuTimeStr =
        String(fu.startAt.getHours()).padStart(2, "0") +
        ":" +
        String(fu.startAt.getMinutes()).padStart(2, "0");
      const phase2: Record<string, unknown> = {
        siteId,
        clientId,
        customerName: client.name,
        customerPhone: client.phone,
        workerId: fu.workerId,
        workerName: fu.workerName ?? null,
        serviceTypeId: null,
        serviceName: fu.serviceName,
        serviceType: null,
        durationMin: fu.durationMin,
        startAt: Timestamp.fromDate(fu.startAt),
        endAt: Timestamp.fromDate(fu.endAt),
        dateISO: fuDateStr,
        timeHHmm: fuTimeStr,
        date: fuDateStr,
        time: fuTimeStr,
        status: "confirmed",
        phase: 2,
        parentBookingId: refA.id,
        note: client.note ?? null,
        serviceColor: slot.serviceColor ?? null,
        price: null,
        priceSource: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        visitGroupId,
        serviceOrder: slot.serviceOrder,
      };
      await addDoc(bookingsRef, cleanUndefined(phase2) as Record<string, unknown>);
    }
  }

  return { visitGroupId, firstBookingId };
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
    const dateStr = (d.date as string) ?? (d.dateISO as string) ?? "";
    const customerPhone = (d.customerPhone as string) ?? (d.phone as string) ?? "";
    const minimal: Record<string, unknown> = {
      date: dateStr,
      serviceName: (d.serviceName as string) ?? "",
      serviceType: (d.serviceType as string) ?? null,
      workerId: (d.workerId as string) ?? null,
      workerName: (d.workerName as string) ?? null,
      customerPhone,
      customerName: (d.customerName as string) ?? (d.name as string) ?? "",
      isArchived: true,
      archivedAt: serverTimestamp(),
      archivedReason: reason,
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
