import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import {
  isValidTenantSlug,
  normalizeTenantSlug,
} from "@/lib/tenant";

const TENANTS_COLLECTION = "tenants";

/**
 * POST /api/tenants/create
 * Create a tenant (subdomain) for the authenticated user.
 * Body: { slug: string }
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

    const body = await request.json().catch(() => ({}));
    const rawSlug = typeof body?.slug === "string" ? body.slug : "";
    if (!rawSlug.trim()) {
      return NextResponse.json(
        { success: false, error: "slug is required" },
        { status: 400 }
      );
    }

    if (!isValidTenantSlug(rawSlug)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid slug: 3–30 characters, lowercase letters, numbers, hyphens only, no leading/trailing hyphen.",
        },
        { status: 400 }
      );
    }

    const slug = normalizeTenantSlug(rawSlug);
    const db = getAdminDb();
    const docRef = db.collection(TENANTS_COLLECTION).doc(slug);
    const existing = await docRef.get();
    if (existing.exists) {
      return NextResponse.json(
        { success: false, error: "This subdomain is already taken." },
        { status: 409 }
      );
    }

    const now = new Date();
    await docRef.set({
      slug,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      slug,
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
