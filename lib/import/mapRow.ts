/**
 * Map a raw CSV/Excel row to MappedClient (clients-only import: name + phone required; notes, clientType optional).
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
export const NAME_ERROR_MSG = "שם חסר בשורה זו";

/**
 * Map one row to client. name and phone are required; missing either produces a RowError.
 * notes and clientType are optional. clientType resolution (e.g. to Regular) is done in server.
 */
export function mapRow(
  row: RawRow,
  mapping: ColumnMapping,
  rowIndex: number
): { client: MappedClient; rowErrors: RowError[] } {
  const errors: RowError[] = [];
  const rowNum = rowIndex + 1;

  const name =
    getCell(row, mapping, "name") ||
    getCell(row, mapping, "customerName") ||
    getCell(row, mapping, "fullName") ||
    "";
  if (!name.trim()) {
    errors.push({ row: rowNum, field: "name", message: NAME_ERROR_MSG });
  }

  const phoneRaw = getCell(row, mapping, "phone") || getCell(row, mapping, "customerPhone");
  if (!isValidPhone(phoneRaw)) {
    errors.push({ row: rowNum, field: "phone", message: PHONE_ERROR_MSG });
  }
  const phoneNorm = normalizePhone(phoneRaw);

  const notes = getCell(row, mapping, "notes") || undefined;
  const clientTypeRaw = getCell(row, mapping, "clientType") || undefined;
  const clientType = clientTypeRaw?.trim() ? clientTypeRaw.trim() : undefined;

  const client: MappedClient = {
    name: name.trim() || "—",
    phone: phoneNorm,
    notes: notes || undefined,
    clientType,
  };

  return { client, rowErrors: errors };
}

/** Fields supported for clients-only import. */
export const CLIENT_IMPORT_FIELDS = ["name", "phone", "notes", "clientType"] as const;

/**
 * Auto-detect column mapping for clients. Aliases: full name -> name, telephone/mobile -> phone, note -> notes, client type -> clientType.
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const lower = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
  const candidates: { field: string; patterns: string[] }[] = [
    { field: "phone", patterns: ["phone", "טלפון", "mobile", "telephone", "tel", "cell", "customerphone", "customer_phone"] },
    { field: "name", patterns: ["name", "שם", "fullname", "full name", "full_name", "customer name", "client name", "customername", "customer_name"] },
    { field: "notes", patterns: ["notes", "הערות", "note"] },
    { field: "clientType", patterns: ["clienttype", "client type", "client_type", "סוג לקוח"] },
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
