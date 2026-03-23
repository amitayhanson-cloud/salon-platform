/**
 * POST /api/sites/[siteId]/whatsapp/broadcast/send
 * Sends one WhatsApp per recipient via Twilio (bypasses automation kill-switch).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/server/requireAuth";
import { assertSiteOwner } from "@/lib/server/assertSiteOwner";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { sendWhatsApp } from "@/lib/whatsapp";
import { listBroadcastRecipients } from "@/lib/whatsapp/broadcastRecipients";
import { MAX_BROADCAST_CUSTOM_TEXT_LEN, MAX_BROADCAST_RECIPIENTS } from "@/lib/whatsapp/broadcastConstants";
import { parseBroadcastFiltersFromBody } from "@/lib/whatsapp/parseBroadcastBody";
import { renderWhatsAppTemplate } from "@/lib/whatsapp/templateRender";
import { getPublicLandingPageAbsoluteUrlForSite } from "@/lib/url";
import { getSiteWhatsAppSettings } from "@/lib/whatsapp/siteWhatsAppSettings";

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
  const landingUrl = getPublicLandingPageAbsoluteUrlForSite(id, tenantSlug);
  const waSettings = await getSiteWhatsAppSettings(id);
  const broadcastTemplate = waSettings.broadcastTemplate;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const r of recipients) {
    const bodyRendered = renderWhatsAppTemplate(broadcastTemplate, {
      שם_לקוח: r.name,
      שם_העסק: salonName,
      קישור_לתיאום: landingUrl,
      client_name: r.name,
      business_name: salonName,
      link: landingUrl,
      custom_text: customSegment,
    });
    if (bodyRendered.length > MAX_MESSAGE_LEN) {
      return NextResponse.json(
        { ok: false, error: `ההודעה המלאה ארוכה מדי אחרי מילוי השמות והקישור (מקסימום ${MAX_MESSAGE_LEN} תווים). קצרו את הטקסט המותאם.` },
        { status: 400 }
      );
    }
    try {
      await sendWhatsApp({
        toE164: r.e164,
        body: bodyRendered,
        siteId: id,
        bypassAutomationKillSwitch: true,
        meta: { automation: "owner_broadcast" },
      });
      sent += 1;
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
