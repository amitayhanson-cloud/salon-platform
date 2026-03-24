/**
 * POST /api/bookings/confirm-after-create
 * PUBLIC PATH (no auth): Used only immediately after a customer creates a booking.
 * For admin flows, use POST /api/whatsapp/send-booking-confirmation with auth.
 *
 * Security:
 * - 400: Invalid payload
 * - 403: Validation failed (booking too old, already confirmed, wrong site)
 * - 404: Booking not found
 * - 429: Rate limited (per IP, per bookingId, per siteId)
 *
 * Guard:
 * - Booking must exist
 * - Booking must belong to intended site (siteId from path matches doc)
 * - createdAt <= 2 minutes
 * - confirmationSentAt must be null (not already sent)
 * - status must be "booked" or similar (pending)
 *
 * Note: Do not set confirmationSentAt here — onBookingCreated sets it after WhatsApp send.
 * Pre-setting it caused onBookingCreated to exit early and skip all messages.
 */

import { NextRequest, NextResponse } from "next/server";
import { type DocumentReference } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { onBookingCreated } from "@/lib/onBookingCreated";
import { checkRateLimit, getClientIp } from "@/lib/server/rateLimit";
import { getSiteWhatsAppSettings } from "@/lib/whatsapp/siteWhatsAppSettings";
import { buildBookingSuccessWhatsAppOptInUrl } from "@/lib/whatsapp/waMeOptInLink";

const CREATED_WITHIN_MS = 2 * 60 * 1000; // 2 minutes (server `createdAt`)
/** When only client-written millis exist (before serverTimestamp resolves), allow a looser window + clock skew. */
const CREATED_CLIENT_MS_WINDOW = 10 * 60 * 1000;
const CREATED_CLOCK_SKEW_MS = 2 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RATE_LIMIT_PER_IP = 20; // 20 confirm attempts per IP per 10 min
const RATE_LIMIT_PER_BOOKING = 2; // 2 per booking (retries)
const RATE_LIMIT_PER_SITE = 50; // 50 per site per 10 min

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const withToMillis = v as { toMillis?: () => number };
  if (typeof withToMillis.toMillis === "function") return withToMillis.toMillis();
  const withSeconds = v as { seconds?: number };
  if (typeof withSeconds.seconds === "number") return withSeconds.seconds * 1000;
  if (typeof v === "number") return v;
  return null;
}

function isFreshBooking(data: Record<string, unknown>, now: number): boolean {
  const serverMs = toMillis(data.createdAt);
  if (serverMs != null) {
    if (serverMs > now + 60_000) return false;
    return now - serverMs <= CREATED_WITHIN_MS;
  }
  const clientMsRaw = data.createdAtClientMs;
  const clientMs =
    typeof clientMsRaw === "number" && Number.isFinite(clientMsRaw) ? clientMsRaw : null;
  if (clientMs == null) return false;
  if (clientMs > now + CREATED_CLOCK_SKEW_MS) return false;
  return now - clientMs <= CREATED_CLIENT_MS_WINDOW;
}

/**
 * Re-fetch briefly: right after client `addDoc`, `createdAt: serverTimestamp()` is often still missing on read.
 * `createdAtClientMs` (written by the client) makes the first read sufficient when present.
 */
async function loadBookingForConfirm(
  bookingRef: DocumentReference,
  now: number,
  maxAttempts = 15,
  delayMs = 100
): Promise<Record<string, unknown> | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const snap = await bookingRef.get();
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    if (isFreshBooking(data, now)) return data;
    const hasAnyCreatedMarker =
      toMillis(data.createdAt) != null || typeof data.createdAtClientMs === "number";
    if (hasAnyCreatedMarker) return data;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  const snap = await bookingRef.get();
  if (!snap.exists) return null;
  return snap.data() as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : undefined;
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId.trim() : undefined;

    if (!siteId || !bookingId) {
      return NextResponse.json({ ok: false, error: "siteId and bookingId required" }, { status: 400 });
    }

    const ip = getClientIp(request);

    const [ipOk, bookingOk, siteOk] = await Promise.all([
      checkRateLimit(`confirm_ip:${ip}`, RATE_LIMIT_PER_IP, RATE_LIMIT_WINDOW_MS),
      checkRateLimit(`confirm_booking:${siteId}:${bookingId}`, RATE_LIMIT_PER_BOOKING, RATE_LIMIT_WINDOW_MS),
      checkRateLimit(`confirm_site:${siteId}`, RATE_LIMIT_PER_SITE, RATE_LIMIT_WINDOW_MS),
    ]);

    if (!ipOk.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests from this IP" },
        { status: 429 }
      );
    }
    if (!bookingOk.allowed) {
      return NextResponse.json(
        { ok: false, error: "Confirmation already sent or too many attempts" },
        { status: 429 }
      );
    }
    if (!siteOk.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests for this site" },
        { status: 429 }
      );
    }

    const db = getAdminDb();
    const bookingRef = db.collection("sites").doc(siteId).collection("bookings").doc(bookingId);

    const now = Date.now();
    const data = await loadBookingForConfirm(bookingRef, now);
    if (!data) {
      return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
    }

    const docSiteId = typeof data.siteId === "string" ? data.siteId : null;
    if (docSiteId != null && docSiteId !== siteId) {
      return NextResponse.json({ ok: false, error: "Booking does not belong to this site" }, { status: 403 });
    }

    if (!isFreshBooking(data, now)) {
      return NextResponse.json(
        { ok: false, error: "Booking too old or missing createdAt" },
        { status: 403 }
      );
    }

    const alreadySent = data.confirmationSentAt != null;
    if (alreadySent) {
      return NextResponse.json(
        { ok: false, error: "Confirmation already sent" },
        { status: 403 }
      );
    }

    const status = typeof data.status === "string" ? data.status : "";
    const validStatuses = ["booked", "pending", "confirmed"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Booking status does not allow confirmation" },
        { status: 403 }
      );
    }

    const resolvedSiteId = docSiteId ?? siteId;
    await onBookingCreated(resolvedSiteId, bookingId);

    const waSettings = await getSiteWhatsAppSettings(resolvedSiteId);
    const mode = waSettings.postBookingConfirmationMode ?? "auto";
    const dbSnap = await getAdminDb().collection("sites").doc(resolvedSiteId).get();
    const cfg = dbSnap.data()?.config as { salonName?: string; whatsappBrandName?: string } | undefined;
    const businessName = cfg?.salonName ?? cfg?.whatsappBrandName ?? "העסק";
    const timeLabel =
      typeof data.time === "string" && String(data.time).trim()
        ? String(data.time).trim()
        : typeof data.displayTime === "string" && String(data.displayTime).trim()
          ? String(data.displayTime).trim()
          : "";

    let whatsappOptInUrl: string | null = null;
    if (mode === "whatsapp_opt_in" && waSettings.confirmationEnabled) {
      whatsappOptInUrl = buildBookingSuccessWhatsAppOptInUrl({
        siteId: resolvedSiteId,
        businessName,
        timeLabel: timeLabel || "—",
      });
    }

    return NextResponse.json({
      ok: true,
      bookingId,
      siteId: resolvedSiteId,
      postBookingConfirmationMode: mode,
      whatsappOptInUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[confirm-after-create]", msg);
    return NextResponse.json({ ok: false, error: "Failed to send confirmation" }, { status: 500 });
  }
}
