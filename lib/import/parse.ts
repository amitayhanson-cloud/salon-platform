/**
 * Parse CSV and XLSX files to raw rows (array of record<header, value>).
 * Can run in browser or Node.
 */

import Papa from "papaparse";

export interface ParseResult {
  rows: Record<string, string>[];
  headers: string[];
  errors: string[];
}

/**
 * Parse CSV file or string to rows.
 */
export function parseCSV(fileOrString: File | string): Promise<ParseResult> {
  return new Promise((resolve) => {
    const errors: string[] = [];
    const onComplete = (results: Papa.ParseResult<Record<string, string>>) => {
      if (results.errors.length) {
        errors.push(...results.errors.map((e) => e.message || String(e)));
      }
      const rows = results.data?.filter((row) => Object.keys(row).some((k) => row[k]?.trim())) ?? [];
      const headers = results.meta?.fields ?? (rows[0] ? Object.keys(rows[0]) : []);
      resolve({ rows, headers, errors });
    };
    if (typeof fileOrString === "string") {
      Papa.parse(fileOrString, {
        header: true,
        skipEmptyLines: true,
        complete: onComplete,
      });
    } else {
      Papa.parse(fileOrString, {
        header: true,
        skipEmptyLines: true,
        complete: onComplete,
      });
    }
  });
}

/**
 * Parse XLSX file to rows (first sheet).
 * Uses dynamic import of xlsx so it's only loaded when needed.
 */
export async function parseXLSX(file: File): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) {
    return { rows: [], headers: [], errors: ["No sheet found"] };
  }
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    header: 1,
    defval: "",
  });
  if (json.length === 0) {
    return { rows: [], headers: [], errors: [] };
  }
  const headerRow = json[0] as unknown[];
  const headers = headerRow.map((c) => String(c ?? "").trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < json.length; i++) {
    const row = json[i] as unknown[];
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      obj[h] = row[j] != null ? String(row[j]).trim() : "";
    });
    if (Object.values(obj).some((v) => v)) {
      rows.push(obj);
    }
  }
  return { rows, headers, errors: [] };
}

export function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXLSX(file);
  }
  return parseCSV(file);
}
