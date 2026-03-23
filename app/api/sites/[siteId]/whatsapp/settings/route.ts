import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";
import { saveSiteWhatsAppSettings, getSiteWhatsAppSettings } from "@/lib/whatsapp/siteWhatsAppSettings";
import type { WhatsAppSettingsDoc } from "@/types/whatsappSettings";
import { reminderTemplateHasRequiredTime } from "@/lib/whatsapp/templateRender";
import { REMINDER_REQUIRED_PLACEHOLDER } from "@/types/whatsappSettings";

function clampHours(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 24;
  return Math.min(168, Math.max(1, Math.floor(x)));
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const id = siteId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "חסר מזהה אתר" }, { status: 400 });

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const forbidden = await assertSiteOwner(auth.uid, id);
  if (forbidden) return forbidden;

  const body = await request.json().catch(() => ({}));
  const current = await getSiteWhatsAppSettings(id);

  const next: WhatsAppSettingsDoc = {
    confirmationEnabled:
      typeof body.confirmationEnabled === "boolean" ? body.confirmationEnabled : current.confirmationEnabled,
    confirmationTemplate:
      typeof body.confirmationTemplate === "string" && body.confirmationTemplate.trim()
        ? String(body.confirmationTemplate).trim()
        : current.confirmationTemplate,
    reminderEnabled: typeof body.reminderEnabled === "boolean" ? body.reminderEnabled : current.reminderEnabled,
    reminderTemplate:
      typeof body.reminderTemplate === "string" && body.reminderTemplate.trim()
        ? String(body.reminderTemplate).trim()
        : current.reminderTemplate,
    broadcastTemplate:
      typeof body.broadcastTemplate === "string" && body.broadcastTemplate.trim()
        ? String(body.broadcastTemplate).trim()
        : current.broadcastTemplate,
    confirmationCustomText:
      typeof body.confirmationCustomText === "string"
        ? String(body.confirmationCustomText)
        : current.confirmationCustomText,
    reminderHoursBefore:
      body.reminderHoursBefore !== undefined ? clampHours(body.reminderHoursBefore) : current.reminderHoursBefore,
  };

  if (!reminderTemplateHasRequiredTime(next.reminderTemplate)) {
    return NextResponse.json(
      {
        ok: false,
        error: "בתבנית התזכורת חובה לכלול את התג " + REMINDER_REQUIRED_PLACEHOLDER,
      },
      { status: 400 }
    );
  }

  if (!next.confirmationTemplate.trim()) {
    return NextResponse.json({ ok: false, error: "תבנית אישור התור לא יכולה להיות ריקה" }, { status: 400 });
  }

  await saveSiteWhatsAppSettings(id, next);
  return NextResponse.json({ ok: true, settings: next });
}
