/**
 * GET /api/booking-waitlist/offer-gate?siteId=&entryId=&t=
 * Public: state for waitlist web confirmation page (token proves link possession).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { BookingWaitlistEntry } from "@/types/bookingWaitlist";
import { isWaitlistPendingOfferStatus } from "@/lib/bookingWaitlist/waitlistStatus";
import {
  isWaitlistEntryOfferExpired,
} from "@/lib/bookingWaitlist/waitlistOfferExpiry";

function siteContactFromData(data: Record<string, unknown> | undefined): {
  salonName: string;
  phoneDisplay: string | null;
  telHref: string | null;
  whatsappHref: string | null;
} {
  const cfg = data?.config as Record<string, unknown> | undefined;
  const salonName = String(cfg?.salonName ?? cfg?.whatsappBrandName ?? "העסק").trim() || "העסק";
  const phoneRaw = String(cfg?.phoneNumber ?? "").trim();
  const waRaw = String(cfg?.whatsappNumber ?? "").trim();
  const digitsWa = waRaw.replace(/\D/g, "");
  const phoneDisplay = phoneRaw || (waRaw ? waRaw : null);
  const telHref =
    phoneRaw.length > 0
      ? `tel:${phoneRaw.replace(/\s|-|\(|\)/g, "")}`
      : digitsWa.length > 0
        ? `tel:+${digitsWa.startsWith("972") ? digitsWa : `972${digitsWa.replace(/^0/, "")}`}`
        : null;
  const whatsappHref =
    digitsWa.length > 0 ? `https://wa.me/${digitsWa.startsWith("972") ? digitsWa : `972${digitsWa.replace(/^0/, "")}`}` : null;
  return { salonName, phoneDisplay, telHref, whatsappHref };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId")?.trim() ?? "";
  const entryId = searchParams.get("entryId")?.trim() ?? "";
  const t = searchParams.get("t")?.trim() ?? "";
  if (!siteId || !entryId || !t) {
    return NextResponse.json({ ok: false, error: "bad_params" }, { status: 400 });
  }

  const db = getAdminDb();
  const [siteSnap, entrySnap] = await Promise.all([
    db.collection("sites").doc(siteId).get(),
    db.collection("sites").doc(siteId).collection("bookingWaitlistEntries").doc(entryId).get(),
  ]);

  if (!siteSnap.exists) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const contact = siteContactFromData(siteSnap.data() as Record<string, unknown>);

  if (!entrySnap.exists) {
    return NextResponse.json({
      ok: true,
      state: "invalid",
      salonName: contact.salonName,
      ...contact,
    });
  }

  const entry = entrySnap.data() as BookingWaitlistEntry;
  const expected = entry.offerWebConfirmToken?.trim();
  if (!expected || expected !== t) {
    return NextResponse.json({
      ok: true,
      state: "invalid",
      salonName: contact.salonName,
      ...contact,
    });
  }

  if (!isWaitlistPendingOfferStatus(entry.status) || !entry.offer) {
    return NextResponse.json({
      ok: true,
      state: "used",
      salonName: contact.salonName,
      ...contact,
    });
  }

  if (isWaitlistEntryOfferExpired(entry)) {
    return NextResponse.json({
      ok: true,
      state: "expired",
      salonName: contact.salonName,
      ...contact,
    });
  }

  const offer = entry.offer;
  return NextResponse.json({
    ok: true,
    state: "active",
    salonName: contact.salonName,
    ...contact,
    offerSummary: {
      dateYmd: offer.dateYmd,
      timeHHmm: offer.timeHHmm.length >= 5 ? offer.timeHHmm.slice(0, 5) : offer.timeHHmm.trim(),
      serviceName: entry.serviceName || offer.serviceName,
    },
  });
}
