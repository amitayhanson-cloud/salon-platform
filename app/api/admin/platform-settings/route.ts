/**
 * GET /api/admin/platform-settings
 * PATCH /api/admin/platform-settings
 * Platform admin only: read/update global platform settings (e.g. WhatsApp automations kill-switch).
 */

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import { getPlatformSettings, updatePlatformSettings } from "@/lib/platformSettings";

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
      return NextResponse.json({ error: "forbidden", message: "אין הרשאה" }, { status: 403 });
    }

    const settings = await getPlatformSettings();
    return NextResponse.json({
      whatsappAutomationsEnabled: settings.whatsappAutomationsEnabled,
      updatedAt: settings.updatedAt?.toDate?.()?.toISOString?.() ?? null,
      updatedBy: settings.updatedBy ?? null,
    });
  } catch (e) {
    console.error("[admin/platform-settings] GET", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    const email = (decoded.email as string | undefined) ?? "";
    const uid = decoded.uid;

    if (!isPlatformAdmin(email)) {
      return NextResponse.json({ error: "forbidden", message: "אין הרשאה" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const whatsappAutomationsEnabled =
      typeof body.whatsappAutomationsEnabled === "boolean" ? body.whatsappAutomationsEnabled : undefined;

    if (whatsappAutomationsEnabled === undefined) {
      return NextResponse.json({ error: "whatsappAutomationsEnabled required (boolean)" }, { status: 400 });
    }

    await updatePlatformSettings({
      whatsappAutomationsEnabled,
      updatedBy: email || uid || null,
    });

    return NextResponse.json({ ok: true, whatsappAutomationsEnabled });
  } catch (e) {
    console.error("[admin/platform-settings] PATCH", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}
