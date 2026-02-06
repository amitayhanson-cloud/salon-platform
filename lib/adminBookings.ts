/**
 * Admin booking create/update with consistent phase 1 + phase 2 docs.
 * Uses batch/sequential writes so phase 1 and phase 2 stay consistent.
 * Validates worker conflicts (no overlapping bookings for same worker) before write.
 */

import { addDoc, updateDoc, writeBatch, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "./firebaseClient";
import { bookingsCollection, bookingDoc } from "./firestorePaths";
import { getOrCreateClient } from "./firestoreClients";
import { computePhases } from "./bookingPhasesTiming";
import { checkWorkerConflicts } from "./bookingConflicts";

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
  };
  phase2?: AdminPhase2Payload | null;
  note?: string | null;
  status?: "confirmed" | "cancelled" | "active";
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
  const status = payload.status ?? "confirmed";

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
    serviceColor: payload.phase1.serviceColor ?? null,
    price: payload.price ?? null,
    priceSource: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(hasPhase2 && { waitMinutes: waitMin }),
  };
  const refA = await addDoc(bookingsCollection(siteId), cleanUndefined(bookingA) as Record<string, unknown>);
  const phase1Id = refA.id;

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
      serviceColor: payload.phase1.serviceColor ?? null,
      price: null,
      priceSource: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const refB = await addDoc(bookingsCollection(siteId), cleanUndefined(bookingB) as Record<string, unknown>);
    phase2Id = refB.id;
  }

  return { phase1Id, phase2Id };
}

/**
 * Update phase 1 and optionally phase 2. If phase 2 is removed, soft-cancel the phase 2 doc.
 * Uses writeBatch for atomicity.
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
  const status = payload.status ?? "confirmed";

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

  const phase1Ref = bookingDoc(siteId, phase1Id);
  const phase1Update: Record<string, unknown> = {
    clientId,
    customerName: payload.customerName.trim(),
    customerPhone: payload.customerPhone.trim(),
    workerId: payload.phase1.workerId,
    workerName: payload.phase1.workerName,
    serviceTypeId: payload.phase1.serviceTypeId ?? null,
    serviceName: payload.phase1.serviceName,
    serviceType: payload.phase1.serviceType ?? null,
    durationMin,
    startAt: Timestamp.fromDate(phases.phase1StartAt),
    endAt: Timestamp.fromDate(phases.phase1EndAt),
    dateISO: dateStr,
    timeHHmm: timeStr,
    date: dateStr,
    time: timeStr,
    status,
    note: payload.note ?? null,
    serviceColor: payload.phase1.serviceColor ?? null,
    price: payload.price ?? null,
    updatedAt: serverTimestamp(),
    ...(hasPhase2 && { waitMinutes: waitMin }),
  };
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
        durationMin: payload.phase2.durationMin,
        startAt: Timestamp.fromDate(phase2Start),
        endAt: Timestamp.fromDate(phase2End),
        dateISO: phase2DateStr,
        timeHHmm: phase2TimeStr,
        date: phase2DateStr,
        time: phase2TimeStr,
        status,
        note: payload.note ?? null,
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
      serviceColor: payload.phase1.serviceColor ?? null,
      price: null,
      priceSource: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await addDoc(bookingsCollection(siteId), cleanUndefined(newPhase2Doc) as Record<string, unknown>);
  }
}
