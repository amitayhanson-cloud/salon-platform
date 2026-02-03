/**
 * POST /api/admin/site-logo
 * Save or clear site logo URL in Firestore (branding.logoUrl).
 * Used after client uploads to Cloudinary; no file upload here.
 * Auth: Firebase ID token; caller must be site owner for siteId.
 * Body: { siteId, logoUrl: string | null, logoPublicId?: string | null }
 * Returns: { logoUrl } (or logoUrl: null when removing).
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import type { SiteConfig } from "@/types/siteConfig";

const MAX_URL_LENGTH = 2048;

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
    const siteId = body?.siteId;
    const logoUrl = body?.logoUrl;
    const logoPublicId = body?.logoPublicId;

    if (!siteId || typeof siteId !== "string" || !siteId.trim()) {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }

    if (logoUrl !== undefined && logoUrl !== null) {
      if (typeof logoUrl !== "string") {
        return NextResponse.json({ error: "logoUrl must be a string or null" }, { status: 400 });
      }
      if (logoUrl.length > MAX_URL_LENGTH) {
        return NextResponse.json({ error: "logoUrl too long" }, { status: 400 });
      }
    }

    const db = getAdminDb();
    const siteRef = db.collection("sites").doc(siteId);
    const siteSnap = await siteRef.get();
    if (!siteSnap.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteSnap.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const currentData = siteSnap.data() as { config?: SiteConfig } | undefined;
    const currentConfig = currentData?.config ?? ({} as SiteConfig);
    const nextBranding = {
      ...(currentConfig.branding ?? {}),
      logoUrl: logoUrl === undefined ? currentConfig.branding?.logoUrl : logoUrl,
      logoPublicId:
        logoPublicId === undefined ? currentConfig.branding?.logoPublicId : logoPublicId ?? null,
    };
    await siteRef.set(
      {
        config: {
          ...currentConfig,
          branding: nextBranding,
        },
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ logoUrl: nextBranding.logoUrl ?? null });
  } catch (e) {
    console.error("[api/admin/site-logo]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
