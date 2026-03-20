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

    const ownerUids = [
      ...new Set(
        sitesSnap.docs
          .map((d) => {
            const data = d.data() as { ownerUid?: string; ownerUserId?: string };
            return (data.ownerUid || data.ownerUserId || "").trim();
          })
          .filter(Boolean)
      ),
    ];

    const userByUid = new Map<
      string,
      { email?: string; phone?: string | null; onboardingSiteDisplayPhone?: string | null }
    >();
    const chunkSize = 30;
    for (let i = 0; i < ownerUids.length; i += chunkSize) {
      const chunk = ownerUids.slice(i, i + chunkSize);
      const snaps = await db.getAll(
        ...chunk.map((uid) => db.collection("users").doc(uid))
      );
      for (const snap of snaps) {
        if (!snap.exists) continue;
        const u = snap.data() as {
          email?: string;
          phone?: string | null;
          onboardingSiteDisplayPhone?: string | null;
        };
        userByUid.set(snap.id, {
          email: typeof u.email === "string" ? u.email : undefined,
          phone: typeof u.phone === "string" && u.phone.trim() ? u.phone.trim() : null,
          onboardingSiteDisplayPhone:
            typeof u.onboardingSiteDisplayPhone === "string" && u.onboardingSiteDisplayPhone.trim()
              ? u.onboardingSiteDisplayPhone.trim()
              : null,
        });
      }
    }

    const sites = sitesSnap.docs.map((doc) => {
      const data = doc.data() as {
        config?: { salonName?: string; city?: string };
        city?: string;
        createdAt?: { toDate?: () => Date } | string;
        ownerUid?: string;
        ownerUserId?: string;
      };
      const config = data.config ?? {};
      const rawCreated = data.createdAt;
      let createdAtStr: string | undefined;
      if (typeof rawCreated === "string") {
        createdAtStr = rawCreated;
      } else if (rawCreated && typeof (rawCreated as { toDate?: () => Date }).toDate === "function") {
        createdAtStr = (rawCreated as { toDate: () => Date }).toDate().toISOString();
      }

      const ownerUid = (data.ownerUid || data.ownerUserId || "").trim() || null;
      const owner = ownerUid ? userByUid.get(ownerUid) : undefined;
      const ownerPhone =
        owner?.phone ||
        owner?.onboardingSiteDisplayPhone ||
        undefined;

      return {
        siteId: doc.id,
        salonName: config.salonName ?? doc.id,
        city: config.city ?? data.city ?? undefined,
        createdAt: createdAtStr,
        ownerUid,
        ownerEmail: owner?.email,
        ownerPhone,
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
