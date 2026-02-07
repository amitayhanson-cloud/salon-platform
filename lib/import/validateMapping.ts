/**
 * Client-safe validation for import mapping (name + phone).
 * Used for preview sanity checks before dry-run/execute.
 */

import type { ColumnMapping, RawRow } from "./types";
import { isValidPhone } from "./normalize";

function getCell(row: RawRow, mapping: ColumnMapping, field: string): string {
  const col = mapping[field];
  if (col == null || col === "") return "";
  const val = row[col];
  return val != null ? String(val).trim() : "";
}

export interface MappingStats {
  totalRows: number;
  validPhoneCount: number;
  validNameCount: number;
  validPhoneRatio: number;
  phoneMapped: boolean;
  nameMapped: boolean;
}

export function computeMappingStats(rows: RawRow[], mapping: ColumnMapping): MappingStats {
  const totalRows = rows.length;
  const phoneCol = mapping.phone || mapping.customerPhone;
  const nameCol = mapping.name || mapping.customerName;
  const phoneMapped = !!(phoneCol && phoneCol.trim());
  const nameMapped = !!(nameCol && nameCol.trim());

  let validPhoneCount = 0;
  let validNameCount = 0;
  for (const row of rows) {
    const phoneRaw = getCell(row, mapping, "phone") || getCell(row, mapping, "customerPhone");
    const nameRaw = getCell(row, mapping, "name") || getCell(row, mapping, "customerName");
    if (isValidPhone(phoneRaw)) validPhoneCount++;
    if (nameRaw.trim().length > 0) validNameCount++;
  }

  const validPhoneRatio = totalRows > 0 ? validPhoneCount / totalRows : 0;

  return {
    totalRows,
    validPhoneCount,
    validNameCount,
    validPhoneRatio,
    phoneMapped,
    nameMapped,
  };
}
