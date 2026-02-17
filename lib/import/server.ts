/**
 * Server-side import: dry-run (validate + count) and execute (batch write).
 * Clients-only: name + phone required; notes, clientType optional. Uses Firebase Admin. Batch max 400.
 * Strict import: runExecuteStrict for template-based rows (no mapping); validates client_type.
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { REGULAR_CLIENT_TYPE_ID } from "@/types/bookingSettings";
import type { ColumnMapping, RawRow, DryRunResult, ExecuteResult, RowError, PreviewRow } from "./types";
import { mapRow } from "./mapRow";
import { normalizePhone } from "./normalize";
import type { ParsedClientRow } from "./parse";

const BATCH_SIZE = 400;
const LOG_EVERY_N = 100;

export interface ImportContext {
  siteId: string;
}

/** Client type entry as stored in settings/clients. */
interface ClientTypeEntryLike {
  id: string;
  labelHe: string;
}

/** Fixed aliases for the 5 system default client types (English + Hebrew). Used by importer so CSV with פעיל/חדש/רדום etc. resolve. */
const SYSTEM_DEFAULT_ALIASES: { id: string; aliases: string[] }[] = [
  { id: REGULAR_CLIENT_TYPE_ID, aliases: ["regular", "רגיל"] },
  { id: "vip", aliases: ["vip", "וי.איי.פי", "וי איי פי"] },
  { id: "active", aliases: ["active", "פעיל", "פעילה"] },
  { id: "new", aliases: ["new", "חדש", "חדשה"] },
  { id: "inactive", aliases: ["inactive", "רדום", "רדומה", "לא פעיל"] },
];

/**
 * Load tenant client types from sites/{siteId}/settings/clients and build map:
 * normalized label (lowercase trim) -> id. Always includes the 5 system default types with English + Hebrew aliases.
 */
export async function loadClientTypesMap(siteId: string): Promise<Map<string, string>> {
  const db = getAdminDb();
  const map = new Map<string, string>();
  const norm = (s: string) => s.toLowerCase().trim();
  for (const { id, aliases } of SYSTEM_DEFAULT_ALIASES) {
    map.set(norm(id), id);
    for (const a of aliases) {
      map.set(norm(a), id);
    }
  }
  const snap = await db.collection("sites").doc(siteId).collection("settings").doc("clients").get();
  const raw = snap.exists ? (snap.data() as { clientTypes?: ClientTypeEntryLike[] })?.clientTypes : undefined;
  const list = Array.isArray(raw) ? raw : [];
  for (const e of list) {
    if (e && typeof e.id === "string" && typeof e.labelHe === "string") {
      map.set(norm(e.id), e.id);
      map.set(norm(e.labelHe), e.id);
    }
  }
  return map;
}

/**
 * Resolve CSV clientType string to tenant clientTypeId. If no match, return REGULAR and set warning.
 */
function resolveClientType(
  clientTypeRaw: string | undefined,
  rowNum: number,
  clientTypesMap: Map<string, string>,
  warnings: RowError[]
): string {
  if (!clientTypeRaw?.trim()) return REGULAR_CLIENT_TYPE_ID;
  const key = clientTypeRaw.toLowerCase().trim();
  const id = clientTypesMap.get(key);
  if (id) return id;
  warnings.push({
    row: rowNum,
    field: "clientType",
    message: `סוג לקוח לא מוכר "${clientTypeRaw}" – יוגדר כרגיל`,
  });
  return REGULAR_CLIENT_TYPE_ID;
}

export async function loadImportContext(siteId: string): Promise<ImportContext> {
  return { siteId };
}

export async function runDryRun(
  siteId: string,
  rows: RawRow[],
  mapping: ColumnMapping,
  options: { clientTypesMap?: Map<string, string> } = {}
): Promise<DryRunResult> {
  const clientTypesMap = options.clientTypesMap ?? (await loadClientTypesMap(siteId));
  const clientPhones = new Set<string>();
  const errors: RowError[] = [];
  const warnings: RowError[] = [];
  const previewRows: PreviewRow[] = [];
  const PREVIEW_CAP = 50;

  for (let i = 0; i < rows.length; i++) {
    const { client, rowErrors } = mapRow(rows[i], mapping, i);
    rowErrors.forEach((e) => errors.push(e));
    if (rowErrors.length > 0) continue;
    const phoneNorm = normalizePhone(client.phone);
    if (!phoneNorm) continue;

    const rowNum = i + 1;
    const clientTypeId = resolveClientType(client.clientType, rowNum, clientTypesMap, warnings);
    const status: PreviewRow["status"] = client.clientType && !clientTypesMap.get(client.clientType.toLowerCase().trim()) ? "warning" : "ok";
    const statusReason = status === "warning" ? "סוג לקוח הוחלף לרגיל" : undefined;

    if (previewRows.length < PREVIEW_CAP && !clientPhones.has(phoneNorm)) {
      previewRows.push({
        name: client.name || "—",
        fullName: client.name || "—",
        phone: phoneNorm,
        notes: client.notes,
        clientType: clientTypeId,
        status,
        statusReason,
      });
    }
    clientPhones.add(phoneNorm);
  }

  if (rows.length > 0 && errors.length > rows.length * 0.5) {
    warnings.push({
      row: 0,
      message: `נראה שמיפוי העמודות שגוי: רק ${clientPhones.size} מתוך ${rows.length} שורות תקינות. בדוק עמודות שם וטלפון.`,
    });
  }

  return {
    clientsToCreate: clientPhones.size,
    clientsToUpdate: 0,
    bookingsToCreate: 0,
    bookingsToSkip: 0,
    errors,
    warnings,
    previewRows,
    droppedRowCount: errors.length,
  };
}

