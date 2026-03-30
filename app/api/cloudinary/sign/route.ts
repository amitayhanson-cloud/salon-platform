/**
 * POST /api/cloudinary/sign
 * Returns a signed payload for client-side Cloudinary upload (no upload preset).
 * Auth: Firebase ID token; caller must be site owner for siteId.
 * Body: { siteId }
 * Response: { timestamp, signature, apiKey, cloudName, folder, publicId }
 */

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

/** Cloudinary expects SHA1(sorted_params_string + api_secret), not HMAC-SHA1. */
function getCloudinarySignature(params: Record<string, string | number>, secret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(sorted + secret).digest("hex");
}

export async function POST(request: Request) {
  try {
    const rawSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    const rawKey = process.env.CLOUDINARY_API_KEY?.trim();
    const rawCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
    const missing: string[] = [];
    if (!rawSecret) missing.push("CLOUDINARY_API_SECRET");
    if (!rawKey) missing.push("CLOUDINARY_API_KEY");
    if (!rawCloudName) missing.push("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "Cloudinary not configured",
          missing,
          hint: "Add these to .env.local then restart the dev server (npm run dev).",
        },
        { status: 500 }
      );
    }
    if (typeof rawSecret !== "string" || typeof rawKey !== "string" || typeof rawCloudName !== "string") {
      return NextResponse.json(
        { error: "Cloudinary not configured", missing: ["CLOUDINARY_API_SECRET", "CLOUDINARY_API_KEY", "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"], hint: "Add these to .env.local then restart the dev server (npm run dev)." },
        { status: 500 }
      );
    }
    const apiSecret = rawSecret;
    const apiKey = rawKey;
    const cloudName = rawCloudName;

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const uid: string = decoded.uid;

    const body = await request.json().catch((): Record<string, unknown> => ({}));
    const siteIdRaw = body && typeof body === "object" && "siteId" in body ? (body as { siteId: unknown }).siteId : undefined;
    if (typeof siteIdRaw !== "string" || !siteIdRaw.trim()) {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }
    const siteId = siteIdRaw.trim();

    const db = getAdminDb();
    const siteSnap = await db.collection("sites").doc(siteId).get();
    if (!siteSnap.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const siteData = siteSnap.data();
    const ownerUid =
      siteData && typeof siteData === "object" && "ownerUid" in siteData
        ? (siteData as { ownerUid: unknown }).ownerUid
        : undefined;
    const ownerUserId =
      siteData && typeof siteData === "object" && "ownerUserId" in siteData
        ? (siteData as { ownerUserId: unknown }).ownerUserId
        : undefined;
    const isOwner =
      (typeof ownerUid === "string" && ownerUid === uid) ||
      (typeof ownerUserId === "string" && ownerUserId === uid);
    if (!isOwner) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const kind =
      body && typeof body === "object" && (body as { kind?: unknown }).kind === "product" ? "product" : "logo";
    const timestamp = Math.floor(Date.now() / 1000);
    let folder = `sites/${siteId}/branding`;
    let publicId = "logo";
    if (kind === "product") {
      folder = `sites/${siteId}/products`;
      const suffixRaw =
        body && typeof body === "object" && "publicIdSuffix" in body
          ? (body as { publicIdSuffix?: unknown }).publicIdSuffix
          : undefined;
      const safeSuffix =
        typeof suffixRaw === "string" && suffixRaw.trim()
          ? suffixRaw
              .trim()
              .replace(/[^a-zA-Z0-9_-]/g, "_")
              .slice(0, 80)
          : `img_${timestamp}_${Math.random().toString(36).slice(2, 10)}`;
      publicId = safeSuffix;
    }
    const paramsToSign: Record<string, string | number> = {
      folder,
      public_id: publicId,
      timestamp,
    };
    const signature = getCloudinarySignature(paramsToSign, apiSecret);

    return NextResponse.json({
      timestamp,
      signature,
      apiKey,
      cloudName,
      folder,
      publicId,
    });
  } catch (e) {
    console.error("[api/cloudinary/sign]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
