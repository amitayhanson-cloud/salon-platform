/**
 * Server-side import: dry-run (validate + count) and execute (batch write).
 * Uses Firebase Admin (getAdminDb). Run only in API routes.
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import type { ColumnMapping, RawRow, DryRunResult, ExecuteResult, RowError } from "./types";
import { mapRow } from "./mapRow";
import { normalizePhone, normalizeDate, normalizeTime } from "./normalize";
import { bookingImportKey } from "./importKey";
import type { MappedClient, MappedBooking } from "./types";

const IMPORT_SOURCE = "csv_import";
const BATCH_SIZE = 400;

function getVal(row: RawRow, mapping: ColumnMapping, field: string): string {
  const col = mapping[field];
  if (col == null || col === "") return "";
  return String((row[col] ?? "").trim());
}

export interface ImportContext {
  siteId: string;
  workers: { id: string; name: string }[];
  services: { id: string; name: string }[];
  existingImportKeys: Set<string>;
  workerByName: Map<string, string>;
  serviceByName: Map<string, string>;
}

export async function loadImportContext(siteId: string): Promise<ImportContext> {
  const db = getAdminDb();
  const siteRef = db.collection("sites").doc(siteId);
  const [siteSnap, workersSnap, bookingsSnap] = await Promise.all([
    siteRef.get(),
    siteRef.collection("workers").get(),
    siteRef.collection("bookings").where("importSource", "==", IMPORT_SOURCE).get(),
  ]);
  const services: { id: string; name: string }[] = [];
  const siteData = siteSnap.exists ? siteSnap.data() : null;
  const servicesArray = siteData?.services;
  if (Array.isArray(servicesArray)) {
    for (const s of servicesArray) {
      if (s?.id && s?.name) services.push({ id: s.id, name: String(s.name).trim() });
    }
  }
  const workers: { id: string; name: string }[] = [];
  workersSnap.docs.forEach((d) => {
    const data = d.data();
    const name = (data.name ?? "").trim();
    if (d.id && name) workers.push({ id: d.id, name });
  });
  const existingImportKeys = new Set<string>();
  bookingsSnap.docs.forEach((d) => {
    const key = d.data().importKey;
    if (key) existingImportKeys.add(key);
  });
  const workerByName = new Map<string, string>();
  workers.forEach((w) => workerByName.set(w.name.toLowerCase().trim(), w.id));
  const serviceByName = new Map<string, string>();
  services.forEach((s) => serviceByName.set(s.name.toLowerCase().trim(), s.id));
  return {
    siteId,
    workers,
    services,
    existingImportKeys,
    workerByName,
    serviceByName,
  };
}

function resolveWorkerId(
  ctx: ImportContext,
  workerId?: string,
  workerName?: string
): { id: string; error?: string } {
  if (workerId) {
    const found = ctx.workers.find((w) => w.id === workerId);
    if (found) return { id: found.id };
    return { id: "", error: "Worker ID not found" };
  }
  if (workerName) {
    const key = workerName.toLowerCase().trim();
    const ids = ctx.workers.filter((w) => w.name.toLowerCase().trim() === key).map((w) => w.id);
    if (ids.length === 0) return { id: "", error: "Worker name not found" };
    if (ids.length > 1) return { id: "", error: "Worker name ambiguous" };
    return { id: ids[0] };
  }
  return { id: "", error: "Worker ID or name required" };
}

function resolveServiceId(
  ctx: ImportContext,
  serviceTypeId?: string,
  serviceName?: string
): { id: string; name: string; error?: string } {
  if (serviceTypeId) {
    const found = ctx.services.find((s) => s.id === serviceTypeId);
    if (found) return { id: found.id, name: found.name };
    return { id: "", name: "", error: "Service ID not found" };
  }
  if (serviceName) {
    const key = serviceName.toLowerCase().trim();
    const matches = ctx.services.filter((s) => s.name.toLowerCase().trim() === key);
    if (matches.length === 0) return { id: "", name: "", error: "Service name not found" };
    if (matches.length > 1) return { id: "", name: "", error: "Service name ambiguous" };
    return { id: matches[0].id, name: matches[0].name };
  }
  return { id: "", name: "", error: "Service ID or name required" };
}

/** Overlap: newStart < existingEnd && newEnd > existingStart (half-open). */
function overlaps(
  newStart: Date,
  newEnd: Date,
  existing: { startAt: Date; endAt: Date }[]
): boolean {
  for (const e of existing) {
    if (newStart.getTime() < e.endAt.getTime() && newEnd.getTime() > e.startAt.getTime()) return true;
  }
  return false;
}

