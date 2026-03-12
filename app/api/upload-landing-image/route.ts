/**
 * POST /api/upload-landing-image
 * Platform landing page image uploads (admin only) → Cloudinary, then persist URL to Firestore.
 * Body: multipart/form-data with "file" and "section" (hero | features-calendar | features-clients | features-whatsapp | features-website).
 * Max 5MB, jpg/png/webp only.
 */
import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { getLandingContentServer, saveLandingContentServer } from "@/lib/firestoreLandingServer";

const CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ALLOWED_SECTIONS = ["hero", "features-calendar", "features-clients", "features-whatsapp", "features-website"] as const;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const email = (decoded.email as string) || "";
    if (!isPlatformAdmin(email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const sectionRaw = formData.get("section");

    if (!file || typeof file !== "object" || !(file instanceof Blob)) {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
    }
    if (typeof sectionRaw !== "string" || !ALLOWED_SECTIONS.includes(sectionRaw as any)) {
      return NextResponse.json({ error: "invalid section" }, { status: 400 });
    }
    const section = sectionRaw as (typeof ALLOWED_SECTIONS)[number];

    const type = (file as File).type || "";
    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json(
        { error: "סוג קובץ לא נתמך. השתמש ב-PNG, JPG או WEBP." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "גודל הקובץ חורג מ-5MB." },
        { status: 400 }
      );
    }

    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
    if (!apiKey || !apiSecret || !cloudName) {
      return NextResponse.json(
        { error: "Cloudinary not configured" },
        { status: 500 }
      );
    }

    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 10);
    const publicId = `landing_${section}_${ts}_${rand}`;
    const folder = `caleno/landing/${section}`;

    const uploadForm = new FormData();
    uploadForm.append("file", file);
    uploadForm.append("folder", folder);
    uploadForm.append("public_id", publicId);

    const uploadUrl = `${CLOUDINARY_UPLOAD_URL}/${cloudName}/image/upload`;
    const basicAuth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Basic ${basicAuth}` },
      body: uploadForm,
    });

    const data = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok || data.error) {
      console.error("[upload-landing-image] Cloudinary error:", data.error || uploadRes.statusText);
      return NextResponse.json(
        { error: data.error?.message || "Upload failed" },
        { status: uploadRes.status >= 400 ? uploadRes.status : 500 }
      );
    }

    const url = data.secure_url;
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Invalid response from Cloudinary" }, { status: 500 });
    }

    // Persist URL to Firestore (server-side) so the public landing page always has the latest image
    try {
      const content = await getLandingContentServer();
      if (section === "hero") {
        await saveLandingContentServer({ hero: { ...content.hero, imageUrl: url } });
      } else if (section === "features-calendar") {
        await saveLandingContentServer({
          features: { ...(content.features ?? {}), calendarImageUrl: url },
        });
      } else if (section === "features-clients") {
        await saveLandingContentServer({
          features: { ...(content.features ?? {}), clientsImageUrl: url },
        });
      } else if (section === "features-whatsapp") {
        await saveLandingContentServer({
          features: { ...(content.features ?? {}), whatsappImageUrl: url },
        });
      } else if (section === "features-website") {
        await saveLandingContentServer({
          features: { ...(content.features ?? {}), websitePreviewImageUrl: url },
        });
      }
    } catch (err) {
      console.error("[upload-landing-image] Failed to save URL to Firestore:", err);
      return NextResponse.json(
        { error: "Image uploaded but failed to save to config" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url });
  } catch (e) {
    console.error("[upload-landing-image]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
