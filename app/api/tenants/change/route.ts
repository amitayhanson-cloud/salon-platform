import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { getServerUserDocument } from "@/lib/firestoreUsersServer";
import { getSlugBySiteId } from "@/lib/tenant-data";
import { validateSlug } from "@/lib/slug";
import { getSitePublicUrl } from "@/lib/tenant";

const TENANTS_COLLECTION = "tenants";
const SITES_COLLECTION = "sites";
const USERS_COLLECTION = "users";

/**
 * POST /api/tenants/change
 * Change (rename) the current user's tenant slug.
 * Body: { newSlug: string }
 * Auth: Bearer token.
 * Uses a Firestore transaction to avoid partial state.
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

    const userDoc = await getServerUserDocument(uid);
    if (!userDoc?.siteId) {
      return NextResponse.json(
        { success: false, error: "No site linked to your account." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawNewSlug = typeof (body as { newSlug?: string }).newSlug === "string"
      ? (body as { newSlug: string }).newSlug
      : "";
    if (!rawNewSlug.trim()) {
      return NextResponse.json(
        { success: false, error: "newSlug is required." },
        { status: 400 }
      );
    }

    const validation = validateSlug(rawNewSlug);
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const newSlug = validation.normalized;
    const siteId = userDoc.siteId;
    const oldSlug = await getSlugBySiteId(siteId);

    const db = getAdminDb();
    const newTenantRef = db.collection(TENANTS_COLLECTION).doc(newSlug);
    const siteRef = db.collection(SITES_COLLECTION).doc(siteId);
    const userRef = db.collection(USERS_COLLECTION).doc(uid);
    const now = new Date();

    await db.runTransaction(async (tx) => {
      const newTenantSnap = await tx.get(newTenantRef);
      if (newTenantSnap.exists) {
        throw new Error("TENANT_TAKEN");
      }

      const siteSnap = await tx.get(siteRef);
      if (!siteSnap.exists) {
        throw new Error("SITE_NOT_FOUND");
      }
      const siteData = siteSnap.data() as { ownerUid?: string; ownerUserId?: string };
      if (siteData.ownerUid !== uid && siteData.ownerUserId !== uid) {
        throw new Error("FORBIDDEN");
      }

      tx.set(newTenantRef, {
        siteId,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      });

      if (oldSlug && oldSlug !== newSlug) {
        const oldTenantRef = db.collection(TENANTS_COLLECTION).doc(oldSlug);
        tx.delete(oldTenantRef);
      }

      tx.update(siteRef, { slug: newSlug, updatedAt: now });
      tx.update(userRef, { primarySlug: newSlug, updatedAt: now });
    });

    const url = getSitePublicUrl(newSlug);

    return NextResponse.json({
      success: true,
      slug: newSlug,
      url,
      publicUrl: url,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "TENANT_TAKEN") {
      return NextResponse.json(
        { success: false, error: "This subdomain is already taken." },
        { status: 409 }
      );
    }
    if (msg === "SITE_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Site not found." },
        { status: 404 }
      );
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json(
        { success: false, error: "You can only change the subdomain of your own site." },
        { status: 403 }
      );
    }
    console.error("[tenants/change]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
