/**
 * Types for Admin CSV/Excel import (clients + bookings).
 */

/** Column mapping: our field name -> CSV column header (or index as string). */
export type ColumnMapping = Record<string, string>;

/** Supported client fields for mapping. */
export const CLIENT_FIELDS = [
  "clientId",
  "name",
  "phone",
  "email",
  "notes",
  "chemicalCard",
] as const;

/** Supported booking fields for mapping. */
export const BOOKING_FIELDS = [
  "date",
  "startTime",
  "durationMin",
  "serviceTypeId",
  "serviceName",
  "workerId",
  "workerName",
  "customerPhone",
  "customerName",
  "status",
  "note",
  "phase",
  "parentGroupKey",
  "followUpServiceName",
  "waitMinutes",
  "followUpDurationMin",
] as const;

export type ClientField = (typeof CLIENT_FIELDS)[number];
export type BookingField = (typeof BOOKING_FIELDS)[number];

/** One parsed row from CSV/Excel (header -> value). */
export type RawRow = Record<string, string>;

/** Mapped client upsert (normalized). */
export interface MappedClient {
  phone: string;
  name: string;
  email?: string;
  notes?: string;
  chemicalCard?: unknown;
}

/** Mapped booking (single phase or phase 1 of multi-phase). */
export interface MappedBooking {
  date: string;
  startTime: string;
  durationMin: number;
  serviceTypeId?: string;
  serviceName?: string;
  workerId?: string;
  workerName?: string;
  customerPhone: string;
  customerName?: string;
  status: string;
  note?: string;
  phase: 1 | 2;
  parentGroupKey?: string;
  followUpServiceName?: string;
  waitMinutes?: number;
  followUpDurationMin?: number;
}

/** Validation error for one row. */
export interface RowError {
  row: number;
  field?: string;
  message: string;
}

/** Preview row shown in final confirmation (normalized). */
export interface PreviewRow {
  fullName: string;
  phone: string;
  email?: string;
  notes?: string;
}

/** Dry-run result (no writes). */
export interface DryRunResult {
  clientsToCreate: number;
  clientsToUpdate: number;
  bookingsToCreate: number;
  bookingsToSkip: number;
  errors: RowError[];
  warnings: RowError[];
  /** First 50 rows that will be imported, with normalized fields (matches Execute). */
  previewRows?: PreviewRow[];
  /** Count of rows with validation errors (skipped). */
  droppedRowCount?: number;
}

/** Execute result (after import). */
export interface ExecuteResult {
  clientsCreated: number;
  clientsUpdated: number;
  bookingsCreated: number;
  bookingsSkipped: number;
  bookingsFailed: number;
  errors: RowError[];
}
