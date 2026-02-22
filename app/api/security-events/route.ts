/**
 * POST /api/security-events
 * Log security event (password change, etc.) - no secrets stored.
 * Auth required; operates on authenticated user only.
 */

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

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
    const type = body?.type as string | undefined;
    const tenantId = body?.tenantId as string | undefined;

    if (!type || typeof type !== "string") {
      return NextResponse.json({ error: "missing type" }, { status: 400 });
    }

    const allowedTypes = ["PASSWORD_CHANGED"];
    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ error: "invalid type" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("securityEvents").doc();
    const doc: Record<string, unknown> = {
      uid,
      type,
      createdAt: FieldValue.serverTimestamp(),
      userAgent: request.headers.get("user-agent") ?? undefined,
    };
    if (tenantId && typeof tenantId === "string") {
      doc.tenantId = tenantId;
    }

    await ref.set(doc);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[security-events]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
