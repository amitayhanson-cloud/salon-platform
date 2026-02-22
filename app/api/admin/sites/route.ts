/**
 * GET /api/admin/sites
 * Platform admin only: list all sites from Firestore.
 */

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { isPlatformAdmin } from "@/lib/platformAdmin";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const email = (decoded.email as string | undefined) ?? "";

    if (!isPlatformAdmin(email)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const db = getAdminDb();
    const sitesSnap = await db.collection("sites").get();

    const sites = sitesSnap.docs.map((doc) => {
      const data = doc.data() as {
        config?: { salonName?: string; city?: string };
        city?: string;
        createdAt?: { toDate?: () => Date } | string;
      };
      const config = data.config ?? {};
      const rawCreated = data.createdAt;
      let createdAtStr: string | undefined;
      if (typeof rawCreated === "string") {
        createdAtStr = rawCreated;
      } else if (rawCreated && typeof (rawCreated as { toDate?: () => Date }).toDate === "function") {
        createdAtStr = (rawCreated as { toDate: () => Date }).toDate().toISOString();
      }

      return {
        siteId: doc.id,
        salonName: config.salonName ?? doc.id,
        city: config.city ?? data.city ?? undefined,
        createdAt: createdAtStr,
      };
    });

    return NextResponse.json({ sites });
  } catch (e) {
    console.error("[admin/sites]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
