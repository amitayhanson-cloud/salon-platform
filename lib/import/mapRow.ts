/**
 * Map a raw CSV/Excel row to MappedClient (clients-only import: name + phone).
 */

import type { ColumnMapping, RawRow, MappedClient, RowError } from "./types";
import { normalizePhone, isValidPhone } from "./normalize";

function getCell(row: RawRow, mapping: ColumnMapping, field: string): string {
  const col = mapping[field];
  if (col == null || col === "") return "";
  const val = row[col];
  return val != null ? String(val).trim() : "";
}

export const PHONE_ERROR_MSG = "טלפון חסר/לא תקין בשורה זו";

/**
 * Map one row to client (name + phone only).
 * Returns RowError for missing/invalid phone (never silently skip).
 */
export function mapRow(
  row: RawRow,
  mapping: ColumnMapping,
  rowIndex: number
): { client: MappedClient; rowErrors: RowError[] } {
  const errors: RowError[] = [];
  const rowNum = rowIndex + 1;
  const phoneRaw = getCell(row, mapping, "phone") || getCell(row, mapping, "customerPhone");
  if (!isValidPhone(phoneRaw)) {
    errors.push({ row: rowNum, field: "phone", message: PHONE_ERROR_MSG });
  }
  const phoneNorm = normalizePhone(phoneRaw);
  const name = getCell(row, mapping, "name") || getCell(row, mapping, "customerName") || getCell(row, mapping, "fullName") || "";
  const email = getCell(row, mapping, "email") || undefined;
  const notes = getCell(row, mapping, "notes") || undefined;

  const client: MappedClient = {
    phone: phoneNorm,
    name: name || "—",
    email: email || undefined,
    notes: notes || undefined,
  };

  return { client, rowErrors: errors };
}

/** Fields supported for clients-only import. */
export const CLIENT_IMPORT_FIELDS = ["name", "phone", "email", "notes"] as const;

/**
 * Auto-detect column mapping for clients (name + phone only).
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const lower = (s: string) => s.toLowerCase().trim();
  const candidates: { field: string; patterns: string[] }[] = [
    { field: "phone", patterns: ["phone", "טלפון", "mobile", "tel", "cell", "customerphone", "customer_phone"] },
    { field: "name", patterns: ["name", "שם", "fullname", "full_name", "customer name", "client name", "customername", "customer_name"] },
    { field: "email", patterns: ["email", "אימייל", "mail", "e-mail"] },
    { field: "notes", patterns: ["notes", "הערות", "note"] },
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
