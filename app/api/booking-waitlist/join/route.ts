/**
 * POST /api/booking-waitlist/join
 * Public: customer joins tenant waitlist from booking page (rate-limited).
 */

import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { normalizeE164, isValidE164 } from "@/lib/whatsapp/e164";
import { checkRateLimit, getClientIp } from "@/lib/server/rateLimit";
import { normalizeTimePreferenceArray } from "@/lib/bookingWaitlist/timeBuckets";

const WINDOW_MS = 60 * 60 * 1000;
const LIMIT_PER_IP = 25;

function parseNonNegInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`waitlist-join:${ip}`, LIMIT_PER_IP, WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : "";
    const customerName = typeof body?.customerName === "string" ? body.customerName.trim() : "";
    const phoneRaw = typeof body?.customerPhone === "string" ? body.customerPhone.trim() : "";
    const serviceName = typeof body?.serviceName === "string" ? body.serviceName.trim() : "";
    const serviceId = typeof body?.serviceId === "string" ? body.serviceId.trim() : null;
    const serviceTypeId =
      typeof body?.serviceTypeId === "string" && body.serviceTypeId.trim()
        ? body.serviceTypeId.trim()
        : null;
    const preferredDateYmdRaw =
      typeof body?.preferredDateYmd === "string" ? body.preferredDateYmd.trim() : "";
    const preferredDateYmd = /^\d{4}-\d{2}-\d{2}$/.test(preferredDateYmdRaw) ? preferredDateYmdRaw : null;
    const preferredWorkerId =
      typeof body?.preferredWorkerId === "string" && body.preferredWorkerId.trim()
        ? body.preferredWorkerId.trim()
        : null;

    const primaryDurationMin = Math.max(1, parseNonNegInt(body?.primaryDurationMin, 60));
    const waitMinutes = parseNonNegInt(body?.waitMinutes, 0);
    const followUpDurationMin = parseNonNegInt(body?.followUpDurationMin, 0);
    const followUpServiceName =
      typeof body?.followUpServiceName === "string" && body.followUpServiceName.trim()
        ? body.followUpServiceName.trim().slice(0, 200)
        : null;

    const timePreference = normalizeTimePreferenceArray(body?.timePreference);

    if (!siteId || !customerName || !phoneRaw || !serviceName) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    if (!preferredDateYmd) {
      return NextResponse.json({ ok: false, error: "preferred_date_required" }, { status: 400 });
    }

    const e164 = normalizeE164(phoneRaw, "IL");
    if (!isValidE164(e164)) {
      return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteSnap = await db.collection("sites").doc(siteId).get();
    if (!siteSnap.exists) {
      return NextResponse.json({ ok: false, error: "site_not_found" }, { status: 404 });
    }

    const col = db.collection("sites").doc(siteId).collection("bookingWaitlistEntries");
    const counterRef = db
      .collection("sites")
      .doc(siteId)
      .collection("bookingWaitlistDayCounters")
      .doc(preferredDateYmd);

    const newRef = col.doc();

    await db.runTransaction(async (tx) => {
      const cSnap = await tx.get(counterRef);
      const last = cSnap.exists ? Number((cSnap.data() as { lastSeq?: number }).lastSeq) || 0 : 0;
      const queuePositionForDay = last + 1;
      tx.set(
        counterRef,
        { lastSeq: queuePositionForDay, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      tx.set(newRef, {
        customerName,
        customerPhoneE164: e164,
        customerPhoneRaw: phoneRaw.replace(/\s|-|\(|\)/g, ""),
        serviceName,
        serviceId,
        serviceTypeId,
        preferredDateYmd,
        preferredWorkerId,
        status: "waiting",
        queuePositionForDay,
        primaryDurationMin,
        waitMinutes,
        followUpDurationMin,
        timePreference,
        ...(followUpServiceName ? { followUpServiceName } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true, id: newRef.id });
  } catch (e) {
    console.error("[booking-waitlist/join]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
