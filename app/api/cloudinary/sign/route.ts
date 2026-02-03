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
    const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
    const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
    const missing: string[] = [];
    if (!apiSecret) missing.push("CLOUDINARY_API_SECRET");
    if (!apiKey) missing.push("CLOUDINARY_API_KEY");
    if (!cloudName) missing.push("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME");
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
    if (!siteId || typeof siteId !== "string" || !siteId.trim()) {
      return NextResponse.json({ error: "missing siteId" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteSnap = await db.collection("sites").doc(siteId).get();
    if (!siteSnap.exists) {
      return NextResponse.json({ error: "site not found" }, { status: 404 });
    }
    const ownerUid = (siteSnap.data() as { ownerUid?: string })?.ownerUid;
    if (ownerUid !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `sites/${siteId}/branding`;
    const publicId = "logo";
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