export interface ValidatedRow {
  rowIndex: number;
  client: MappedClient;
  bookings: MappedBooking[];
  errors: RowError[];
  workerId?: string;
  serviceTypeId?: string;
  serviceName?: string;
  startAt?: Date;
  endAt?: Date;
  importKey?: string;
}

export function validateRow(
  row: RawRow,
  mapping: ColumnMapping,
  rowIndex: number,
  ctx: ImportContext,
  workerIntervalsByWorker: Map<string, { startAt: Date; endAt: Date }[]>
): ValidatedRow {
  const { client, bookings, rowErrors } = mapRow(row, mapping, rowIndex);
  const errors: RowError[] = rowErrors.map((msg) => ({ row: rowIndex + 1, message: msg }));
  const primary = bookings[0];
  if (!primary) return { rowIndex, client, bookings: [], errors };

  const date = normalizeDate(getVal(row, mapping, "date")) || primary.date;
  const startTime = normalizeTime(getVal(row, mapping, "startTime")) || primary.startTime;
  if (!date || !startTime) {
    errors.push({ row: rowIndex + 1, field: "date", message: "Invalid date or start time" });
  }
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = startTime.split(":").map(Number);
  const startAt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  const endAt = new Date(startAt.getTime() + primary.durationMin * 60 * 1000);

  const workerRes = resolveWorkerId(ctx, primary.workerId, primary.workerName);
  if (workerRes.error) errors.push({ row: rowIndex + 1, field: "worker", message: workerRes.error });
  const serviceRes = resolveServiceId(ctx, primary.serviceTypeId, primary.serviceName);
  if (serviceRes.error) errors.push({ row: rowIndex + 1, field: "service", message: serviceRes.error });

  const workerId = workerRes.id;
  const serviceTypeId = serviceRes.id;
  const serviceName = serviceRes.name;
  const phoneNorm = normalizePhone(client.phone);
  const importKey = bookingImportKey({
    siteId: ctx.siteId,
    phone: phoneNorm,
    date,
    startTime,
    durationMin: primary.durationMin,
    serviceTypeId: serviceTypeId || "",
    workerId: workerId || "",
    phase: primary.phase,
    parentGroupKey: primary.parentGroupKey,
  });
  if (ctx.existingImportKeys.has(importKey)) {
    return {
      rowIndex,
      client,
      bookings,
      errors,
      workerId,
      serviceTypeId,
      serviceName,
      startAt,
      endAt,
      importKey,
    };
  }
  if (workerId && !errors.some((e) => e.field === "worker")) {
    const intervals = workerIntervalsByWorker.get(workerId) ?? [];
    if (overlaps(startAt, endAt, intervals)) {
      errors.push({ row: rowIndex + 1, field: "time", message: "Booking overlaps existing booking for same worker" });
    }
  }
  return {
    rowIndex,
    client,
    bookings,
    errors,
    workerId,
    serviceTypeId,
    serviceName,
    startAt,
    endAt,
    importKey,
  };
}

