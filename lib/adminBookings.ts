/**
 * Admin booking create/update with consistent phase 1 + phase 2 docs.
 * Uses batch/sequential writes so phase 1 and phase 2 stay consistent.
 * Validates worker conflicts (no overlapping bookings for same worker) before write.
 */

import { addDoc, getDoc, updateDoc, writeBatch, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "./firebaseClient";
import { bookingsCollection, bookingDoc } from "./firestorePaths";
import { getOrCreateClient } from "./firestoreClients";
import { computePhases } from "./bookingPhasesTiming";
import { checkWorkerConflicts } from "./bookingConflicts";
import { deriveBookingStatusForWrite } from "./bookingStatusForWrite";

function cleanUndefined<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (typeof (value as { toMillis?: unknown }).toMillis === "function") return value;
  if (typeof (value as { toDate?: unknown }).toDate === "function") return value;
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return value;
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

export interface AdminPhase2Payload {
  enabled: boolean;
  serviceName: string;
  waitMinutes: number;
  durationMin: number;
  /** If set, use this worker for phase 2; otherwise auto-resolve. */
  workerIdOverride?: string | null;
  workerNameOverride?: string | null;
  /** Phase-2 service color for calendar display (follow-up service, not phase-1). */
  serviceColor?: string | null;
  /** Phase-2 service id for calendar/display (follow-up service, not phase-1). */
  serviceId?: string | null;
}

export interface AdminBookingPayload {
  customerName: string;
  customerPhone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  phase1: {
    serviceName: string;
    serviceTypeId?: string | null;
    serviceType?: string | null;
    workerId: string;
    workerName: string;
    durationMin: number;
    serviceColor?: string | null;
    /** Main service id for calendar/display. */
    serviceId?: string | null;
  };
  phase2?: AdminPhase2Payload | null;
  note?: string | null;
  /** הערות – booking notes (saved on booking doc as `notes`). */
  notes?: string | null;
  status?: "booked" | "confirmed" | "cancelled" | "active";
  price?: number | null;
}

/**
 * Create phase 1 and optionally phase 2 booking docs. Phase 2 doc links via parentBookingId.
 */
export async function createAdminBooking(
  siteId: string,
  payload: AdminBookingPayload
): Promise<{ phase1Id: string; phase2Id?: string }> {
  if (!db) throw new Error("Firestore not initialized");

  const clientId = await getOrCreateClient(siteId, {
    name: payload.customerName.trim(),
    phone: payload.customerPhone.trim(),
    email: undefined,
    notes: payload.note ?? undefined,
  });

  const [y, m, d] = payload.date.split("-").map(Number);
  const [hh, mm] = payload.time.split(":").map(Number);
  const phase1StartAt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);

  const durationMin = payload.phase1.durationMin ?? 30;
  const hasPhase2 =
    payload.phase2?.enabled &&
    !!payload.phase2.serviceName?.trim() &&
    (payload.phase2.durationMin ?? 0) >= 1;
  const waitMin = hasPhase2 ? Math.max(0, payload.phase2!.waitMinutes ?? 0) : 0;
  const phase2DurationMin = hasPhase2 ? payload.phase2!.durationMin : 0;

  const phases = computePhases({
    startAt: phase1StartAt,
    durationMinutes: durationMin,
    waitMinutes: waitMin,
    followUpDurationMinutes: phase2DurationMin,
  });

  const dateStr = payload.date;
  const timeStr = payload.time;
  const status = deriveBookingStatusForWrite({ status: payload.status }, "create");

  const phase1Conflict = await checkWorkerConflicts({
    siteId,
    workerId: payload.phase1.workerId,
    dayISO: dateStr,
    startAt: phases.phase1StartAt,
    endAt: phases.phase1EndAt,
    excludeBookingIds: [],
  });
  if (phase1Conflict.hasConflict && phase1Conflict.conflictingBooking) {
    throw new Error(`Worker is already booked from ${phase1Conflict.conflictingBooking.timeRange}`);
  }
  if (hasPhase2 && payload.phase2) {
    const phase2Start = phases.phase2StartAt;
    const phase2End = phases.phase2EndAt;
    const phase2DateStr =
      phase2Start.getFullYear() +
      "-" +
      String(phase2Start.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(phase2Start.getDate()).padStart(2, "0");
    const phase2WorkerId = payload.phase2.workerIdOverride ?? payload.phase1.workerId;
    const phase2Conflict = await checkWorkerConflicts({
      siteId,
      workerId: phase2WorkerId,
      dayISO: phase2DateStr,
      startAt: phase2Start,
      endAt: phase2End,
      excludeBookingIds: [],
    });
    if (phase2Conflict.hasConflict && phase2Conflict.conflictingBooking) {
      throw new Error(`Worker (phase 2) is already booked from ${phase2Conflict.conflictingBooking.timeRange}`);
    }
  }

  const bookingA: Record<string, unknown> = {
    siteId,
    clientId,
    customerName: payload.customerName.trim(),
    customerPhone: payload.customerPhone.trim(),
    workerId: payload.phase1.workerId,
    workerName: payload.phase1.workerName,
    serviceTypeId: payload.phase1.serviceTypeId ?? null,
    serviceName: payload.phase1.serviceName,
    serviceType: payload.phase1.serviceType ?? null,
    serviceId: payload.phase1.serviceId ?? null,
    durationMin,
    startAt: Timestamp.fromDate(phases.phase1StartAt),
    endAt: Timestamp.fromDate(phases.phase1EndAt),
    dateISO: dateStr,
    timeHHmm: timeStr,
    date: dateStr,
    time: timeStr,
    status,
    phase: 1,
    note: payload.note ?? null,
    notes: payload.notes ?? null,
    serviceColor: payload.phase1.serviceColor ?? null,
    price: payload.price ?? null,
    priceSource: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(hasPhase2 && { waitMinutes: waitMin }),
  };
  if (process.env.NODE_ENV === "development") {
    console.log("[createBooking] writing booking (phase1) status:", status);
  }
  const refA = await addDoc(bookingsCollection(siteId), cleanUndefined(bookingA) as Record<string, unknown>);
  const phase1Id = refA.id;
  if (process.env.NODE_ENV === "development") {
    console.log("[createBooking] bookingId", phase1Id, "status:", status);
  }
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
    console.log("TRACE_BOOKING_SAVED", JSON.stringify({ siteId, bookingGroupId: null, documentId: refA.id, workerId: payload.phase1.workerId, serviceId: payload.phase1.serviceId ?? null, serviceName: payload.phase1.serviceName, phase: 1 }));
  }

  let phase2Id: string | undefined;
  if (hasPhase2 && payload.phase2) {
    const phase2Start = phases.phase2StartAt;
    const phase2End = phases.phase2EndAt;
    const phase2DateStr =
      phase2Start.getFullYear() +
      "-" +
      String(phase2Start.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(phase2Start.getDate()).padStart(2, "0");
    const phase2TimeStr =
      String(phase2Start.getHours()).padStart(2, "0") +
      ":" +
      String(phase2Start.getMinutes()).padStart(2, "0");
    const phase2WorkerId =
      payload.phase2.workerIdOverride ?? payload.phase1.workerId;
    const phase2WorkerName =
      payload.phase2.workerNameOverride ?? payload.phase1.workerName;

    if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log("TRACE_BOOKING_ASSIGNMENT", JSON.stringify({ siteId, bookingGroupId: null, itemIndex: 2, phase: 2, serviceId: null, serviceName: payload.phase2.serviceName.trim(), requestedPreferredWorkerId: payload.phase1.workerId, candidateWorkerIdsConsidered: [], chosenWorkerId: phase2WorkerId, chosenWorkerName: phase2WorkerName, chosenWorkerAllowedServices: [], workerCanDoServiceResult: null, workerCanDoWhy: phase2WorkerId !== payload.phase1.workerId ? "override" : "inherited_from_phase1" }));
    }

    const bookingB: Record<string, unknown> = {
      siteId,
      clientId,
      customerName: payload.customerName.trim(),
      customerPhone: payload.customerPhone.trim(),
      workerId: phase2WorkerId,
      workerName: phase2WorkerName,
      serviceTypeId: null,
      serviceName: payload.phase2.serviceName.trim(),
      serviceType: null,
      durationMin: payload.phase2.durationMin,
      startAt: Timestamp.fromDate(phase2Start),
      endAt: Timestamp.fromDate(phase2End),
      dateISO: phase2DateStr,
      timeHHmm: phase2TimeStr,
      date: phase2DateStr,
      time: phase2TimeStr,
      status,
      phase: 2,
      parentBookingId: phase1Id,
      note: payload.note ?? null,
      notes: payload.notes ?? null,
      serviceColor: payload.phase2.serviceColor ?? null,
      price: null,
      priceSource: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const refB = await addDoc(bookingsCollection(siteId), cleanUndefined(bookingB) as Record<string, unknown>);
    phase2Id = refB.id;
    if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEBUG_BOOKING === "true") {
      console.log("TRACE_BOOKING_SAVED", JSON.stringify({ siteId, bookingGroupId: null, documentId: refB.id, workerId: phase2WorkerId, serviceId: null, serviceName: payload.phase2.serviceName.trim(), phase: 2 }));
    }
  }

  return { phase1Id, phase2Id };
}

