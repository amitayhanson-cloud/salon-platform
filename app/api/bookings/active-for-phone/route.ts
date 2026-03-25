/**
 * POST /api/bookings/active-for-phone
 * Body: { siteId: string, phone: string }
 * Returns the soonest upcoming non-cancelled booking visit for this phone (same grouping as cascade).
 */
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  bookingDocMatchesPhoneVariants,
  isCancelledBookingStatus,
  phoneVariants,
} from "@/lib/bookingCustomerPhone";
import { getRelatedBookingIds } from "@/lib/whatsapp/relatedBookings";

function visitKey(docId: string, data: Record<string, unknown>): string {
  const vg = String(data.visitGroupId || data.bookingGroupId || "").trim();
  if (vg) return `g:${vg}`;
  const ph = data.phase != null ? Number(data.phase) : 1;
  if (ph === 2) {
    const parent = String(data.parentBookingId || "").trim();
    if (parent) return `r:${parent}`;
  }
  return `r:${docId}`;
}

function startAtFromData(data: Record<string, unknown>): Date | null {
  const st = data.startAt;
  if (st && typeof (st as { toDate?: () => Date }).toDate === "function") {
    const d = (st as { toDate: () => Date }).toDate();
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { siteId?: string; phone?: string };
    const siteId = body?.siteId;
    const phone = body?.phone;
    if (!siteId || typeof siteId !== "string" || !phone || typeof phone !== "string") {
      return NextResponse.json({ ok: false, message: "missing siteId or phone" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteSnap = await db.collection("sites").doc(siteId).get();
    if (!siteSnap.exists) {
      return NextResponse.json({ ok: false, message: "site not found" }, { status: 404 });
    }

    const variants = phoneVariants(phone);
    if (variants.length === 0) {
      return NextResponse.json({ ok: true, active: null });
    }

    const seen = new Set<string>();
    type Row = { id: string; data: Record<string, unknown>; startAt: Date };
    const rows: Row[] = [];
    const now = Date.now();

    for (const pv of variants) {
      const e164Plus = pv.startsWith("+") ? pv : `+${pv}`;
      const [byPhone, byClient, byE164, byE164Plus] = await Promise.all([
        db.collection("sites").doc(siteId).collection("bookings").where("customerPhone", "==", pv).limit(80).get(),
        db.collection("sites").doc(siteId).collection("bookings").where("clientId", "==", pv).limit(80).get(),
        db.collection("sites").doc(siteId).collection("bookings").where("customerPhoneE164", "==", pv).limit(80).get(),
        db.collection("sites").doc(siteId).collection("bookings").where("customerPhoneE164", "==", e164Plus).limit(80).get(),
      ]);
      for (const d of [...byPhone.docs, ...byClient.docs, ...byE164.docs, ...byE164Plus.docs]) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const data = d.data() as Record<string, unknown>;
        if (data.isArchived === true) continue;
        if (isCancelledBookingStatus(data.status as string | undefined)) continue;
        if (!bookingDocMatchesPhoneVariants(data, variants)) continue;
        const startAt = startAtFromData(data);
        if (!startAt || startAt.getTime() <= now) continue;
        rows.push({ id: d.id, data, startAt });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, active: null });
    }

    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const k = visitKey(r.id, r.data);
      const g = groups.get(k) ?? [];
      g.push(r);
      groups.set(k, g);
    }

    let bestKey: string | null = null;
    let bestMin = Infinity;
    for (const [k, list] of groups) {
      const mn = Math.min(...list.map((x) => x.startAt.getTime()));
      if (mn < bestMin) {
        bestMin = mn;
        bestKey = k;
      }
    }
    if (!bestKey) {
      return NextResponse.json({ ok: true, active: null });
    }

    const groupRows = groups.get(bestKey)!;
    const anchorId = groupRows.reduce((a, b) => (a.startAt <= b.startAt ? a : b)).id;

    const related = await getRelatedBookingIds(siteId, anchorId);
    const col = db.collection("sites").doc(siteId).collection("bookings");
    const rootSnap = await col.doc(related.rootId).get();
    const rootData = rootSnap.exists ? (rootSnap.data() as Record<string, unknown>) : null;
    /** Whole visit must belong to this phone; chain segments may omit duplicated phone fields. */
    if (!rootData || !bookingDocMatchesPhoneVariants(rootData, variants)) {
      return NextResponse.json({ ok: true, active: null });
    }

    const memberDocs = await Promise.all(
      related.bookingIds.map((id) => col.doc(id).get())
    );

    type Part = { id: string; data: Record<string, unknown>; startAt: Date };
    const parts: Part[] = [];
    for (let i = 0; i < memberDocs.length; i++) {
      const snap = memberDocs[i]!;
      if (!snap.exists) continue;
      const data = snap.data() as Record<string, unknown>;
      if (data.isArchived === true) continue;
      if (isCancelledBookingStatus(data.status as string | undefined)) continue;
      const startAt = startAtFromData(data);
      if (!startAt || startAt.getTime() <= now) continue;
      parts.push({ id: snap.id, data, startAt });
    }

    if (parts.length === 0) {
      return NextResponse.json({ ok: true, active: null });
    }

    parts.sort((a, b) => {
      const sa = Number(a.data.serviceOrder ?? a.data.stepIndex ?? 0);
      const sb = Number(b.data.serviceOrder ?? b.data.stepIndex ?? 0);
      if (sa !== sb) return sa - sb;
      return a.startAt.getTime() - b.startAt.getTime();
    });

    const first = parts[0]!;
    const dateISO = String(first.data.dateISO || first.data.date || "").trim();
    const timeHHmm = String(first.data.timeHHmm || first.data.time || "").trim();
    const orderedPricingItemIds: string[] = [];
    const siteServiceIds: string[] = [];
    for (const p of parts) {
      const pid = String(p.data.serviceTypeId || p.data.pricingItemId || "").trim();
      if (pid && !orderedPricingItemIds.includes(pid)) {
        orderedPricingItemIds.push(pid);
      }
      const sid = String(p.data.serviceId || "").trim();
      if (sid) siteServiceIds.push(sid);
    }
    const hasServiceLabel =
      String(first.data.serviceName || "").trim() !== "" ||
      (first.data.serviceType != null && String(first.data.serviceType).trim() !== "");
    if (orderedPricingItemIds.length === 0 && !hasServiceLabel) {
      return NextResponse.json({ ok: true, active: null });
    }

    const isMultiBooking =
      orderedPricingItemIds.length > 1 || first.data.isMultiBooking === true;

    const multiBookingComboId =
      typeof first.data.multiBookingComboId === "string"
        ? first.data.multiBookingComboId.trim() || null
        : null;

    const dateLabel = first.startAt.toLocaleDateString("he-IL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const timeLabel = first.startAt.toLocaleTimeString("he-IL", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const serviceName = String(first.data.serviceName || "").trim();
    const serviceType =
      first.data.serviceType != null && String(first.data.serviceType).trim() !== ""
        ? String(first.data.serviceType).trim()
        : null;
    const displayTitle = serviceName || serviceType || "התור הפעיל";
    const displaySubtitle = serviceName && serviceType && serviceName !== serviceType ? serviceType : null;
    const workerName =
      first.data.workerName != null && String(first.data.workerName).trim() !== ""
        ? String(first.data.workerName).trim()
        : null;
    const workerId =
      first.data.workerId != null && String(first.data.workerId).trim() !== ""
        ? String(first.data.workerId).trim()
        : null;
    const siteServiceId =
      first.data.serviceId != null && String(first.data.serviceId).trim() !== ""
        ? String(first.data.serviceId).trim()
        : null;

    return NextResponse.json({
      ok: true,
      active: {
        cancelAnchorBookingId: related.rootId,
        dateISO,
        timeHHmm,
        dateLabel,
        timeLabel,
        displayTitle,
        displaySubtitle,
        workerId,
        workerName,
        siteServiceId,
        orderedPricingItemIds,
        siteServiceIds,
        isMultiBooking,
        multiBookingComboId,
      },
    });
  } catch (e) {
    console.error("[active-for-phone]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
