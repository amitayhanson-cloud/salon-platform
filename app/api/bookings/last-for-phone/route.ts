/**
 * POST /api/bookings/last-for-phone
 * Body: { siteId: string, phone: string }
 * Returns the most recent non-cancelled booking that the customer already attended
 * (startAt in the past), so we suggest the last real visit, not a future booking.
 */
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

function phoneVariants(raw: string): string[] {
  const d = String(raw).replace(/\D/g, "");
  if (!d || d.length < 9) return [];
  const v = new Set<string>([d]);
  if (d.startsWith("0")) v.add("972" + d.slice(1));
  if (d.startsWith("972") && d.length > 3) v.add("0" + d.slice(3));
  return [...v];
}

function isCancelledStatus(status: string | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return (
    s === "cancelled" ||
    s === "canceled" ||
    s === "cancelled_by_salon" ||
    s === "no_show"
  );
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
      return NextResponse.json({ ok: true, booking: null });
    }

    const seen = new Set<string>();
    const rows: {
      startAt: Date;
      pricingItemId: string;
      serviceName: string;
      serviceType: string | null;
      workerId: string | null;
      workerName: string | null;
      siteServiceId: string | null;
    }[] = [];

    for (const pv of variants) {
      const [byPhone, byClient] = await Promise.all([
        db.collection("sites").doc(siteId).collection("bookings").where("customerPhone", "==", pv).limit(50).get(),
        db.collection("sites").doc(siteId).collection("bookings").where("clientId", "==", pv).limit(50).get(),
      ]);
      for (const d of [...byPhone.docs, ...byClient.docs]) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const data = d.data();
        if (isCancelledStatus(data.status as string | undefined)) continue;
        /** Skip phase-2 follow-up rows; legacy docs without phase are kept */
        const ph = data.phase;
        if (ph != null && Number(ph) === 2) continue;
        const st = data.startAt;
        let startAt: Date | null = null;
        if (st && typeof (st as { toDate?: () => Date }).toDate === "function") {
          startAt = (st as { toDate: () => Date }).toDate();
        }
        if (!startAt || Number.isNaN(startAt.getTime())) continue;
        /** Only use bookings that already happened (customer attended), not future ones */
        if (startAt.getTime() > Date.now()) continue;
        /** Public flow stores מחירון id in serviceTypeId; admin may use pricingItemId */
        const pricingItemId =
          String(data.serviceTypeId || data.pricingItemId || "").trim();
        const serviceName =
          String(data.serviceName || data.service || "").trim();
        const serviceType =
          data.serviceType != null && String(data.serviceType).trim() !== ""
            ? String(data.serviceType).trim()
            : null;
        if (!pricingItemId && !serviceName && !serviceType) continue;
        const wid = data.workerId != null ? String(data.workerId).trim() : "";
        const wname = data.workerName != null ? String(data.workerName).trim() : "";
        const siteSid = data.serviceId != null ? String(data.serviceId).trim() : "";
        rows.push({
          startAt,
          pricingItemId,
          serviceName: serviceName || (serviceType ? "" : "השירות האחרון"),
          serviceType,
          workerId: wid || null,
          workerName: wname || null,
          siteServiceId: siteSid || null,
        });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, booking: null });
    }

    rows.sort((a, b) => b.startAt.getTime() - a.startAt.getTime());
    const best = rows[0]!;
    const dateLabel = best.startAt.toLocaleDateString("he-IL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const st = best.serviceType;
    const sn = (best.serviceName || "").trim();
    /** Line 1 = שירות (serviceName), line 2 = סוג טיפול (serviceType) */
    const displayTitle = sn || st || "השירות האחרון";
    const displaySubtitle = sn && st && sn !== st ? st : null;

    return NextResponse.json({
      ok: true,
      booking: {
        pricingItemId: best.pricingItemId || "",
        serviceName: sn || displayTitle,
        serviceType: st,
        displayTitle,
        displaySubtitle,
        dateLabel,
        workerId: best.workerId,
        workerName: best.workerName,
        siteServiceId: best.siteServiceId,
      },
    });
  } catch (e) {
    console.error("[last-for-phone]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
