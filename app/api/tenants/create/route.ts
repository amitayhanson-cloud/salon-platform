import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { validateSlug } from "@/lib/slug";
import { getSitePublicUrl } from "@/lib/tenant";
import { getServerUserDocument } from "@/lib/firestoreUsersServer";

const TENANTS_COLLECTION = "tenants";

/**
 * POST /api/tenants/create
 * Create a tenant (subdomain) for the authenticated user's site.
 * Body: { slug: string, siteId?: string } — siteId optional; if omitted, uses the user's siteId.
 * Auth: Firebase ID token in Authorization: Bearer <token>
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    const userDoc = await getServerUserDocument(uid);
    const body = await request.json().catch(() => ({}));
    const rawSlug = typeof body?.slug === "string" ? body.slug : "";
    if (!rawSlug.trim()) {
      return NextResponse.json(
        { success: false, error: "slug is required" },
        { status: 400 }
      );
    }

    const validation = validateSlug(rawSlug);
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    let siteId: string | null =
      typeof body?.siteId === "string" && (body.siteId as string).trim()
        ? (body.siteId as string).trim()
        : userDoc?.siteId ?? null;
    if (!siteId) {
      return NextResponse.json(
        {
          success: false,
          error: "siteId is required. Create a site first or pass siteId in the request body.",
        },
        { status: 400 }
      );
    }
    if (userDoc?.siteId && userDoc.siteId !== siteId) {
      return NextResponse.json(
        { success: false, error: "You can only create a subdomain for your own site." },
        { status: 403 }
      );
    }

    const slug = validation.normalized;
    const db = getAdminDb();
    const tenantRef = db.collection(TENANTS_COLLECTION).doc(slug);
    const existing = await tenantRef.get();
    if (existing.exists) {
      return NextResponse.json(
        { success: false, error: "This subdomain is already taken." },
        { status: 409 }
      );
    }

    const now = new Date();
    const siteRef = db.collection("sites").doc(siteId);
    const batch = db.batch();
    batch.set(tenantRef, {
      siteId,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    });
    batch.update(siteRef, { slug, updatedAt: now });
    await batch.commit();

    const publicUrl = getSitePublicUrl(slug);

    return NextResponse.json({
      success: true,
      slug,
      siteId,
      publicUrl,
      message: `Tenant ${slug}.caleno.co created.`,
    });
  } catch (err) {
    console.error("[tenants/create]", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
