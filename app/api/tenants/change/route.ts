import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { getUserDocument } from "@/lib/firestoreUsers";
import { getSlugBySiteId } from "@/lib/tenant-data";
import {
  validateTenantSlug,
  normalizeTenantSlug,
  getSitePublicUrl,
} from "@/lib/tenant";

const TENANTS_COLLECTION = "tenants";

/**
 * POST /api/tenants/change
 * Change (rename) the current user's tenant slug.
 * Body: { newSlug: string }
 * Auth: Bearer token.
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

    const userDoc = await getUserDocument(uid);
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

    const validation = validateTenantSlug(rawNewSlug);
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    const newSlug = normalizeTenantSlug(rawNewSlug);
    const siteId = userDoc.siteId;
    const oldSlug = await getSlugBySiteId(siteId);

    const db = getAdminDb();
    const newTenantRef = db.collection(TENANTS_COLLECTION).doc(newSlug);
    const newTenantSnap = await newTenantRef.get();
    if (newTenantSnap.exists) {
      return NextResponse.json(
        { success: false, error: "This subdomain is already taken." },
        { status: 409 }
      );
    }

    const now = new Date();

    if (oldSlug && oldSlug !== newSlug) {
      const oldTenantRef = db.collection(TENANTS_COLLECTION).doc(oldSlug);
      const siteRef = db.collection("sites").doc(siteId);
      const batch = db.batch();
      batch.set(newTenantRef, {
        siteId,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      });
      batch.delete(oldTenantRef);
      batch.update(siteRef, { slug: newSlug, updatedAt: now });
      await batch.commit();
    } else {
      const siteRef = db.collection("sites").doc(siteId);
      const batch = db.batch();
      batch.set(newTenantRef, {
        siteId,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      });
      batch.update(siteRef, { slug: newSlug, updatedAt: now });
      await batch.commit();
    }

    const publicUrl = getSitePublicUrl(newSlug);

    return NextResponse.json({
      success: true,
      slug: newSlug,
      publicUrl,
    });
  } catch (err) {
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
