/**
 * POST /api/sites/[siteId]/whatsapp/broadcast/send
 * Sends one WhatsApp per recipient via Twilio (bypasses automation kill-switch).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";
import { checkRateLimit } from "@/lib/server/rateLimit";
import {
  sendWhatsApp,
  isWhatsAppOutboundDelivered,
  WHATSAPP_SKIPPED_GLOBAL_AUTOMATIONS_SID,
  WHATSAPP_SKIPPED_USAGE_LIMIT_SID,
} from "@/lib/whatsapp";
import { listBroadcastRecipients } from "@/lib/whatsapp/broadcastRecipients";
import { MAX_BROADCAST_CUSTOM_TEXT_LEN, MAX_BROADCAST_RECIPIENTS } from "@/lib/whatsapp/broadcastConstants";
import { parseBroadcastFiltersFromBody } from "@/lib/whatsapp/parseBroadcastBody";
import { renderWhatsAppTemplate } from "@/lib/whatsapp/templateRender";
import { getPublicBookingPageAbsoluteUrlForSite, withTrackingSource } from "@/lib/url";
import { getSiteWhatsAppSettings } from "@/lib/whatsapp/siteWhatsAppSettings";
import { assertSiteWithinWhatsAppLimit } from "@/lib/whatsapp/usage";

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_SENDS_PER_SITE = 10;

const MAX_MESSAGE_LEN = 1600;

export async function POST(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const id = siteId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "חסר מזהה אתר" }, { status: 400 });

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const forbidden = await assertSiteOwner(auth.uid, id);
  if (forbidden) return forbidden;

  const body = await request.json().catch(() => ({}));
  const filters = parseBroadcastFiltersFromBody(body);
  if (filters instanceof NextResponse) return filters;

  const customSegment =
    typeof (body as { message?: string }).message === "string" ? (body as { message: string }).message.trim() : "";
  const campaignIdRaw =
    typeof (body as { campaignId?: string }).campaignId === "string"
      ? (body as { campaignId: string }).campaignId.trim()
      : "";
  const campaignId = campaignIdRaw || id;
  if (!customSegment) {
    return NextResponse.json({ ok: false, error: "כתבו את תוכן ההודעה המותאמת (החלק האמצעי)" }, { status: 400 });
  }
  if (customSegment.length > MAX_BROADCAST_CUSTOM_TEXT_LEN) {
    return NextResponse.json(
      {
        ok: false,
        error: `הטקסט המותאם ארוך מדי (מקסימום ${MAX_BROADCAST_CUSTOM_TEXT_LEN} תווים)`,
      },
      { status: 400 }
    );
  }

  const { allowed, retryAfterMs } = await checkRateLimit(
    `wa_broadcast:${id}`,
    RATE_MAX_SENDS_PER_SITE,
    RATE_WINDOW_MS
  );
  if (!allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "הגעתם למגבלת שליחות לשעה. נסו שוב מאוחר יותר.",
        retryAfterSeconds: Math.ceil((retryAfterMs ?? 0) / 1000),
      },
      { status: 429 }
    );
  }

  const { allowed: withinUsage } = await assertSiteWithinWhatsAppLimit(id);
  if (!withinUsage) {
    return NextResponse.json(
      {
        ok: false,
        error: "הגעתם למכסת הודעות WhatsApp החודשית. שדרגו את החבילה או נסו שוב בחודש הבא.",
      },
      { status: 403 }
    );
  }

  let recipients;
  try {
    recipients = await listBroadcastRecipients(id, filters);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "BROADCAST_FILTERS_EMPTY") {
      return NextResponse.json({ ok: false, error: "מסננים לא תקינים" }, { status: 400 });
    }
    console.error("[whatsapp/broadcast/send] list", msg);
    return NextResponse.json({ ok: false, error: "שגיאה בטעינת נמענים" }, { status: 500 });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ ok: false, error: "אין נמענים התואמים למסננים" }, { status: 400 });
  }

  if (recipients.length > MAX_BROADCAST_RECIPIENTS) {
    return NextResponse.json(
      {
        ok: false,
        error: `יותר מדי נמענים (${recipients.length}). מקסימום ${MAX_BROADCAST_RECIPIENTS} בהודעה קבוצתית.`,
      },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const siteSnap = await db.collection("sites").doc(id).get();
  const raw = siteSnap.data() as
    | {
        slug?: string;
        config?: { salonName?: string; whatsappBrandName?: string; slug?: string };
      }
    | undefined;
  const config = raw?.config;
  const salonName = config?.salonName ?? config?.whatsappBrandName ?? "העסק";
  const tenantSlug =
    (typeof raw?.slug === "string" && raw.slug.trim() ? raw.slug.trim() : null) ??
    (typeof config?.slug === "string" && config.slug.trim() ? config.slug.trim() : null);
  const trackedBookingUrl = withTrackingSource(
    getPublicBookingPageAbsoluteUrlForSite(id, tenantSlug),
    "whatsapp"
  );
  const waSettings = await getSiteWhatsAppSettings(id);
  const broadcastTemplate = waSettings.broadcastTemplate;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    const bodyRendered = renderWhatsAppTemplate(broadcastTemplate, {
      שם_לקוח: r.name,
      שם_העסק: salonName,
      קישור_לתיאום: trackedBookingUrl,
      client_name: r.name,
      business_name: salonName,
      link: trackedBookingUrl,
      custom_text: customSegment,
    });
    if (bodyRendered.length > MAX_MESSAGE_LEN) {
      return NextResponse.json(
        { ok: false, error: `ההודעה המלאה ארוכה מדי אחרי מילוי השמות והקישור (מקסימום ${MAX_MESSAGE_LEN} תווים). קצרו את הטקסט המותאם.` },
        { status: 400 }
      );
    }
    try {
      const { sid } = await sendWhatsApp({
        toE164: r.e164,
        body: bodyRendered,
        template: {
          name: "broadcast_message_v1",
          contentSid: process.env.TWILIO_TEMPLATE_BROADCAST_MESSAGE_V1_CONTENT_SID?.trim() || undefined,
          language: "he",
          variables: {
            "1": r.name,
            "2": salonName,
            "3": customSegment,
            // Dynamic button variable ({{1}} in button component): campaign/business ID.
            button_1: { "1": campaignId },
          },
        },
        siteId: id,
        bypassAutomationKillSwitch: true,
        meta: { automation: "owner_broadcast", templateName: "broadcast_message_v1" },
      });
      if (isWhatsAppOutboundDelivered(sid)) {
        sent += 1;
      } else {
        failed += 1;
        if (errors.length < 5) {
          if (sid === WHATSAPP_SKIPPED_USAGE_LIMIT_SID) {
            errors.push("מכסה חודשית — ההודעה לא נשלחה");
          } else if (sid === WHATSAPP_SKIPPED_GLOBAL_AUTOMATIONS_SID) {
            errors.push("אוטומציות WhatsApp כבויות בפלטפורמה");
          } else {
            errors.push("הודעה לא נשלחה");
          }
        }
        break;
      }
    } catch (err) {
      failed += 1;
      const m = err instanceof Error ? err.message : String(err);
      if (errors.length < 5) errors.push(m);
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    total: recipients.length,
    errors: errors.length ? errors : undefined,
  });
}
