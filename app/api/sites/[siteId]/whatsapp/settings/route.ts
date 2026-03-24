import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";
import { saveSiteWhatsAppSettings, getSiteWhatsAppSettings } from "@/lib/whatsapp/siteWhatsAppSettings";
import {
  clampAutomationCustomText,
  ensureClientCancelCustomSlot,
  ensureClientConfirmCustomSlot,
  ensureConfirmationCustomSlot,
  ensureReminderCustomSlot,
} from "@/lib/whatsapp/whatsappSettingsNormalize";
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
    confirmationTemplate: ensureConfirmationCustomSlot(
      typeof body.confirmationTemplate === "string" && body.confirmationTemplate.trim()
        ? String(body.confirmationTemplate).trim()
        : current.confirmationTemplate
    ),
    confirmationCustomText: clampAutomationCustomText(
      body.confirmationCustomText,
      current.confirmationCustomText
    ),
    reminderEnabled: typeof body.reminderEnabled === "boolean" ? body.reminderEnabled : current.reminderEnabled,
    reminderTemplate: ensureReminderCustomSlot(
      typeof body.reminderTemplate === "string" && body.reminderTemplate.trim()
        ? String(body.reminderTemplate).trim()
        : current.reminderTemplate
    ),
    reminderCustomText: clampAutomationCustomText(body.reminderCustomText, current.reminderCustomText),
    broadcastTemplate:
      typeof body.broadcastTemplate === "string" && body.broadcastTemplate.trim()
        ? String(body.broadcastTemplate).trim()
        : current.broadcastTemplate,
    reminderHoursBefore:
      body.reminderHoursBefore !== undefined ? clampHours(body.reminderHoursBefore) : current.reminderHoursBefore,
    clientConfirmReplyEnabled:
      typeof body.clientConfirmReplyEnabled === "boolean"
        ? body.clientConfirmReplyEnabled
        : current.clientConfirmReplyEnabled,
    clientConfirmReplyTemplate: ensureClientConfirmCustomSlot(
      typeof body.clientConfirmReplyTemplate === "string" && body.clientConfirmReplyTemplate.trim()
        ? String(body.clientConfirmReplyTemplate).trim()
        : current.clientConfirmReplyTemplate
    ),
    clientConfirmReplyCustomText: clampAutomationCustomText(
      body.clientConfirmReplyCustomText,
      current.clientConfirmReplyCustomText
    ),
    clientCancelReplyEnabled:
      typeof body.clientCancelReplyEnabled === "boolean"
        ? body.clientCancelReplyEnabled
        : current.clientCancelReplyEnabled,
    clientCancelReplyTemplate: ensureClientCancelCustomSlot(
      typeof body.clientCancelReplyTemplate === "string" && body.clientCancelReplyTemplate.trim()
        ? String(body.clientCancelReplyTemplate).trim()
        : current.clientCancelReplyTemplate
    ),
    clientCancelReplyCustomText: clampAutomationCustomText(
      body.clientCancelReplyCustomText,
      current.clientCancelReplyCustomText
    ),
    postBookingConfirmationMode:
      body.postBookingConfirmationMode === "whatsapp_opt_in" || body.postBookingConfirmationMode === "auto"
        ? body.postBookingConfirmationMode
        : current.postBookingConfirmationMode,
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

  if (next.clientConfirmReplyEnabled && !next.clientConfirmReplyTemplate.trim()) {
    return NextResponse.json(
      { ok: false, error: "תבנית תשובה לאחר אישור הלקוח לא יכולה להיות ריקה כשהאוטומציה פעילה" },
      { status: 400 }
    );
  }

  if (next.clientCancelReplyEnabled && !next.clientCancelReplyTemplate.trim()) {
    return NextResponse.json(
      { ok: false, error: "תבנית תשובה לאחר ביטול הלקוח לא יכולה להיות ריקה כשהאוטומציה פעילה" },
      { status: 400 }
    );
  }

  await saveSiteWhatsAppSettings(id, next);
  return NextResponse.json({ ok: true, settings: next });
}
