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

function isArrayRow(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

function isObjectRow(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Parse XLSX file to rows (first sheet).
 * Uses dynamic import of xlsx so it's only loaded when needed.
 * Supports both array-style rows (header: 1) and object-style rows.
 */
export async function parseXLSX(file: File): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) {
    return { rows: [], headers: [], errors: ["No sheet found"] };
  }
  const raw = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: "",
  });
  if (!Array.isArray(raw) || raw.length === 0) {
    return { rows: [], headers: [], errors: [] };
  }
  const first = raw[0];
  let headers: string[];
  let rows: Record<string, string>[];

  if (isArrayRow(first)) {
    headers = first.map((c) => String(c ?? "").trim());
    rows = [];
    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      if (!isArrayRow(row)) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, j) => {
        obj[h] = String(row[j] ?? "").trim();
      });
      if (Object.values(obj).some((v) => v)) {
        rows.push(obj);
      }
    }
  } else if (isObjectRow(first)) {
    headers = Object.keys(first).map((k) => String(k ?? "").trim());
    rows = [];
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      if (!isObjectRow(row)) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h) => {
        obj[h] = String(row[h] ?? "").trim();
      });
      if (Object.values(obj).some((v) => v)) {
        rows.push(obj);
      }
    }
  } else {
    return { rows: [], headers: [], errors: [] };
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
