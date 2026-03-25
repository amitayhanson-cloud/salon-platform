/**
 * POST /api/bookings/archive-all-by-client
 * Archive (soft-delete) all calendar bookings for a given client.
 * Uses client identifier: customerPhone (required) and optionally clientId for legacy.
 * Same permission as delete-archived-bookings: site owner only.
 * Batched writes to avoid timeouts for large clients.
 */

import { NextResponse } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getDeterministicArchiveDocId } from "@/lib/archiveReplaceAdmin";
import { staleArchivedServiceTypeDocIdsForReplace } from "@/lib/archiveReplace";
import { isFollowUpBooking } from "@/lib/normalizeBooking";

const BATCH_SIZE = 500;
const FIRESTORE_BATCH_LIMIT = 500;

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

    const siteDoc = await adminDb.collection("sites").doc(siteId).get();
    if (!siteDoc.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const bookingsRef = adminDb.collection("sites").doc(siteId).collection("bookings");
    const docByPath = new Map<string, { ref: DocumentReference; data: Record<string, unknown> }>();

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
    const col = adminDb.collection("sites").doc(siteId).collection("bookings");
    let archived = 0;
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const chunk = entries.slice(i, i + BATCH_SIZE);
      const archiveWrites: {
        clientKey: string;
        docId: string;
        minimal: Record<string, unknown>;
        serviceTypeKey: string | null;
      }[] = [];
      for (const { ref, data: d } of chunk) {
        if (isFollowUpBooking(d)) {
          if (process.env.NODE_ENV === "development") {
            console.log("[archive-all-by-client] Skipping archive for follow-up booking", ref.id);
          }
          continue;
        }
        const originalStatus =
          d.status != null && String(d.status).trim() !== ""
            ? String(d.status).trim()
            : (d.statusAtArchive != null && String(d.statusAtArchive).trim() !== "" ? String(d.statusAtArchive).trim() : null);
        console.log("[archive] bookingId", ref.id, "statusAtArchive", d.status ?? originalStatus);
        if (originalStatus == null) {
          console.warn("[archive-all-by-client] Archiving booking without status", ref.id);
        }
        const statusAtArchive = originalStatus ?? "booked";
        const clientIdVal = (d.clientId as string) != null && String(d.clientId).trim() !== "" ? String(d.clientId).trim() : null;
        const phone = ((d.customerPhone as string) ?? (d.phone as string) ?? "").trim() || "";
        const clientKey = clientIdVal || phone || "unknown";
        const serviceTypeId =
          (d.serviceTypeId as string) != null && String(d.serviceTypeId).trim() !== ""
            ? String(d.serviceTypeId).trim()
            : (d.serviceType as string) != null && String(d.serviceType).trim() !== ""
              ? String(d.serviceType).trim()
              : null;
        const dateStr = (d.date as string) ?? (d.dateISO as string) ?? "";
        const minimal: Record<string, unknown> = {
          date: dateStr,
          serviceName: (d.serviceName as string) ?? "",
          serviceType: (d.serviceType as string) ?? null,
          serviceTypeId: (d.serviceTypeId as string) ?? null,
          workerId: (d.workerId as string) ?? null,
          workerName: (d.workerName as string) ?? null,
          customerPhone: phone,
          customerName: (d.customerName as string) ?? (d.name as string) ?? "",
          clientId: clientIdVal || phone || null,
          isArchived: true,
          archivedAt: FieldValue.serverTimestamp(),
          archivedReason: "admin_bulk_client_delete",
          statusAtArchive,
        };
        const { docId } = getDeterministicArchiveDocId(clientIdVal, phone, serviceTypeId, ref.id);
        archiveWrites.push({ clientKey, docId, minimal, serviceTypeKey: serviceTypeId });
      }
      const deleteIds = chunk.map((e) => e.ref.id);
      const clientsRef = adminDb.collection("sites").doc(siteId).collection("clients");

      const archiveByClient = new Map<
        string,
        Array<{ id: string; data: () => Record<string, unknown> }>
      >();
      for (const ck of new Set(archiveWrites.map((w) => w.clientKey))) {
        const snap = await clientsRef.doc(ck).collection("archivedServiceTypes").get();
        archiveByClient.set(
          ck,
          snap.docs.map((d) => ({ id: d.id, data: () => d.data() as Record<string, unknown> }))
        );
      }
      const staleSeen = new Set<string>();
      const staleRefs: DocumentReference[] = [];
      for (const w of archiveWrites) {
        const docs = archiveByClient.get(w.clientKey) ?? [];
        for (const id of staleArchivedServiceTypeDocIdsForReplace(docs, w.docId, w.serviceTypeKey)) {
          const r = clientsRef.doc(w.clientKey).collection("archivedServiceTypes").doc(id);
          if (!staleSeen.has(r.path)) {
            staleSeen.add(r.path);
            staleRefs.push(r);
          }
        }
      }

      let batch = adminDb.batch();
      let opCount = 0;
      for (const ref of staleRefs) {
        if (opCount >= FIRESTORE_BATCH_LIMIT) {
          await batch.commit();
          batch = adminDb.batch();
          opCount = 0;
        }
        batch.delete(ref);
        opCount++;
      }
      for (const id of deleteIds) {
        if (opCount >= FIRESTORE_BATCH_LIMIT) {
          await batch.commit();
          batch = adminDb.batch();
          opCount = 0;
        }
        batch.delete(col.doc(id));
        opCount++;
      }
      for (const { clientKey, docId, minimal } of archiveWrites) {
        if (opCount >= FIRESTORE_BATCH_LIMIT) {
          await batch.commit();
          batch = adminDb.batch();
          opCount = 0;
        }
        const archiveRef = clientsRef.doc(clientKey).collection("archivedServiceTypes").doc(docId);
        batch.set(archiveRef, minimal, { merge: false });
        opCount++;
        archived++;
      }
      if (opCount > 0) await batch.commit();
      console.log("[archive-all-by-client] chunk", {
        siteId,
        customerPhone,
        deletedCount: deleteIds.length,
        writtenCount: archiveWrites.length,
      });
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
