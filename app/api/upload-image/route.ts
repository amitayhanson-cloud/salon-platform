/**
 * POST /api/upload-image
 * Site editor image uploads (hero/about/gallery/services) → Cloudinary only.
 * - Requires Firebase ID token (Authorization: Bearer ...)
 * - Resolves siteId from form, asserts site ownership
 * - Accepts multipart/form-data: file, siteId, section (hero|about|gallery|service|review), optional galleryIndex, serviceId, reviewId
 * - Uploads to Cloudinary folder: caleno/sites/{siteId}/{section}/
 * - Returns { url: secure_url, publicId }
 */

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";

const CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid: string = decoded.uid;

    const formData = await request.formData();
    const file = formData.get("file");
    const siteIdRaw = formData.get("siteId");
    const sectionRaw = formData.get("section");

    if (!file || typeof file !== "object") {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
    }
    if (typeof siteIdRaw !== "string" || !siteIdRaw.trim()) {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }
    const siteId = siteIdRaw.trim();

    const allowedSections = ["hero", "about", "gallery", "service", "review"];
    if (typeof sectionRaw !== "string" || !allowedSections.includes(sectionRaw)) {
      return NextResponse.json({ error: "invalid section" }, { status: 400 });
    }
    const section = sectionRaw as "hero" | "about" | "gallery" | "service" | "review";

    const forbidden = await assertSiteOwner(uid, siteId);
    if (forbidden) return forbidden;

    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
    if (!apiKey || !apiSecret || !cloudName) {
      return NextResponse.json(
        { error: "Cloudinary not configured" },
        { status: 500 }
      );
    }

    const galleryIndex = formData.get("galleryIndex");
    const serviceIdRaw = formData.get("serviceId");
    const reviewIdRaw = formData.get("reviewId");
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 10);
    const publicId =
      section === "gallery" && galleryIndex != null
        ? `${section}_${galleryIndex}_${ts}_${rand}`
        : section === "service" && typeof serviceIdRaw === "string" && serviceIdRaw
          ? `service_${serviceIdRaw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32)}_${ts}_${rand}`
          : section === "review"
            ? `review_${(typeof reviewIdRaw === "string" && reviewIdRaw ? reviewIdRaw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) : "avatar")}_${ts}_${rand}`
            : `${section}_${ts}_${rand}`;

    const folder = `caleno/sites/${siteId}/${section}`;

    const uploadForm = new FormData();
    uploadForm.append("file", file);
    uploadForm.append("folder", folder);
    uploadForm.append("public_id", publicId);

    const uploadUrl = `${CLOUDINARY_UPLOAD_URL}/${cloudName}/image/upload`;
    const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
      },
      body: uploadForm,
    });

    const data = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok || data.error) {
      console.error("[upload-image] Cloudinary error:", data.error || uploadRes.statusText);
      return NextResponse.json(
        { error: data.error?.message || "Upload failed" },
        { status: uploadRes.status >= 400 ? uploadRes.status : 500 }
      );
    }

    const url = data.secure_url;
    const returnedPublicId = data.public_id;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Invalid response from Cloudinary" }, { status: 500 });
    }

    return NextResponse.json({
      url,
      publicId: typeof returnedPublicId === "string" ? returnedPublicId : publicId,
    });
  } catch (e) {
    console.error("[upload-image]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
