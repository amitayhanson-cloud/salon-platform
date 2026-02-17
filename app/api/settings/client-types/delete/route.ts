/**
 * POST /api/settings/client-types/delete
 * Delete a client type and reassign all clients that had it to Regular.
 * Body: { siteId, typeId }
 * Guard: typeId must not be "regular".
 * Requires Firebase ID token. Site owner only.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { REGULAR_CLIENT_TYPE_ID, DEFAULT_CLIENT_TYPE_ENTRIES, SYSTEM_DEFAULT_CLIENT_TYPE_IDS } from "@/types/bookingSettings";
import type { ClientTypeEntry } from "@/types/bookingSettings";
import { sanitizeForFirestore } from "@/lib/sanitizeForFirestore";

const BATCH_SIZE = 500;

const LABEL_TO_ID: Record<string, string> = {
  "רגיל": REGULAR_CLIENT_TYPE_ID,
  "חדש": "new",
  "vip": "vip",
  "פעיל": "active",
  "לא פעיל": "inactive",
};

/** Normalize raw clientTypes from Firestore (string[] or ClientTypeEntry[]) to ClientTypeEntry[]. */
function normalizeToEntries(raw: unknown): ClientTypeEntry[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_CLIENT_TYPE_ENTRIES];
  }
  const first = raw[0];
  if (typeof first === "string") {
    return (raw as string[])
      .filter((s) => typeof s === "string" && s.trim())
      .map((label, i) => {
        const trimmed = label.trim();
        const lower = trimmed.toLowerCase();
        const mapped = LABEL_TO_ID[trimmed] ?? LABEL_TO_ID[lower];

        const slug = lower
          .replace(/\s+/g, "-")
          .replace(/[^\p{L}\p{N}-]/gu, "");

        const computed = mapped ?? slug;
        const id = computed && computed.length > 0 ? computed : "custom";

        const resolvedId = id === "regular" ? REGULAR_CLIENT_TYPE_ID : id;
        return {
          id: resolvedId,
          labelHe: trimmed,
          isSystem: resolvedId === REGULAR_CLIENT_TYPE_ID,
          sortOrder: i,
        };
      });
  }
  return (raw as ClientTypeEntry[])
    .filter((e) => e && typeof e.id === "string" && typeof e.labelHe === "string" && e.labelHe.trim())
    .map((e, i) => ({
      id: e.id.trim(),
      labelHe: e.labelHe.trim(),
      isSystem: e.id === REGULAR_CLIENT_TYPE_ID,
      sortOrder: typeof e.sortOrder === "number" ? e.sortOrder : i,
    }));
}

function requireSiteOwner(
  token: string | null,
  _siteId: string
): Promise<{ uid: string } | NextResponse> {
  if (!token) {
    return Promise.resolve(NextResponse.json({ ok: false, message: "unauthenticated" }, { status: 401 }));
  }
  return getAdminAuth()
    .verifyIdToken(token)
    .then((decoded) => ({ uid: decoded.uid }))
    .catch(() => NextResponse.json({ ok: false, message: "unauthenticated" }, { status: 401 }));
}

async function assertSiteOwner(uid: string, siteId: string): Promise<NextResponse | null> {
  const db = getAdminDb();
  const siteDoc = await db.collection("sites").doc(siteId).get();
  if (!siteDoc.exists) {
    return NextResponse.json({ ok: false, message: "site not found" }, { status: 404 });
  }
  const ownerUid = (siteDoc.data() as { ownerUid?: string })?.ownerUid;
  if (ownerUid !== uid) {
    return NextResponse.json({ ok: false, message: "forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    const authResult = await requireSiteOwner(token, "");
    if (authResult instanceof NextResponse) return authResult;
    const uid = authResult.uid;

    const body = await request.json().catch(() => ({}));
    const siteId = body?.siteId;
    const typeId = body?.typeId;

    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ ok: false, message: "missing siteId" }, { status: 400 });
    }
    if (!typeId || typeof typeId !== "string") {
      return NextResponse.json({ ok: false, message: "missing typeId" }, { status: 400 });
    }

    const trimmedTypeId = typeId.trim();
    if (SYSTEM_DEFAULT_CLIENT_TYPE_IDS.includes(trimmedTypeId as (typeof SYSTEM_DEFAULT_CLIENT_TYPE_IDS)[number])) {
      return NextResponse.json(
        { ok: false, message: "סוג לקוח ברירת מחדל לא ניתן למחיקה" },
        { status: 400 }
      );
    }

    const forbidden = await assertSiteOwner(uid, siteId);
    if (forbidden) return forbidden;

    const db = getAdminDb();

    // 1) Load and normalize clientTypes from sites/{siteId}/settings/clients only
    const clientSettingsRef = db.collection("sites").doc(siteId).collection("settings").doc("clients");
    const settingsSnap = await clientSettingsRef.get();
    const raw = settingsSnap.exists ? settingsSnap.data()?.clientTypes : null;
    const currentTypes = normalizeToEntries(raw);
    if (currentTypes.length === 0) {
      return NextResponse.json(
        { ok: false, message: "אין סוגי לקוחות להסרה." },
        { status: 400 }
      );
    }

    const nextTypes = currentTypes
      .filter((e) => e.id !== typeId)
      .map((e, i) => ({ ...e, sortOrder: i }));
    const hasRegular = nextTypes.some((e) => e.id === REGULAR_CLIENT_TYPE_ID);
    if (!hasRegular) {
      return NextResponse.json(
        { ok: false, message: "שגיאה בהגדרות: חסר סוג ברירת מחדל." },
        { status: 400 }
      );
    }

    // 2) Reassign all clients with clientTypeId === typeId to regular (batched), then update settings.
    // Order: client updates first so clients never point at a removed type; then remove type from list.
    const clientsRef = db.collection("sites").doc(siteId).collection("clients");
    let reassignedCount = 0;
    let lastDoc: DocumentSnapshot | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = clientsRef
        .where("clientTypeId", "==", typeId)
        .orderBy("__name__")
        .limit(BATCH_SIZE);
      if (lastDoc) q = q.startAfter(lastDoc);
      const snapshot = await q.get();
      if (snapshot.empty) break;

      const batch = db.batch();
      snapshot.docs.forEach((d) => {
        batch.update(d.ref, {
          clientTypeId: REGULAR_CLIENT_TYPE_ID,
          updatedAt: Timestamp.now(),
        });
        reassignedCount += 1;
      });
      await batch.commit();

      if (snapshot.docs.length < BATCH_SIZE) break;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    // 3) Save updated clientTypes to settings/clients only (sanitize to avoid undefined)
    const payload = { clientTypes: nextTypes };
    const sanitized = sanitizeForFirestore(payload) as { clientTypes: ClientTypeEntry[] };
    await clientSettingsRef.set(sanitized, { merge: true });

    if (reassignedCount > 0) {
      console.log(
        `[client-types/delete] siteId=${siteId} typeId=${typeId} reassigned ${reassignedCount} clients to regular`
      );
    }

    return NextResponse.json({ ok: true, reassignedCount });
  } catch (e) {
    console.error("[settings/client-types/delete]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
