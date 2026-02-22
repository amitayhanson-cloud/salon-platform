/**
 * Fetches ALL archived cancelled bookings for a site from both storage locations:
 * 1) sites/{siteId}/bookings - docs with status or statusAtArchive indicating cancelled
 * 2) sites/{siteId}/clients/{clientId}/archivedServiceTypes - archived docs (cascade moves here)
 *
 * Merge by source; no dedupe needed (cascade deletes from bookings when writing to archived).
 */

import { query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import {
  bookingsCollection,
  clientsCollection,
  clientArchivedServiceTypesCollection,
} from "@/lib/firestorePaths";
import { isFollowUpBooking } from "@/lib/normalizeBooking";

export const CANCELLED_STATUSES = [
  "cancelled",
  "canceled",
  "cancelled_by_salon",
  "no_show",
] as const;

function isCancelledStatus(s: string | null | undefined): boolean {
  if (!s || typeof s !== "string") return false;
  return CANCELLED_STATUSES.includes(s.toLowerCase() as (typeof CANCELLED_STATUSES)[number]);
}

/** Check if doc indicates cancelled (status, statusAtArchive, or displayedStatus) */
function isDocCancelled(data: Record<string, unknown>): boolean {
  const status = (data.status as string) ?? "";
  const statusAtArchive = (data.statusAtArchive as string) ?? "";
  const displayedStatus = (data.displayedStatus as string) ?? "";
  return (
    isCancelledStatus(status) ||
    isCancelledStatus(statusAtArchive) ||
    isCancelledStatus(displayedStatus)
  );
}

export interface CancelledArchiveItem {
  id: string;
  source: "bookings" | "archivedServiceTypes";
  customerName: string;
  customerPhone: string;
  phone?: string;
  date: string;
  time: string;
  durationMin: number;
  workerId: string | null;
  workerName?: string;
  serviceName?: string;
  cancellationReason?: string | null;
  status: string;
  statusAtArchive?: string | null;
  archivedAt?: string | null;
  /** For stable sort: prefer startAt ms, else date+time derived */
  sortKeyMs: number;
}

function toTimestampMs(data: Record<string, unknown>, dateStr: string, timeStr: string): number {
  const startAt = data.startAt as { toDate?: () => Date } | undefined;
  if (startAt && typeof startAt.toDate === "function") {
    return startAt.toDate().getTime();
  }
  const [h = 0, m = 0] = (timeStr || "00:00").split(":").map(Number);
  const [y, mo, d] = (dateStr || "1970-01-01").split("-").map(Number);
  const date = new Date(y, (mo ?? 1) - 1, d ?? 1, h, m, 0);
  return date.getTime();
}

function mapBookingsDoc(
  doc: { id: string; data: () => Record<string, unknown> }
): CancelledArchiveItem | null {
  const data = doc.data();
  if (isFollowUpBooking(data)) return null;
  if (!isDocCancelled(data)) return null;

  const dateStr = (data.date as string) ?? "";
  const timeStr = (data.time as string) ?? "";
  const sortKeyMs = toTimestampMs(data, dateStr, timeStr);

  return {
    id: doc.id,
    source: "bookings",
    customerName: (data.customerName as string) || "",
    customerPhone: (data.customerPhone as string) || (data.phone as string) || "",
    phone: (data.phone as string) ?? undefined,
    date: dateStr,
    time: timeStr,
    durationMin: (data.durationMin as number) ?? 60,
    workerId: (data.workerId as string) || null,
    workerName: (data.workerName as string) ?? undefined,
    serviceName: (data.serviceName ?? data.service) as string | undefined,
    cancellationReason: (data.cancellationReason ?? data.cancelReason) as string | null,
    status: (data.status as string) ?? (data.statusAtArchive as string) ?? "",
    statusAtArchive: (data.statusAtArchive as string) ?? undefined,
    archivedAt: undefined,
    sortKeyMs,
  };
}

function mapArchivedDoc(
  doc: { id: string; data: () => Record<string, unknown> }
): CancelledArchiveItem | null {
  const data = doc.data();
  if (!isDocCancelled(data)) return null;

  const dateStr = (data.date as string) ?? "";
  const timeStr = (data.time as string) ?? "";
  const sortKeyMs = toTimestampMs(data, dateStr, timeStr);

  const archivedAtRaw = data.archivedAt;
  const archivedAtStr =
    archivedAtRaw && typeof archivedAtRaw === "object" && "toDate" in archivedAtRaw
      ? (archivedAtRaw as { toDate: () => Date }).toDate().toISOString()
      : null;

  return {
    id: doc.id,
    source: "archivedServiceTypes",
    customerName: (data.customerName as string) || "",
    customerPhone: (data.customerPhone as string) || (data.phone as string) || "",
    phone: (data.phone as string) ?? undefined,
    date: dateStr,
    time: timeStr,
    durationMin: (data.durationMin as number) ?? 60,
    workerId: (data.workerId as string) || null,
    workerName: (data.workerName as string) ?? undefined,
    serviceName: (data.serviceName ?? data.service) as string | undefined,
    cancellationReason: (data.cancellationReason ?? data.cancelReason) as string | null,
    status: (data.statusAtArchive as string) ?? (data.status as string) ?? "",
    statusAtArchive: (data.statusAtArchive as string) ?? undefined,
    archivedAt: archivedAtStr,
    sortKeyMs,
  };
}

export type FetchCancelledResult = {
  items: CancelledArchiveItem[];
  debug?: {
    bookingsScanned: number;
    archivedScanned: number;
    cancelledFromBookings: number;
    cancelledFromArchived: number;
    totalCancelled: number;
    firstDate: string | null;
    lastDate: string | null;
  };
};

/**
 * Fetch all cancelled archived bookings from both sources.
 * Runs two queries on bookings (status + statusAtArchive) and iterates clients for archivedServiceTypes.
 */
export async function fetchCancelledArchivedBookings(
  siteId: string,
  opts?: { debug?: boolean }
): Promise<FetchCancelledResult> {
  if (!db) {
    return { items: [] };
  }

  const items: CancelledArchiveItem[] = [];
  let bookingsScanned = 0;
  let archivedScanned = 0;

  const col = bookingsCollection(siteId);

  // Query A: status in CANCELLED
  const qA = query(col, where("status", "in", [...CANCELLED_STATUSES]));
  const snapA = await getDocs(qA);
  bookingsScanned += snapA.docs.length;
  for (const d of snapA.docs) {
    const mapped = mapBookingsDoc({ id: d.id, data: () => d.data() });
    if (mapped) items.push(mapped);
  }

  // Query B: statusAtArchive in CANCELLED (catch docs where status differs)
  try {
    const qB = query(col, where("statusAtArchive", "in", [...CANCELLED_STATUSES]));
    const snapB = await getDocs(qB);
    bookingsScanned += snapB.docs.length;
    const seen = new Set(items.map((i) => i.id));
    for (const d of snapB.docs) {
      if (seen.has(d.id)) continue;
      const mapped = mapBookingsDoc({ id: d.id, data: () => d.data() });
      if (mapped) {
        items.push(mapped);
        seen.add(mapped.id);
      }
    }
  } catch {
    // Index may not exist for statusAtArchive; continue
  }

  const cancelledFromBookings = items.length;

  // Source 2: archivedServiceTypes per client (cascade moves cancelled here)
  const clientsSnap = await getDocs(clientsCollection(siteId));
  for (const clientDoc of clientsSnap.docs) {
    const clientId = clientDoc.id;
    const archivedCol = clientArchivedServiceTypesCollection(siteId, clientId);
    const qArch = query(
      archivedCol,
      where("statusAtArchive", "in", [...CANCELLED_STATUSES])
    );
    const archSnap = await getDocs(qArch);
    archivedScanned += archSnap.docs.length;
    for (const d of archSnap.docs) {
      const mapped = mapArchivedDoc({ id: d.id, data: () => d.data() });
      if (mapped) items.push(mapped);
    }
  }

  const cancelledFromArchived = items.length - cancelledFromBookings;

  // Dedupe by id (Query A and B can both return same doc; archivedServiceTypes ids differ from bookings)
  const byId = new Map<string, CancelledArchiveItem>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  const deduped = Array.from(byId.values());

  // Sort by appointment time descending (newest first), tie-break by id
  deduped.sort((a, b) => {
    if (b.sortKeyMs !== a.sortKeyMs) return b.sortKeyMs - a.sortKeyMs;
    return b.id.localeCompare(a.id);
  });

  const sorted = deduped;
  const firstDate = sorted.length > 0 ? sorted[sorted.length - 1]!.date : null;
  const lastDate = sorted.length > 0 ? sorted[0]!.date : null;

  const result: FetchCancelledResult = {
    items: sorted,
  };
  if (opts?.debug) {
    result.debug = {
      bookingsScanned,
      archivedScanned,
      cancelledFromBookings,
      cancelledFromArchived,
      totalCancelled: sorted.length,
      firstDate,
      lastDate,
    };
  }
  return result;
}