type PendingClient = {
  name: string;
  phone: string;
  notes?: string;
  clientTypeId: string;
};

export async function runExecute(
  siteId: string,
  rows: RawRow[],
  mapping: ColumnMapping,
  options: { skipRowsWithErrors?: boolean; clientTypesMap?: Map<string, string> } = {}
): Promise<ExecuteResult> {
  const skipErrors = options.skipRowsWithErrors ?? true;
  const clientTypesMap = options.clientTypesMap ?? (await loadClientTypesMap(siteId));
  const db = getAdminDb();
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  let clientsCreated = 0;
  let clientsUpdated = 0;
  const errors: RowError[] = [];
  const warnings: RowError[] = [];
  const upsertedClients = new Set<string>();

  type PendingRow = { phoneNorm: string; client: PendingClient };
  const pending: PendingRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && i % LOG_EVERY_N === 0) {
      console.log("[import/runExecute] processed rows", i, "/", rows.length);
    }
    const { client, rowErrors } = mapRow(rows[i], mapping, i);
    rowErrors.forEach((e) => errors.push(e));
    if (rowErrors.length > 0) {
      if (skipErrors) continue;
      continue;
    }
    const phoneNorm = normalizePhone(client.phone);
    if (!phoneNorm) continue;
    if (upsertedClients.has(phoneNorm)) continue;
    upsertedClients.add(phoneNorm);

    const clientTypeId = resolveClientType(client.clientType, i + 1, clientTypesMap, warnings);
    pending.push({
      phoneNorm,
      client: {
        name: client.name || "—",
        phone: phoneNorm,
        notes: client.notes,
        clientTypeId,
      },
    });
  }

  console.log("[import/runExecute] mapped", pending.length, "clients to upsert, errors=", errors.length);

  for (let off = 0; off < pending.length; off += BATCH_SIZE) {
    const batch = pending.slice(off, off + BATCH_SIZE);
    const refs = batch.map((p) => clientsRef.doc(p.phoneNorm));
    const snapshots = await db.getAll(...refs);

    const writeBatch = db.batch();
    for (let j = 0; j < batch.length; j++) {
      const { phoneNorm, client } = batch[j];
      const existing = snapshots[j];
      const existingData = existing.exists ? (existing.data() as { name?: string; notes?: string | null }) : null;

      const clientRef = clientsRef.doc(phoneNorm);
      if (existing.exists && existingData) {
        const name = (existingData.name?.trim() ? existingData.name : client.name) ?? "—";
        const notes = (existingData.notes != null && existingData.notes !== "" ? existingData.notes : client.notes) ?? null;
        const data: Record<string, unknown> = {
          name,
          phone: phoneNorm,
          notes,
          clientTypeId: client.clientTypeId,
          updatedAt: Timestamp.now(),
        };
        writeBatch.set(clientRef, data, { merge: true });
        clientsUpdated++;
      } else {
        const data: Record<string, unknown> = {
          name: client.name,
          phone: phoneNorm,
          notes: client.notes ?? null,
          clientTypeId: client.clientTypeId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        writeBatch.set(clientRef, data, { merge: true });
        clientsCreated++;
      }
    }
    await writeBatch.commit();
    console.log("[import/runExecute] batch committed", off + batch.length, "/", pending.length);
  }

  return {
    clientsCreated,
    clientsUpdated,
    bookingsCreated: 0,
    bookingsSkipped: 0,
    bookingsFailed: 0,
    errors,
  };
}

/**
 * Resolve client_type to clientTypeId for strict import. If provided and not in map -> return null (caller should fail row).
 */
