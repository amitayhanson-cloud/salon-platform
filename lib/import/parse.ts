/**
 * Strict template-based parser for client import.
 * - CSV / XLSX only. First row = header.
 * - Allowed headers exactly: name, phone, notes, client_type (case-insensitive). No extra columns.
 * - Rows: skip empty; trim; normalize phone; name + phone required.
 */

import Papa from "papaparse";
import { normalizePhone } from "./normalize";

/** Canonical keys used internally (Firestore and rows). */
const CANONICAL_KEYS = ["name", "phone", "notes", "client_type"] as const;
const REQUIRED_CANONICAL = ["name", "phone"] as const;

/** Accepted header variants per canonical key (normalized: lowercase, single space, underscore→space). */
const HEADER_VARIANTS: Record<(typeof CANONICAL_KEYS)[number], string[]> = {
  name: ["name", "שם", "שם מלא", "שם ושם משפחה"],
  phone: ["phone", "טלפון", "טלפון נייד", "mobile"],
  notes: ["notes", "הערות", "הערות לקוח", "הערות כרטיס לקוח"],
  client_type: ["client type", "client_type", "clienttype", "סוג לקוח", "סוג", "סיווג לקוח"],
};

export type ParsedClientRow = {
  name: string;
  phone: string;
  notes?: string;
  client_type?: string;
  __rowNumber?: number;
};

export interface StrictParseResult {
  rows: ParsedClientRow[];
  validationErrors: string[];
  sheetName?: string;
}

function stripBOM(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

/** Normalize header for matching: lowercase, trim, collapse spaces, underscore → space. */
function normalizeHeaderForMatch(h: string): string {
  return stripBOM(String(h ?? ""))
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map normalized header to canonical key, or null if no match. */
function headerToCanonicalKey(normalized: string): (typeof CANONICAL_KEYS)[number] | null {
  if (!normalized) return null;
  for (const canonical of CANONICAL_KEYS) {
    const variants = HEADER_VARIANTS[canonical];
    if (variants.some((v) => normalizeHeaderForMatch(v) === normalized)) return canonical;
  }
  return null;
}

/**
 * Validate header row: every column must map to a canonical key; must include name + phone.
 * Returns error message or null.
 */
function validateHeaders(rawHeaders: string[]): string | null {
  const canonicalIndices = new Set<string>();
  for (let j = 0; j < rawHeaders.length; j++) {
    const normalized = normalizeHeaderForMatch(rawHeaders[j]);
    if (!normalized) continue;
    const canonical = headerToCanonicalKey(normalized);
    if (!canonical) {
      return `עמודה לא מוכרת: "${rawHeaders[j]?.trim() || ""}". הקובץ חייב להכיל עמודות: name, phone (חובה) ו- notes, client type (אופציונלי). אין להוסיף עמודות נוספות.`;
    }
    canonicalIndices.add(canonical);
  }
  const missing = REQUIRED_CANONICAL.filter((k) => !canonicalIndices.has(k));
  if (missing.length) {
    return `חסרות עמודות חובה: ${missing.join(", ")}. הקובץ חייב להכיל עמודות: name, phone (חובה) ו- notes, client type (אופציונלי). אין להוסיף עמודות נוספות.`;
  }
  return null;
}

/** Build canonical key → column index from first row (first occurrence wins). */
function headerToKeyIndex(cells: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (let j = 0; j < cells.length; j++) {
    const normalized = normalizeHeaderForMatch(cells[j]);
    const canonical = headerToCanonicalKey(normalized);
    if (canonical && map[canonical] === undefined) map[canonical] = j;
  }
  return map;
}

/**
 * Parse CSV with strict template: first row = header. Only name, phone, notes, client_type.
 */
export function parseCSVStrict(fileOrString: File | string): Promise<StrictParseResult> {
  const run = (text: string): Promise<StrictParseResult> => {
    text = stripBOM(text);
    return new Promise((resolve) => {
      Papa.parse(text, {
        header: false,
        skipEmptyLines: false,
        delimiter: ",",
        dynamicTyping: false,
        complete: (results) => {
          const validationErrors: string[] = [];
          const rawRows = (results.data ?? []) as unknown[][];
          if (rawRows.length === 0) {
            resolve({ rows: [], validationErrors: ["הקובץ ריק."] });
            return;
          }
          const headerRow = rawRows[0] as unknown[];
          const headerCells = Array.isArray(headerRow) ? headerRow.map((c) => String(c ?? "").trim()) : [];
          const keyIndex = headerToKeyIndex(headerCells);
          const headerError = validateHeaders(headerCells);
          if (headerError) {
            resolve({ rows: [], validationErrors: [headerError] });
            return;
          }
          const rows: ParsedClientRow[] = [];
          for (let i = 1; i < rawRows.length; i++) {
            const arr = Array.isArray(rawRows[i]) ? (rawRows[i] as unknown[]) : [];
            const cells = arr.map((c) => String(c ?? "").trim());
            const allEmpty = cells.every((c) => !c);
            if (allEmpty) continue;
            const name = (keyIndex.name !== undefined ? cells[keyIndex.name] ?? "" : "").trim();
            const phoneRaw = (keyIndex.phone !== undefined ? cells[keyIndex.phone] ?? "" : "").trim();
            const phone = normalizePhone(phoneRaw);
            const notes = keyIndex.notes !== undefined ? (cells[keyIndex.notes] ?? "").trim() : undefined;
            const client_type = keyIndex.client_type !== undefined ? (cells[keyIndex.client_type] ?? "").trim() : undefined;
            const rowNum = i + 1;
            if (!name) {
              validationErrors.push(`שורה ${rowNum}: שם חובה`);
              continue;
            }
            if (!phone || (phone.match(/\d/g) || []).length < 7) {
              validationErrors.push(`שורה ${rowNum}: טלפון חובה או לא תקין`);
              continue;
            }
            rows.push({
              name,
              phone,
              ...(notes ? { notes } : {}),
              ...(client_type ? { client_type } : {}),
              __rowNumber: rowNum,
            });
          }
          resolve({ rows, validationErrors });
        },
      });
    });
  };

  if (typeof fileOrString === "string") return run(fileOrString);
  const file = fileOrString as File;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => run((reader.result as string) || "").then(resolve);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file, "UTF-8");
  });
}

