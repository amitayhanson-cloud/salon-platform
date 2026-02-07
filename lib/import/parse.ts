/**
 * Parse CSV and XLSX files to raw rows.
 * Robust header detection, no over-filtering. Used by upload step only.
 */

import Papa from "papaparse";

export interface ParseResult {
  rows: Record<string, string>[];
  headers: string[];
  errors: string[];
  sheetName?: string;
}

const HEADER_PATTERNS = [
  "טלפון",
  "נייד",
  "phone",
  "שם",
  "לקוח",
  "name",
  "fullname",
  "full",
  "אימייל",
  "email",
];

function normalizeHeader(h: string): string {
  return String(h ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[:：]/g, "")
    .replace(/\u200e|\u200f/g, ""); // RTL marks
}

function scoreHeaderRow(cells: string[]): number {
  const nonEmpty = cells.filter((c) => String(c ?? "").trim().length > 0);
  if (nonEmpty.length < 2) return 0;
  const lower = nonEmpty.map((c) => String(c).toLowerCase());
  let score = 0;
  for (const p of HEADER_PATTERNS) {
    if (lower.some((c) => c.includes(p))) {
      score += 1;
      break;
    }
  }
  return score;
}

function isRowCompletelyEmpty(row: Record<string, string>): boolean {
  return Object.values(row).every((v) => String(v ?? "").trim() === "");
}

/**
 * Parse CSV file with PapaParse.
 * header: true, skipEmptyLines: "greedy", transformHeader/transform for cleanup.
 */
export function parseCSV(fileOrString: File | string): Promise<ParseResult> {
  return new Promise((resolve) => {
    const errors: string[] = [];
    Papa.parse(fileOrString, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => normalizeHeader(h ?? ""),
      transform: (v) => (typeof v === "string" ? v.trim() : String(v ?? "").trim()),
      complete: (results) => {
        if (results.errors?.length) {
          errors.push(...results.errors.map((e) => e.message || String(e)));
        }
        const data = results.data ?? [];
        const fields = results.meta?.fields ?? [];
        const headers = Array.isArray(fields) ? fields.map(normalizeHeader).filter(Boolean) : [];

        if (headers.length === 0 && data.length > 0) {
          headers.push(...Object.keys(data[0] as object).map(normalizeHeader));
        }
        if (headers.length === 0) {
          resolve({ rows: [], headers: [], errors: [...errors, "לא נמצאה שורת כותרות"] });
          return;
        }

        const rows: Record<string, string>[] = [];
        for (const row of data) {
          if (!row || typeof row !== "object") continue;
          const obj: Record<string, string> = {};
          for (const h of headers) {
            const val = (row as Record<string, unknown>)[h];
            obj[h] = typeof val === "string" ? val.trim() : String(val ?? "").trim();
          }
          if (!isRowCompletelyEmpty(obj)) {
            rows.push(obj);
          }
        }

        resolve({ rows, headers, errors });
      },
    });
  });
}

/**
 * Parse XLSX file. First non-empty sheet, robust header detection.
 */
export async function parseXLSX(file: File): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });

  let sheet: { [cell: string]: unknown } | null = null;
  let sheetName = "";

  for (const name of workbook.SheetNames) {
    const s = workbook.Sheets[name];
    if (!s) continue;
    const arr = XLSX.utils.sheet_to_json(s, {
      header: 1,
      defval: "",
      blankrows: false,
    }) as unknown[][];
    if (Array.isArray(arr) && arr.length > 0) {
      sheet = s;
      sheetName = name;
      break;
    }
  }

  if (!sheet) {
    return { rows: [], headers: [], errors: ["לא נמצא גיליון עם נתונים"] };
  }

  const raw = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as unknown[][];

  if (!Array.isArray(raw) || raw.length === 0) {
    return { rows: [], headers: [], errors: [], sheetName };
  }

  const rawStr = raw.map((row) =>
    Array.isArray(row) ? row.map((c) => String(c ?? "").trim()) : []
  );

  let headerIdx = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rawStr.length, 10); i++) {
    const score = scoreHeaderRow(rawStr[i]);
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
    }
  }

  if (bestScore === 0) {
    headerIdx = 0;
  }

  const rawHeaders = rawStr[headerIdx] ?? [];
  const headers = rawHeaders.map(normalizeHeader).filter(Boolean);

  if (headers.length === 0) {
    return {
      rows: [],
      headers: [],
      errors: ["לא נמצאה שורת כותרות (שם/טלפון)"],
      sheetName,
    };
  }

  const dataRows = rawStr.slice(headerIdx + 1);
  const rows: Record<string, string>[] = [];

  for (const arr of dataRows) {
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      obj[h] = String(arr[j] ?? "").trim();
    });
    if (!isRowCompletelyEmpty(obj)) {
      rows.push(obj);
    }
  }

  return { rows, headers, errors: [], sheetName };
}

export function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXLSX(file);
  }
  return parseCSV(file);
}
