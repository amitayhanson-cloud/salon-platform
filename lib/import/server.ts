/**
 * Server-side import: dry-run (validate + count) and execute (batch write).
 * Clients-only: name + phone. Uses Firebase Admin (getAdminDb). Run only in API routes.
 * Uses Firestore batch writes for throughput (max 500 ops/batch).
 */

import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import type { ColumnMapping, RawRow, DryRunResult, ExecuteResult, RowError, PreviewRow } from "./types";
import { mapRow } from "./mapRow";
import { normalizePhone } from "./normalize";

const BATCH_SIZE = 100;
const LOG_EVERY_N = 25;
export interface ImportContext {
  siteId: string;
}

export async function loadImportContext(siteId: string): Promise<ImportContext> {
  return { siteId };
}

export async function runDryRun(
  siteId: string,
  rows: RawRow[],
  mapping: ColumnMapping
): Promise<DryRunResult> {
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
    if (previewRows.length < PREVIEW_CAP && !clientPhones.has(phoneNorm)) {
      previewRows.push({
        fullName: client.name || "—",
        phone: phoneNorm,
        email: client.email,
        notes: client.notes,
      });
    }
    clientPhones.add(phoneNorm);
  }

  if (rows.length > 0 && errors.length > rows.length * 0.5) {
    warnings.push({
      row: 0,
      message: `נראה שמיפוי העמודות שגוי: רק ${clientPhones.size} מתוך ${rows.length} שורות מכילות טלפון תקין. בדוק שבחרת את עמודת הטלפון הנכונה.`,
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

export async function runExecute(
  siteId: string,
  rows: RawRow[],
  mapping: ColumnMapping,
  options: { skipRowsWithErrors?: boolean }
): Promise<ExecuteResult> {
  const skipErrors = options.skipRowsWithErrors ?? false;
  const db = getAdminDb();
  const clientsRef = db.collection("sites").doc(siteId).collection("clients");
  let clientsCreated = 0;
  let clientsUpdated = 0;
  const errors: RowError[] = [];
  const upsertedClients = new Set<string>();

  type PendingRow = { phoneNorm: string; client: { name: string; phone: string; email?: string; notes?: string } };
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
    pending.push({ phoneNorm, client });
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
      const data = {
        name: client.name || "—",
        phone: phoneNorm,
        email: null,
        notes: null,
        updatedAt: Timestamp.now(),
      };
      const clientRef = clientsRef.doc(phoneNorm);
      if (existing.exists) {
        writeBatch.set(clientRef, data, { merge: true });
        clientsUpdated++;
      } else {
        writeBatch.set(clientRef, { ...data, createdAt: Timestamp.now() }, { merge: true });
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