export async function runDryRun(
  siteId: string,
  rows: RawRow[],
  mapping: ColumnMapping
): Promise<DryRunResult> {
  const ctx = await loadImportContext(siteId);
  const workerIntervalsByWorker = new Map<string, { startAt: Date; endAt: Date }[]>();
  const validated: ValidatedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = validateRow(rows[i], mapping, i, ctx, workerIntervalsByWorker);
    validated.push(v);
    if (v.errors.length === 0 && v.workerId && v.startAt && v.endAt) {
      const arr = workerIntervalsByWorker.get(v.workerId) ?? [];
      arr.push({ startAt: v.startAt, endAt: v.endAt });
      workerIntervalsByWorker.set(v.workerId, arr);
    }
  }
  const clientPhones = new Set<string>();
  let bookingsToCreate = 0;
  let bookingsToSkip = 0;
  const errors: RowError[] = [];
  const warnings: RowError[] = [];
  for (const v of validated) {
    const phoneNorm = normalizePhone(v.client.phone);
    v.errors.forEach((e) => errors.push(e));
    if (!phoneNorm) continue;
    if (!clientPhones.has(phoneNorm)) {
      clientPhones.add(phoneNorm);
    }
    if (v.errors.length > 0) continue;
    for (const b of v.bookings) {
      if (b.phase === 1) {
        const key = bookingImportKey({
          siteId,
          phone: phoneNorm,
          date: b.date,
          startTime: b.startTime,
          durationMin: b.durationMin,
          serviceTypeId: v.serviceTypeId || "",
          workerId: v.workerId || "",
          phase: 1,
          parentGroupKey: b.parentGroupKey,
        });
        if (ctx.existingImportKeys.has(key)) bookingsToSkip++;
        else bookingsToCreate++;
      }
    }
  }
  return {
    clientsToCreate: clientPhones.size,
    clientsToUpdate: 0,
    bookingsToCreate,
    bookingsToSkip,
    errors,
    warnings,
  };
}

