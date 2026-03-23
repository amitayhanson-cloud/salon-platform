import type { BookingForStatus } from "@/lib/clientStatusEngine";

/** Accept Firestore Timestamp-like or plain object from admin/client SDK. */
function startAtToDate(startAt: unknown): Date | null {
  if (startAt == null) return null;
  if (startAt instanceof Date) {
    return Number.isNaN(startAt.getTime()) ? null : startAt;
  }
  const withToDate = startAt as { toDate?: () => Date };
  if (typeof withToDate.toDate === "function") {
    try {
      const d = withToDate.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  const sec = (startAt as { seconds?: number }).seconds;
  if (typeof sec === "number") {
    const d = new Date(sec * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Map a booking document (client or admin SDK shape) to fields used by {@link calculateAutomatedClientStatus}.
 * Falls back to `startAt` when string date/time fields are missing (imports, legacy docs).
 */
export function firestoreBookingRecordToBookingForStatus(data: Record<string, unknown>): BookingForStatus {
  const status =
    (typeof data.status === "string" && data.status.trim()) ||
    (typeof data.statusAtArchive === "string" && data.statusAtArchive.trim()) ||
    "";
  let date =
    (typeof data.date === "string" && data.date.trim()) ||
    (typeof data.dateISO === "string" && data.dateISO.trim()) ||
    (typeof data.dateStr === "string" && data.dateStr.trim()) ||
    "";
  let time =
    (typeof data.time === "string" && data.time.trim()) ||
    (typeof data.timeHHmm === "string" && data.timeHHmm.trim()) ||
    "";

  if (!date || !time) {
    const d = startAtToDate(data.startAt);
    if (d && !Number.isNaN(d.getTime())) {
      if (!date) {
        date =
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0");
      }
      if (!time) {
        time = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      }
    }
  }

  const whatsappStatus =
    typeof data.whatsappStatus === "string" && data.whatsappStatus.trim()
      ? data.whatsappStatus.trim()
      : "";
  const cancelled = data.cancelled === true;

  return { date, time, status, whatsappStatus: whatsappStatus || undefined, cancelled };
}

/** Same normalization as getOrCreateClient document id. */
export function normalizeClientPhoneKey(phone: string): string {
  return phone.replace(/\s|-|\(|\)/g, "");
}
