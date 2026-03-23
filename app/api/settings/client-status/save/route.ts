import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { calculateAutomatedClientStatus } from "@/lib/clientStatusEngine";
import type { ClientStatusRules, ManualClientTag } from "@/types/clientStatus";
import { DEFAULT_CLIENT_STATUS_RULES } from "@/types/clientStatus";

function normalizeRules(raw: Partial<ClientStatusRules> | undefined): ClientStatusRules {
  const src = raw ?? {};
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
  };
  return {
    newMaxTotalBookings: num(src.newMaxTotalBookings, DEFAULT_CLIENT_STATUS_RULES.newMaxTotalBookings),
    activeMinBookings: num(src.activeMinBookings, DEFAULT_CLIENT_STATUS_RULES.activeMinBookings),
    activeWindowDays: num(src.activeWindowDays, DEFAULT_CLIENT_STATUS_RULES.activeWindowDays),
    sleepingNoBookingsFor: num(src.sleepingNoBookingsFor, DEFAULT_CLIENT_STATUS_RULES.sleepingNoBookingsFor),
    sleepingWindowUnit: src.sleepingWindowUnit === "months" ? "months" : "days",
  };
}

function normalizeTags(raw: unknown): ManualClientTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object")
    .map((t, i) => {
      const idRaw = (t as { id?: unknown }).id;
      const labelRaw = (t as { label?: unknown }).label;
      const id = typeof idRaw === "string" ? idRaw.trim() : "";
      const label = typeof labelRaw === "string" ? labelRaw.trim() : "";
      return { id, label, sortOrder: i };
    })
    .filter((t) => t.id && t.label);
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ ok: false, message: "unauthenticated" }, { status: 401 });
    const decoded = await getAdminAuth().verifyIdToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ ok: false, message: "unauthenticated" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as {
      siteId?: string;
      settings?: { statusRules?: Partial<ClientStatusRules>; manualTags?: ManualClientTag[] };
    };
    const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
    if (!siteId) return NextResponse.json({ ok: false, message: "missing siteId" }, { status: 400 });

    const db = getAdminDb();
    const siteRef = db.collection("sites").doc(siteId);
    const siteDoc = await siteRef.get();
    if (!siteDoc.exists) return NextResponse.json({ ok: false, message: "site not found" }, { status: 404 });
    const ownerUid = (siteDoc.data() as { ownerUid?: string } | undefined)?.ownerUid;
    if (ownerUid !== decoded.uid) return NextResponse.json({ ok: false, message: "forbidden" }, { status: 403 });

    const statusRules = normalizeRules(body.settings?.statusRules);
    const manualTags = normalizeTags(body.settings?.manualTags);

    await siteRef.collection("settings").doc("clients").set(
      { statusRules, manualTags, updatedAt: Timestamp.now() },
      { merge: true }
    );

    const clientsSnap = await siteRef.collection("clients").get();
    let updatedClients = 0;
    for (const clientDoc of clientsSnap.docs) {
      const clientPhone = String((clientDoc.data() as { phone?: unknown }).phone ?? clientDoc.id).trim();
      if (!clientPhone) continue;
      const bookingsSnap = await siteRef
        .collection("bookings")
        .where("customerPhone", "==", clientPhone)
        .get();
      const bookings = bookingsSnap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          date: typeof data.date === "string" ? data.date : (typeof data.dateISO === "string" ? data.dateISO : ""),
          time: typeof data.time === "string" ? data.time : (typeof data.timeHHmm === "string" ? data.timeHHmm : ""),
          status: typeof data.status === "string" ? data.status : "",
        };
      });
      const currentStatus = calculateAutomatedClientStatus(bookings, statusRules);
      await clientDoc.ref.set(
        { currentStatus, currentStatusUpdatedAt: Timestamp.now() },
        { merge: true }
      );
      updatedClients += 1;
    }

    return NextResponse.json({ ok: true, updatedClients });
  } catch (e) {
    console.error("[settings/client-status/save]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
