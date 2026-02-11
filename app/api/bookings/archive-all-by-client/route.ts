/**
 * POST /api/bookings/archive-all-by-client
 * Archive (soft-delete) all calendar bookings for a given client.
 * Uses client identifier: customerPhone (required) and optionally clientId for legacy.
 * Same permission as delete-archived-bookings: site owner only.
 * Batched writes to avoid timeouts for large clients.
 */

import { NextResponse } from "next/server";
import admin from "firebase-admin";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

const BATCH_SIZE = 500;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await request.json().catch(() => ({}));
    const siteId = body?.siteId as string | undefined;
    const customerPhone = body?.customerPhone as string | undefined;
    const clientId = body?.clientId as string | undefined;

    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }
    if (!customerPhone || typeof customerPhone !== "string") {
      return NextResponse.json({ error: "missing customerPhone" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteDoc = await db.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const bookingsRef = db.collection("sites").doc(siteId).collection("bookings");
    const docByPath = new Map<string, { ref: admin.firestore.DocumentReference; data: Record<string, unknown> }>();

    const collectByField = async (field: "customerPhone" | "clientId", value: string) => {
      const q = bookingsRef.where(field, "==", value).limit(5000);
      const snapshot = await q.get();
      for (const doc of snapshot.docs) {
        if (!docByPath.has(doc.ref.path)) {
          docByPath.set(doc.ref.path, { ref: doc.ref, data: doc.data() as Record<string, unknown> });
        }
      }
    };

    await collectByField("customerPhone", customerPhone);
    if (clientId && clientId.trim() !== "" && clientId !== customerPhone) {
      await collectByField("clientId", clientId.trim());
    }

    const entries = Array.from(docByPath.values());
    let archived = 0;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = entries.slice(i, i + BATCH_SIZE);
      for (const { ref, data: d } of chunk) {
        const dateStr = (d.date as string) ?? (d.dateISO as string) ?? "";
        const phone = (d.customerPhone as string) ?? (d.phone as string) ?? "";
        const minimal: Record<string, unknown> = {
          date: dateStr,
          serviceName: (d.serviceName as string) ?? "",
          serviceType: (d.serviceType as string) ?? null,
          workerId: (d.workerId as string) ?? null,
          workerName: (d.workerName as string) ?? null,
          customerPhone: phone,
          customerName: (d.customerName as string) ?? (d.name as string) ?? "",
          isArchived: true,
          archivedAt: admin.firestore.FieldValue.serverTimestamp(),
          archivedReason: "admin_bulk_client_delete",
        };
        batch.set(ref, minimal, { merge: false });
        archived++;
      }
      await batch.commit();
    }

    console.log("[archive-all-by-client]", { siteId, customerPhone, archived });
    return NextResponse.json({ archived });
  } catch (e) {
    console.error("[archive-all-by-client]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