/**
 * Parse XLSX with strict template: first row of first sheet = header.
 */
export async function parseXLSXStrict(file: File): Promise<StrictParseResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], validationErrors: ["לא נמצא גיליון בקובץ."] };
  }
  const sheet = workbook.Sheets[sheetName] as Record<string, unknown> | undefined;
  if (!sheet) {
    return { rows: [], validationErrors: ["לא נמצא גיליון עם נתונים."] };
  }
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as string[][];
  if (!grid.length) {
    return { rows: [], validationErrors: ["הגיליון ריק."] };
  }
  const headerCells = (grid[0] ?? []).map((c) => String(c ?? "").trim());
  const keyIndex = headerToKeyIndex(headerCells);
  const headerError = validateHeaders(headerCells);
  if (headerError) {
    return { rows: [], validationErrors: [headerError], sheetName };
  }
  const validationErrors: string[] = [];
  const rows: ParsedClientRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = (grid[i] ?? []).map((c) => String(c ?? "").trim());
    const allEmpty = cells.every((c) => !c);
    if (allEmpty) continue;
    const name = (keyIndex.name !== undefined ? cells[keyIndex.name] ?? "" : "").trim();
    const phoneRaw = (keyIndex.phone !== undefined ? cells[keyIndex.phone] ?? "" : "").trim();
    const phone = normalizePhone(phoneRaw);
    const notes = keyIndex.notes !== undefined ? (cells[keyIndex.notes] ?? "").trim() : undefined;
    const client_type = keyIndex.client_type !== undefined ? (cells[keyIndex.client_type] ?? "").trim() : undefined;
    const rowNum = i + 1;
    if (!name) {
      validationErrors.push(`שורה ${rowNum}: שם חובה`);
      continue;
    }
    if (!phone || (phone.match(/\d/g) || []).length < 7) {
      validationErrors.push(`שורה ${rowNum}: טלפון חובה או לא תקין`);
      continue;
    }
    rows.push({
      name,
      phone,
      ...(notes ? { notes } : {}),
      ...(client_type ? { client_type } : {}),
      __rowNumber: rowNum,
    });
  }
  return { rows, validationErrors, sheetName };
}

export function parseFileStrict(file: File): Promise<StrictParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseXLSXStrict(file);
  if (name.endsWith(".csv")) return parseCSVStrict(file);
  return Promise.resolve({
    rows: [],
    validationErrors: ["סוג קובץ לא נתמך. השתמש ב-CSV או XLSX."],
  });
}
