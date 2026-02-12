import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { validateSlug } from "@/lib/slug";
import { getSitePublicUrl } from "@/lib/tenant";
import type { SiteConfig } from "@/types/siteConfig";
import type { SiteService } from "@/types/siteConfig";

const TENANTS_COLLECTION = "tenants";
const SITES_COLLECTION = "sites";
const USERS_COLLECTION = "users";

type Body = {
  slug: string;
  config: SiteConfig;
  services: Array<{ id: string; name: string; enabled?: boolean; sortOrder?: number }>;
};

/**
 * POST /api/onboarding/complete
 * Creates site + tenant + user update in one batch (atomic).
 * Auth: Bearer token.
 * Body: { slug, config, services }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
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

    const body = (await request.json().catch(() => ({}))) as Partial<Body>;
    const rawSlug = typeof body.slug === "string" ? body.slug : "";
    const validation = validateSlug(rawSlug);
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }
    const slug = validation.normalized;

    const config = body.config as SiteConfig | undefined;
    if (!config || typeof config !== "object" || !config.salonName?.trim()) {
      return NextResponse.json(
        { success: false, error: "config with salonName is required" },
        { status: 400 }
      );
    }

    const services: SiteService[] = Array.isArray(body.services)
      ? body.services.map((s, i) => ({
          id: typeof s.id === "string" ? s.id : `svc_${Date.now()}_${i}`,
          name: typeof s.name === "string" ? s.name : "",
          enabled: s.enabled !== false,
          sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : i,
        }))
      : [];

    const db = getAdminDb();

    const tenantRef = db.collection(TENANTS_COLLECTION).doc(slug);
    const tenantSnap = await tenantRef.get();
    if (tenantSnap.exists) {
      return NextResponse.json(
        { success: false, error: "This subdomain is already taken." },
        { status: 409 }
      );
    }

    const siteRef = db.collection(SITES_COLLECTION).doc();
    const siteId = siteRef.id;
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const now = new Date();

    const configWithSlug: SiteConfig = { ...config, slug };

    const batch = db.batch();
    batch.set(siteRef, {
      ownerUid: uid,
      ownerUserId: uid,
      config: configWithSlug,
      slug,
      services,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(tenantRef, {
      siteId,
      ownerUid: uid,
      createdAt: now,
      updatedAt: now,
    });
    batch.update(userRef, {
      siteId,
      updatedAt: now,
    });
    await batch.commit();

    const publicUrl = getSitePublicUrl(slug);

    return NextResponse.json({
      success: true,
      siteId,
      slug,
      publicUrl,
    });
  } catch (err) {
    console.error("[onboarding/complete]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
