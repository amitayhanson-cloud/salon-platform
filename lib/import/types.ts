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
  notes?: string;
  clientType?: string;
  /** @deprecated Import no longer uses email; kept for backward compat. */
  email?: string;
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
  name: string;
  phone: string;
  notes?: string;
  clientType?: string;
  /** Row status for preview: ok | warning | error */
  status?: "ok" | "warning" | "error";
  /** Human-readable status reason (e.g. unknown clientType -> Regular) */
  statusReason?: string;
  /** @deprecated Use name. */
  fullName?: string;
  email?: string;
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
  clientsSkipped?: number;
  clientsFailed?: number;
  bookingsCreated: number;
  bookingsSkipped: number;
  bookingsFailed: number;
  errors: RowError[];
}

/** Summary for strict client import (created / updated / skipped / failed). */
export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}