/**
 * Update phase 1 and optionally phase 2. If phase 2 is removed, soft-cancel the phase 2 doc.
 * Uses writeBatch for atomicity.
 * NOTE: This recomputes and rewrites phase 2 from phase 1 times (cascade). For single-slot edits
 * (admin edits one block only), use updatePhase1Only or updatePhase2Only so related bookings are not changed.
 */
export async function updateAdminBooking(
  siteId: string,
  phase1Id: string,
  phase2Id: string | null,
  payload: AdminBookingPayload
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");

  const clientId = await getOrCreateClient(siteId, {
    name: payload.customerName.trim(),
    phone: payload.customerPhone.trim(),
    email: undefined,
    notes: payload.note ?? undefined,
  });

  const [y, m, d] = payload.date.split("-").map(Number);
  const [hh, mm] = payload.time.split(":").map(Number);
  const phase1StartAt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);

  const durationMin = payload.phase1.durationMin ?? 30;
  const hasPhase2 =
    payload.phase2?.enabled &&
    !!payload.phase2.serviceName?.trim() &&
    (payload.phase2.durationMin ?? 0) >= 1;
  const waitMin = hasPhase2 ? Math.max(0, payload.phase2!.waitMinutes ?? 0) : 0;
  const phase2DurationMin = hasPhase2 ? payload.phase2!.durationMin : 0;

  const phases = computePhases({
    startAt: phase1StartAt,
    durationMinutes: durationMin,
    waitMinutes: waitMin,
    followUpDurationMinutes: phase2DurationMin,
  });

  const dateStr = payload.date;
  const timeStr = payload.time;

  const phase1Ref = bookingDoc(siteId, phase1Id);
  const phase1Snap = await getDoc(phase1Ref);
  const existingWhatsappStatus = phase1Snap.exists() ? (phase1Snap.data() as { whatsappStatus?: string })?.whatsappStatus : undefined;
  const status =
    payload.status !== undefined
      ? deriveBookingStatusForWrite(
          { status: payload.status, whatsappStatus: existingWhatsappStatus },
          "update",
          "updateAdminBooking"
        )
      : undefined;

  const excludeIds: string[] = [phase1Id, phase2Id].filter(
    (x): x is string => x !== null && typeof x === "string" && x.length > 0
  );
  const phase1Conflict = await checkWorkerConflicts({
    siteId,
    workerId: payload.phase1.workerId,
    dayISO: dateStr,
    startAt: phases.phase1StartAt,
    endAt: phases.phase1EndAt,
    excludeBookingIds: excludeIds,
  });
  if (phase1Conflict.hasConflict && phase1Conflict.conflictingBooking) {
    throw new Error(`Worker is already booked from ${phase1Conflict.conflictingBooking.timeRange}`);
  }
  if (hasPhase2 && payload.phase2) {
    const phase2Start = phases.phase2StartAt;
    const phase2End = phases.phase2EndAt;
    const phase2DateStr =
      phase2Start.getFullYear() +
      "-" +
      String(phase2Start.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(phase2Start.getDate()).padStart(2, "0");
    const phase2WorkerId = payload.phase2.workerIdOverride ?? payload.phase1.workerId;
    const phase2Conflict = await checkWorkerConflicts({
      siteId,
      workerId: phase2WorkerId,
      dayISO: phase2DateStr,
      startAt: phase2Start,
      endAt: phase2End,
      excludeBookingIds: excludeIds,
    });
    if (phase2Conflict.hasConflict && phase2Conflict.conflictingBooking) {
      throw new Error(`Worker (phase 2) is already booked from ${phase2Conflict.conflictingBooking.timeRange}`);
    }
  }

  const batch = writeBatch(db);

  const phase1Update: Record<string, unknown> = {
    clientId,
    customerName: payload.customerName.trim(),
    customerPhone: payload.customerPhone.trim(),
    workerId: payload.phase1.workerId,
    workerName: payload.phase1.workerName,
    serviceTypeId: payload.phase1.serviceTypeId ?? null,
    serviceName: payload.phase1.serviceName,
    serviceType: payload.phase1.serviceType ?? null,
    serviceId: payload.phase1.serviceId ?? null,
    durationMin,
    startAt: Timestamp.fromDate(phases.phase1StartAt),
    endAt: Timestamp.fromDate(phases.phase1EndAt),
    dateISO: dateStr,
    timeHHmm: timeStr,
    date: dateStr,
    time: timeStr,
    ...(status !== undefined && { status }),
    note: payload.note ?? null,
    notes: payload.notes ?? null,
    serviceColor: payload.phase1.serviceColor ?? null,
    price: payload.price ?? null,
    updatedAt: serverTimestamp(),
    ...(hasPhase2 && { waitMinutes: waitMin }),
  };
  if (process.env.NODE_ENV === "development" && status !== undefined) {
    console.log("[statusUpdate] booking", phase1Id, "to:", status, "reason: updateAdminBooking");
  }
  batch.update(phase1Ref, cleanUndefined(phase1Update) as Record<string, unknown>);

  if (hasPhase2 && payload.phase2) {
    const phase2Start = phases.phase2StartAt;
    const phase2End = phases.phase2EndAt;
    const phase2DateStr =
      phase2Start.getFullYear() +
      "-" +
      String(phase2Start.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(phase2Start.getDate()).padStart(2, "0");
    const phase2TimeStr =
      String(phase2Start.getHours()).padStart(2, "0") +
      ":" +
      String(phase2Start.getMinutes()).padStart(2, "0");
    const phase2WorkerId =
      payload.phase2.workerIdOverride ?? payload.phase1.workerId;
    const phase2WorkerName =
      payload.phase2.workerNameOverride ?? payload.phase1.workerName;

    if (phase2Id) {
      const phase2Ref = bookingDoc(siteId, phase2Id);
      batch.update(phase2Ref, cleanUndefined({
        clientId,
        customerName: payload.customerName.trim(),
        customerPhone: payload.customerPhone.trim(),
        workerId: phase2WorkerId,
        workerName: phase2WorkerName,
        serviceName: payload.phase2.serviceName.trim(),
        serviceId: payload.phase2.serviceId ?? null,
        durationMin: payload.phase2.durationMin,
        startAt: Timestamp.fromDate(phase2Start),
        endAt: Timestamp.fromDate(phase2End),
        dateISO: phase2DateStr,
        timeHHmm: phase2TimeStr,
        date: phase2DateStr,
        time: phase2TimeStr,
        ...(status !== undefined && { status }),
        note: payload.note ?? null,
        notes: payload.notes ?? null,
        serviceColor: payload.phase2.serviceColor ?? null,
        updatedAt: serverTimestamp(),
      }) as Record<string, unknown>);
    }
  } else if (phase2Id) {
    const phase2Ref = bookingDoc(siteId, phase2Id);
    batch.update(phase2Ref, {
      status: "cancelled",
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  if (hasPhase2 && payload.phase2 && !phase2Id) {
    const phase2Start = phases.phase2StartAt;
    const phase2End = phases.phase2EndAt;
    const phase2DateStr =
      phase2Start.getFullYear() +
      "-" +
      String(phase2Start.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(phase2Start.getDate()).padStart(2, "0");
    const phase2TimeStr =
      String(phase2Start.getHours()).padStart(2, "0") +
      ":" +
      String(phase2Start.getMinutes()).padStart(2, "0");
    const phase2WorkerId =
      payload.phase2.workerIdOverride ?? payload.phase1.workerId;
    const phase2WorkerName =
      payload.phase2.workerNameOverride ?? payload.phase1.workerName;
    const newPhase2Doc = {
      siteId,
      clientId,
      customerName: payload.customerName.trim(),
      customerPhone: payload.customerPhone.trim(),
      workerId: phase2WorkerId,
      workerName: phase2WorkerName,
      serviceTypeId: null,
      serviceName: payload.phase2.serviceName.trim(),
      serviceType: null,
      serviceId: payload.phase2.serviceId ?? null,
      durationMin: payload.phase2.durationMin,
      startAt: Timestamp.fromDate(phase2Start),
      endAt: Timestamp.fromDate(phase2End),
      dateISO: phase2DateStr,
      timeHHmm: phase2TimeStr,
      date: phase2DateStr,
      time: phase2TimeStr,
      status,
      phase: 2,
      parentBookingId: phase1Id,
      note: payload.note ?? null,
      notes: payload.notes ?? null,
      serviceColor: payload.phase2.serviceColor ?? null,
      price: null,
      priceSource: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await addDoc(bookingsCollection(siteId), cleanUndefined(newPhase2Doc) as Record<string, unknown>);
  }
}

/**
 * Update only the phase 1 (main) booking. Phase 2 and any other related bookings are unchanged.
 * Used when admin edits the phase 1 block (date/time/worker/duration) so that follow-ups are not shifted.
 * Writes updateMeta: { source: "admin", scope: "single" } so backend triggers can skip cascade.
 */
export async function updatePhase1Only(
  siteId: string,
  phase1Id: string,
  payload: AdminBookingPayload
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");

  const clientId = await getOrCreateClient(siteId, {
    name: payload.customerName.trim(),
    phone: payload.customerPhone.trim(),
    email: undefined,
    notes: payload.note ?? undefined,
  });

  const [y, m, d] = payload.date.split("-").map(Number);
  const [hh, mm] = payload.time.split(":").map(Number);
  const phase1StartAt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  const durationMin = payload.phase1.durationMin ?? 30;
  const phase1EndAt = new Date(
    phase1StartAt.getTime() + Math.max(1, durationMin) * 60 * 1000
  );

  const dateStr = payload.date;
  const timeStr = payload.time;

  const phase1Conflict = await checkWorkerConflicts({
    siteId,
    workerId: payload.phase1.workerId,
    dayISO: dateStr,
    startAt: phase1StartAt,
    endAt: phase1EndAt,
    excludeBookingIds: [phase1Id],
  });
  if (phase1Conflict.hasConflict && phase1Conflict.conflictingBooking) {
    throw new Error(`Worker is already booked from ${phase1Conflict.conflictingBooking.timeRange}`);
  }

  const phase1Ref = bookingDoc(siteId, phase1Id);
  const phase1Snap = await getDoc(phase1Ref);
  const existingWhatsappStatus = phase1Snap.exists() ? (phase1Snap.data() as { whatsappStatus?: string })?.whatsappStatus : undefined;
  const statusForWrite =
    payload.status !== undefined
      ? deriveBookingStatusForWrite(
          { status: payload.status, whatsappStatus: existingWhatsappStatus },
          "update",
          "updatePhase1Only"
        )
      : undefined;
  const phase1Update: Record<string, unknown> = {
    clientId,
    customerName: payload.customerName.trim(),
    customerPhone: payload.customerPhone.trim(),
    workerId: payload.phase1.workerId,
    workerName: payload.phase1.workerName,
    serviceTypeId: payload.phase1.serviceTypeId ?? null,
    serviceName: payload.phase1.serviceName,
    serviceType: payload.phase1.serviceType ?? null,
    serviceId: payload.phase1.serviceId ?? null,
    durationMin,
    startAt: Timestamp.fromDate(phase1StartAt),
    endAt: Timestamp.fromDate(phase1EndAt),
    dateISO: dateStr,
    timeHHmm: timeStr,
    date: dateStr,
    time: timeStr,
    ...(statusForWrite !== undefined && { status: statusForWrite }),
    note: payload.note ?? null,
    notes: payload.notes ?? null,
    serviceColor: payload.phase1.serviceColor ?? null,
    price: payload.price ?? null,
    updatedAt: serverTimestamp(),
    updateMeta: { source: "admin", scope: "single", ts: Date.now() },
  };
  if (process.env.NODE_ENV === "development" && statusForWrite !== undefined) {
    console.log("[statusUpdate] booking", phase1Id, "to:", statusForWrite, "reason: updatePhase1Only");
  }
  await updateDoc(phase1Ref, cleanUndefined(phase1Update) as Record<string, unknown>);
}

/**
 * Update only the phase 2 (follow-up) booking. Phase 1 is unchanged.
 * Used when user clicks the phase 2 block and edits its time/worker/duration.
 * Writes updateMeta: { source: "admin", scope: "single" } so backend triggers can skip cascade.
 */
export async function updatePhase2Only(
  siteId: string,
  phase2Id: string,
  payload: {
    date: string;
    time: string;
    workerId: string;
    workerName: string;
    durationMin: number;
  }
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");

  const [y, m, d] = payload.date.split("-").map(Number);
  const [hh, mm] = payload.time.split(":").map(Number);
  const phase2StartAt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  const phase2EndAt = new Date(
    phase2StartAt.getTime() + Math.max(1, payload.durationMin) * 60 * 1000
  );

  const dateStr =
    phase2StartAt.getFullYear() +
    "-" +
    String(phase2StartAt.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(phase2StartAt.getDate()).padStart(2, "0");
  const timeStr =
    String(phase2StartAt.getHours()).padStart(2, "0") +
    ":" +
    String(phase2StartAt.getMinutes()).padStart(2, "0");

  const phase2Conflict = await checkWorkerConflicts({
    siteId,
    workerId: payload.workerId,
    dayISO: dateStr,
    startAt: phase2StartAt,
    endAt: phase2EndAt,
    excludeBookingIds: [phase2Id],
  });
  if (phase2Conflict.hasConflict && phase2Conflict.conflictingBooking) {
    throw new Error(
      `Worker is already booked from ${phase2Conflict.conflictingBooking.timeRange}`
    );
  }

  const phase2Ref = bookingDoc(siteId, phase2Id);
  const phase2Update: Record<string, unknown> = {
    workerId: payload.workerId,
    workerName: payload.workerName,
    durationMin: Math.max(1, payload.durationMin),
    startAt: Timestamp.fromDate(phase2StartAt),
    endAt: Timestamp.fromDate(phase2EndAt),
    dateISO: dateStr,
    timeHHmm: timeStr,
    date: dateStr,
    time: timeStr,
    updatedAt: serverTimestamp(),
    updateMeta: { source: "admin", scope: "single", ts: Date.now() },
  };
  await updateDoc(phase2Ref, cleanUndefined(phase2Update) as Record<string, unknown>);
}

/** Admin multi-service visit: one slot per service, sequential timing. */
export interface AdminMultiServiceSlot {
  serviceId?: string | null;
  serviceName: string;
  durationMin: number;
  workerId: string;
  workerName: string;
}

/**
 * Create a multi-service visit. Each service = one booking doc with visitGroupId and serviceOrder.
 * Does not change existing createAdminBooking.
 */
export async function createAdminMultiServiceVisit(
  siteId: string,
  payload: {
    customerName: string;
    customerPhone: string;
    date: string;
    time: string;
    slots: AdminMultiServiceSlot[];
    note?: string | null;
  }
): Promise<{ visitGroupId: string; firstBookingId: string }> {
  if (!db) throw new Error("Firestore not initialized");
  if (payload.slots.length === 0) throw new Error("At least one service required");

  const bookingGroupId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `visit-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const clientId = await getOrCreateClient(siteId, {
    name: payload.customerName.trim(),
    phone: payload.customerPhone.trim(),
    email: undefined,
    notes: payload.note ?? undefined,
  });

  const [y, m, d] = payload.date.split("-").map(Number);
  const [hh, mm] = payload.time.split(":").map(Number);
  let cursor = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);

  const bookingsRef = bookingsCollection(siteId);
  let firstBookingId = "";

  for (let i = 0; i < payload.slots.length; i++) {
    const slot = payload.slots[i]!;
    const durationMin = Math.max(1, Math.min(480, slot.durationMin));
    const endAt = new Date(cursor.getTime() + durationMin * 60 * 1000);

    const dateStr =
      cursor.getFullYear() +
      "-" +
      String(cursor.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(cursor.getDate()).padStart(2, "0");
    const timeStr =
      String(cursor.getHours()).padStart(2, "0") +
      ":" +
      String(cursor.getMinutes()).padStart(2, "0");

    const conflict = await checkWorkerConflicts({
      siteId,
      workerId: slot.workerId,
      dayISO: dateStr,
      startAt: cursor,
      endAt,
      excludeBookingIds: [],
    });
    if (conflict.hasConflict && conflict.conflictingBooking) {
      throw new Error(`Worker ${slot.workerName} is busy: ${conflict.conflictingBooking.timeRange}`);
    }

    const doc: Record<string, unknown> = {
      siteId,
      clientId,
      bookingGroupId,
      visitGroupId: bookingGroupId,
      customerName: payload.customerName.trim(),
      customerPhone: payload.customerPhone.trim(),
      workerId: slot.workerId,
      workerName: slot.workerName,
      serviceId: (slot.serviceId && String(slot.serviceId).trim()) ? slot.serviceId : null,
      serviceName: slot.serviceName,
      serviceTypeId: null,
      serviceType: null,
      durationMin,
      startAt: Timestamp.fromDate(cursor),
      endAt: Timestamp.fromDate(endAt),
      dateISO: dateStr,
      timeHHmm: timeStr,
      date: dateStr,
      time: timeStr,
      status: deriveBookingStatusForWrite({ status: "booked" }, "create"),
      phase: 1,
      note: payload.note ?? null,
      serviceColor: null,
      price: null,
      priceSource: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      serviceOrder: i,
    };
    if (process.env.NODE_ENV === "development") {
      console.log("[createBooking] writing booking (multi-service) status: booked");
    }
    const ref = await addDoc(bookingsRef, cleanUndefined(doc) as Record<string, unknown>);
    if (!firstBookingId) firstBookingId = ref.id;
    if (process.env.NODE_ENV === "development") {
      console.log("[createBooking] bookingId", ref.id, "status: booked");
    }
    if (process.env.NODE_ENV !== "production") {
      console.log("[createAdminMultiServiceVisit] saved document", { docId: ref.id, serviceId: slot.serviceId ?? slot.serviceName, workerId: slot.workerId });
    }
    cursor = endAt;
  }

  return { visitGroupId: bookingGroupId, firstBookingId };
}
