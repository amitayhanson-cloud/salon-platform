/**
 * Map a raw CSV/Excel row to MappedClient and MappedBooking using column mapping.
 */

import type { ColumnMapping, RawRow, MappedClient, MappedBooking } from "./types";
import { normalizePhone, normalizeDate, normalizeTime } from "./normalize";

function getCell(row: RawRow, mapping: ColumnMapping, field: string): string {
  const col = mapping[field];
  if (col == null || col === "") return "";
  const val = row[col];
  return val != null ? String(val).trim() : "";
}

/**
 * Map one row to client + booking(s).
 * Returns one client (by phone) and one or two bookings (phase 1 and optionally phase 2 from same row).
 */
export function mapRow(
  row: RawRow,
  mapping: ColumnMapping,
  rowIndex: number
): { client: MappedClient; bookings: MappedBooking[]; rowErrors: string[] } {
  const errors: string[] = [];
  const phone = normalizePhone(getCell(row, mapping, "phone") || getCell(row, mapping, "customerPhone"));
  const customerPhone = getCell(row, mapping, "customerPhone") || getCell(row, mapping, "phone");
  const phoneNorm = normalizePhone(customerPhone);
  if (!phoneNorm) {
    errors.push("Row " + (rowIndex + 1) + ": phone or customerPhone required");
  }
  const dateRaw = getCell(row, mapping, "date");
  const date = normalizeDate(dateRaw) || dateRaw;
  const startTimeRaw = getCell(row, mapping, "startTime");
  const startTime = normalizeTime(startTimeRaw) || startTimeRaw;
  const durationMin = parseInt(getCell(row, mapping, "durationMin"), 10) || 0;
  const phaseRaw = getCell(row, mapping, "phase");
  const phase = phaseRaw === "2" ? 2 : 1;
  const parentGroupKey = getCell(row, mapping, "parentGroupKey");
  const followUpServiceName = getCell(row, mapping, "followUpServiceName");
  const waitMinutes = parseInt(getCell(row, mapping, "waitMinutes"), 10) || 0;
  const followUpDurationMin = parseInt(getCell(row, mapping, "followUpDurationMin"), 10) || 0;

  const client: MappedClient = {
    phone: phoneNorm,
    name: getCell(row, mapping, "name") || getCell(row, mapping, "customerName") || "",
    email: getCell(row, mapping, "email") || undefined,
    notes: getCell(row, mapping, "notes") || undefined,
  };

  const booking: MappedBooking = {
    date: date || "",
    startTime: startTime || "",
    durationMin,
    serviceTypeId: getCell(row, mapping, "serviceTypeId") || undefined,
    serviceName: getCell(row, mapping, "serviceName") || undefined,
    workerId: getCell(row, mapping, "workerId") || undefined,
    workerName: getCell(row, mapping, "workerName") || undefined,
    customerPhone: phoneNorm,
    customerName: getCell(row, mapping, "customerName") || getCell(row, mapping, "name") || "",
    status: getCell(row, mapping, "status") || "confirmed",
    note: getCell(row, mapping, "note") || undefined,
    phase: phase as 1 | 2,
    parentGroupKey: parentGroupKey || undefined,
    followUpServiceName: followUpServiceName || undefined,
    waitMinutes: waitMinutes || undefined,
    followUpDurationMin: followUpDurationMin || undefined,
  };

  const bookings: MappedBooking[] = [booking];
  if (phase === 1 && followUpServiceName && followUpDurationMin >= 1) {
    bookings.push({
      ...booking,
      phase: 2,
      parentGroupKey: parentGroupKey || `row-${rowIndex}`,
      serviceName: followUpServiceName,
      serviceTypeId: undefined,
      durationMin: followUpDurationMin,
      waitMinutes,
      startTime: "", // computed from phase 1
      date: "",
    });
  }

  return { client, bookings, rowErrors: errors };
}

/**
 * Auto-detect column mapping by matching headers to known field names (case-insensitive, partial).
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const lower = (s: string) => s.toLowerCase().trim();
  const candidates: { field: string; patterns: string[] }[] = [
    { field: "phone", patterns: ["phone", "טלפון", "mobile", "tel"] },
    { field: "customerPhone", patterns: ["customerphone", "customer_phone", "client phone", "טלפון לקוח"] },
    { field: "name", patterns: ["name", "שם", "customer name", "client name"] },
    { field: "customerName", patterns: ["customername", "customer_name", "שם לקוח"] },
    { field: "email", patterns: ["email", "אימייל", "mail"] },
    { field: "notes", patterns: ["notes", "הערות", "note"] },
    { field: "date", patterns: ["date", "תאריך", "booking date"] },
    { field: "startTime", patterns: ["time", "starttime", "start_time", "שעה", "שעת התחלה"] },
    { field: "durationMin", patterns: ["duration", "durationmin", "duration_min", "משך", "minutes"] },
    { field: "serviceName", patterns: ["service", "servicename", "service_name", "שירות"] },
    { field: "serviceTypeId", patterns: ["servicetypeid", "service_id", "service id"] },
    { field: "workerName", patterns: ["worker", "workername", "worker_name", "מטפל", "staff"] },
    { field: "workerId", patterns: ["workerid", "worker_id"] },
    { field: "status", patterns: ["status", "סטטוס"] },
    { field: "note", patterns: ["booking note", "bookingnote", "הערת תור"] },
    { field: "phase", patterns: ["phase", "שלב"] },
    { field: "parentGroupKey", patterns: ["parentgroupkey", "parent_group", "group", "booking group"] },
    { field: "followUpServiceName", patterns: ["followup", "follow_up", "שירות המשך"] },
    { field: "waitMinutes", patterns: ["wait", "waitminutes", "המתנה"] },
    { field: "followUpDurationMin", patterns: ["followupduration", "משך המשך"] },
  ];
  for (const h of headers) {
    const l = lower(h);
    for (const { field, patterns } of candidates) {
      if (mapping[field]) continue;
      if (patterns.some((p) => l.includes(p) || p.includes(l))) {
        mapping[field] = h;
        break;
      }
    }
  }
  return mapping;
}