function resolveClientTypeStrict(
  clientTypeRaw: string | undefined,
  clientTypesMap: Map<string, string>
): { id: string } | null {
  if (!clientTypeRaw?.trim()) return { id: REGULAR_CLIENT_TYPE_ID };
  const key = clientTypeRaw.toLowerCase().trim();
  const id = clientTypesMap.get(key);
  if (id) return { id };
  return null;
}

/**
 * Strict client import: rows already parsed with name, phone, notes?, client_type?.
 * - client_type must match site types (fail row if invalid); empty -> "Regular".
 * - Duplicate phone in file: first wins, rest skipped.
 * - Existing client: update notes only if existing empty and incoming non-empty; update client_type if different; else skip.
 */
export async function runExecuteStrict(
  siteId: string,
  rows: ParsedClientRow[],
  options: { clientTypesMap?: Map<string, string> } = {}
): Promise<ExecuteResult> {
  const clientTypesMap = options.clientTypesMap ?? (await loadClientTypesMap(siteId));
  const db = getAdminDb();
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  let clientsCreated = 0;
  let clientsUpdated = 0;
  let clientsSkipped = 0;
  let clientsFailed = 0;
  const errors: RowError[] = [];
  const processedPhones = new Set<string>();

  const allowedLabels = ["Regular", "רגיל", "VIP", "פעיל", "חדש", "רדום", "לא פעיל"];

  type ResolvedRow = { rowNum: number; phone: string; name: string; notes: string | null; clientTypeId: string };
  const resolved: ResolvedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = row.__rowNumber ?? i + 1;
    const phone = row.phone?.trim() || "";
    if (!phone) {
      clientsFailed++;
      errors.push({ row: rowNum, field: "phone", message: "טלפון חסר" });
      continue;
    }
    if (processedPhones.has(phone)) {
      clientsSkipped++;
      continue;
    }
    const resolvedType = resolveClientTypeStrict(row.client_type, clientTypesMap);
    if (!resolvedType) {
      clientsFailed++;
      errors.push({
        row: rowNum,
        field: "client_type",
        message: `סוג לקוח לא מוכר "${row.client_type}". סוגים מותרים: ${allowedLabels.join(", ")}.`,
      });
      continue;
    }
    processedPhones.add(phone);
    resolved.push({
      rowNum,
      phone,
      name: (row.name ?? "").trim() || "—",
      notes: row.notes?.trim() ? row.notes.trim() : null,
      clientTypeId: resolvedType.id,
    });
  }

  for (let off = 0; off < resolved.length; off += BATCH_SIZE) {
    const batch = resolved.slice(off, off + BATCH_SIZE);
    const refs = batch.map((p) => clientsRef.doc(p.phone));
    const snapshots = await db.getAll(...refs);
    const writeBatch = db.batch();

    for (let j = 0; j < batch.length; j++) {
      const r = batch[j];
      const existing = snapshots[j];
      const existingData = existing.exists ? (existing.data() as { name?: string; notes?: string | null; clientNotes?: string | null; clientTypeId?: string }) : null;
      const clientRef = clientsRef.doc(r.phone);

      if (!existing.exists || !existingData) {
        const notesVal = r.notes != null && r.notes !== "" ? r.notes : null;
        writeBatch.set(clientRef, {
          name: r.name,
          phone: r.phone,
          notes: notesVal,
          clientNotes: notesVal,
          clientTypeId: r.clientTypeId,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        clientsCreated++;
        continue;
      }

      const existingNotesRaw = (existingData.notes ?? existingData.clientNotes) ?? "";
      const existingNotes = typeof existingNotesRaw === "string" && existingNotesRaw.trim() !== "" ? existingNotesRaw.trim() : null;
      const newNotes = existingNotes !== null ? existingNotes : (r.notes != null && r.notes !== "" ? r.notes : null);
      const newTypeId = r.clientTypeId !== (existingData.clientTypeId ?? REGULAR_CLIENT_TYPE_ID) ? r.clientTypeId : (existingData.clientTypeId ?? REGULAR_CLIENT_TYPE_ID);
      const notesChanged = newNotes !== existingNotes;
      const typeChanged = newTypeId !== (existingData.clientTypeId ?? REGULAR_CLIENT_TYPE_ID);

      if (!notesChanged && !typeChanged) {
        clientsSkipped++;
        continue;
      }

      writeBatch.set(
        clientRef,
        {
          name: existingData.name?.trim() ? existingData.name : r.name,
          phone: r.phone,
          notes: newNotes,
          clientNotes: newNotes,
          clientTypeId: newTypeId,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
      clientsUpdated++;
    }
    await writeBatch.commit();
  }

  return {
    clientsCreated,
    clientsUpdated,
    clientsSkipped,
    clientsFailed,
    bookingsCreated: 0,
    bookingsSkipped: 0,
    bookingsFailed: 0,
    errors,
  };
}