export async function runExecute(
  siteId: string,
  rows: RawRow[],
  mapping: ColumnMapping,
  options: { skipRowsWithErrors?: boolean }
): Promise<ExecuteResult> {
  const ctx = await loadImportContext(siteId);
  const skipErrors = options.skipRowsWithErrors ?? false;
  const workerIntervalsByWorker = new Map<string, { startAt: Date; endAt: Date }[]>();
  const validated: ValidatedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    validated.push(validateRow(rows[i], mapping, i, ctx, workerIntervalsByWorker));
  }
  for (const v of validated) {
    if (v.errors.length === 0 && v.workerId && v.startAt && v.endAt) {
      const arr = workerIntervalsByWorker.get(v.workerId) ?? [];
      arr.push({ startAt: v.startAt, endAt: v.endAt });
      workerIntervalsByWorker.set(v.workerId, arr);
    }
  }
  const db = getAdminDb();
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
  let clientsCreated = 0;
  let clientsUpdated = 0;
  let bookingsCreated = 0;
  let bookingsSkipped = 0;
  let bookingsFailed = 0;
  const errors: RowError[] = [];
  const upsertedClients = new Set<string>();

  for (const v of validated) {
    if (skipErrors && v.errors.length > 0) {
      v.errors.forEach((e) => errors.push(e));
      bookingsFailed += v.bookings.filter((b) => b.phase === 1).length;
      continue;
    }
    if (v.errors.length > 0) {
      v.errors.forEach((e) => errors.push(e));
      bookingsFailed += v.bookings.filter((b) => b.phase === 1).length;
      continue;
    }
    const phoneNorm = normalizePhone(v.client.phone);
    if (!phoneNorm) continue;
    if (!upsertedClients.has(phoneNorm)) {
      const clientRef = clientsRef.doc(phoneNorm);
      const existing = await clientRef.get();
      const data = {
        name: v.client.name || "—",
        phone: phoneNorm,
        email: v.client.email ?? null,
        notes: v.client.notes ?? null,
        updatedAt: Timestamp.now(),
      };
      if (existing.exists) {
        await clientRef.set(data, { merge: true });
        clientsUpdated++;
      } else {
        await clientRef.set({ ...data, createdAt: Timestamp.now() }, { merge: true });
        clientsCreated++;
      }
      upsertedClients.add(phoneNorm);
    }
    const phase1Bookings = v.bookings.filter((b) => b.phase === 1);
    const phase2Bookings = v.bookings.filter((b) => b.phase === 2);
    for (let bi = 0; bi < phase1Bookings.length; bi++) {
      const b = phase1Bookings[bi];
      const key = bookingImportKey({
        siteId,
        phone: phoneNorm,
        date: b.date,
        startTime: b.startTime,
        durationMin: b.durationMin,
        serviceTypeId: v.serviceTypeId || "",
        workerId: v.workerId || "",
        phase: 1,
        parentGroupKey: b.parentGroupKey,
      });
      if (ctx.existingImportKeys.has(key)) {
        bookingsSkipped++;
        continue;
      }
      const [y, m, d] = b.date.split("-").map(Number);
      const [hh, mm] = b.startTime.split(":").map(Number);
      const startAt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
      const endAt = new Date(startAt.getTime() + b.durationMin * 60 * 1000);
      const dateStr = b.date;
      const timeStr = b.startTime;
      const workerName = ctx.workers.find((w) => w.id === v.workerId)?.name ?? "";
      const serviceName = v.serviceName ?? "";
      const phase1Doc = {
        siteId,
        clientId: phoneNorm,
        customerName: v.client.name || "—",
        customerPhone: phoneNorm,
        workerId: v.workerId,
        workerName,
        serviceTypeId: v.serviceTypeId ?? null,
        serviceName,
        durationMin: b.durationMin,
        startAt: Timestamp.fromDate(startAt),
        endAt: Timestamp.fromDate(endAt),
        dateISO: dateStr,
        date: dateStr,
        timeHHmm: timeStr,
        time: timeStr,
        status: b.status || "confirmed",
        phase: 1,
        note: b.note ?? null,
        importSource: IMPORT_SOURCE,
        importKey: key,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      const phase1Ref = await bookingsRef.add(phase1Doc);
      ctx.existingImportKeys.add(key);
      bookingsCreated++;
      const followUp = phase2Bookings[bi];
      if (followUp?.followUpServiceName && (followUp.followUpDurationMin ?? 0) >= 1) {
        const waitMin = followUp.waitMinutes ?? 0;
        const phase1End = new Date(startAt.getTime() + b.durationMin * 60 * 1000);
        const phase2Start = new Date(phase1End.getTime() + waitMin * 60 * 1000);
        const phase2End = new Date(phase2Start.getTime() + (followUp.followUpDurationMin ?? 0) * 60 * 1000);
        const phase2DateStr =
          phase2Start.getFullYear() +
          "-" +
          String(phase2Start.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(phase2Start.getDate()).padStart(2, "0");
        const phase2TimeStr =
          String(phase2Start.getHours()).padStart(2, "0") + ":" + String(phase2Start.getMinutes()).padStart(2, "0");
        const phase2WorkerId = v.workerId;
        const phase2Key = bookingImportKey({
          siteId,
          phone: phoneNorm,
          date: phase2DateStr,
          startTime: phase2TimeStr,
          durationMin: followUp.followUpDurationMin ?? 0,
          serviceTypeId: "",
          workerId: phase2WorkerId,
          phase: 2,
          parentGroupKey: followUp.parentGroupKey,
        });
        if (!ctx.existingImportKeys.has(phase2Key)) {
          await bookingsRef.add({
            siteId,
            clientId: phoneNorm,
            customerName: v.client.name || "—",
            customerPhone: phoneNorm,
            workerId: phase2WorkerId,
            workerName,
            serviceName: followUp.followUpServiceName,
            serviceTypeId: null,
            durationMin: followUp.followUpDurationMin,
            startAt: Timestamp.fromDate(phase2Start),
            endAt: Timestamp.fromDate(phase2End),
            dateISO: phase2DateStr,
            date: phase2DateStr,
            timeHHmm: phase2TimeStr,
            time: phase2TimeStr,
            status: b.status || "confirmed",
            phase: 2,
            parentBookingId: phase1Ref.id,
            note: b.note ?? null,
            importSource: IMPORT_SOURCE,
            importKey: phase2Key,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
          ctx.existingImportKeys.add(phase2Key);
          bookingsCreated++;
        } else {
          bookingsSkipped++;
        }
      }
    }
  }
  return {
    clientsCreated,
    clientsUpdated,
    bookingsCreated,
    bookingsSkipped,
    bookingsFailed,
    errors,
  };
}
