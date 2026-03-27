/**
 * Twilio WhatsApp send helper. One sender number for the platform.
 * Logs every outbound message to Firestore whatsapp_messages.
 * Server-only: uses Firebase Admin and Twilio env vars.
 * Respects global kill-switch: platformSettings/global.whatsappAutomationsEnabled.
 */

import twilio from "twilio";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWhatsAppAutomationEnabled } from "@/lib/platformSettings";
import { inferAuditTypeFromSend, writeWhatsAppAuditLog, type WhatsAppAuditLogType } from "./auditLog";
import { toWhatsAppTo } from "./e164";
import { mapBodyForSandbox } from "./sandboxMap";
import {
  assertSiteWithinWhatsAppLimit,
  incrementWhatsAppUsage,
  resolveOutboundUsageCategory,
  type WhatsAppUsageCategory,
} from "./usage";

/** Read env at send time so tests and runtime can set TWILIO_* after module load. */
function getTwilioEnv(): {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
  fromForLogs: string;
} {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || "";
  const fromRaw =
    process.env.TWILIO_WHATSAPP_FROM?.trim() || process.env.TWILIO_WHATSAPP_NUMBER?.trim() || "";
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required");
  }
  if (!messagingServiceSid) {
    throw new Error("TWILIO_MESSAGING_SERVICE_SID is required");
  }
  const fromForLogs = fromRaw
    ? fromRaw.startsWith("whatsapp:")
      ? fromRaw
      : `whatsapp:${fromRaw}`
    : `messagingService:${messagingServiceSid}`;
  return { accountSid, authToken, messagingServiceSid, fromForLogs };
}

type WhatsAppTemplateName = "booking_confirmed" | "appointment_reminder_v1" | "broadcast_message_v1";

function resolveTemplateContentSid(templateName: WhatsAppTemplateName): string {
  switch (templateName) {
    case "booking_confirmed":
      return process.env.TWILIO_TEMPLATE_BOOKING_CONFIRMED_CONTENT_SID?.trim() || "";
    case "appointment_reminder_v1":
      return process.env.TWILIO_TEMPLATE_APPOINTMENT_REMINDER_V1_CONTENT_SID?.trim() || "";
    case "broadcast_message_v1":
      return process.env.TWILIO_TEMPLATE_BROADCAST_MESSAGE_V1_CONTENT_SID?.trim() || "";
    default:
      return "";
  }
}

export type SendWhatsAppParams = {
  toE164: string;
  body: string;
  template?: {
    name: WhatsAppTemplateName;
    /** Optional explicit override; otherwise resolved from env by template name. */
    contentSid?: string;
    language?: "he";
    /**
     * Twilio content variables.
     * Supports flat numeric keys (`"1"`, `"2"`, ...) and component-scoped objects
     * such as button variables (`button_1: { "1": "campaignId" }`).
     */
    variables: Record<string, string | Record<string, string>>;
  };
  /** Site/salon id (sites/{siteId}/...) */
  siteId?: string | null;
  /** Booking doc id */
  bookingId?: string | null;
  /** Full path for logging, e.g. sites/{siteId}/bookings/{bookingId} */
  bookingRef?: string | null;
  /** @deprecated Use siteId */
  salonId?: string | null;
  /** Optional metadata stored in whatsapp_messages (e.g. reminder_sent_immediately_due_to_last_minute_booking) */
  meta?: Record<string, unknown> | null;
  /**
   * Manual broadcast / owner-initiated sends: bypass platform automation kill-switch.
   * Automated flows (confirmation, reminders) must leave this false/undefined.
   */
  bypassAutomationKillSwitch?: boolean;
  /**
   * How to count toward monthly usage (utility vs service). Default `auto`: inbound from this
   * number in the last 24h → service, else utility.
   */
  usageCategory?: WhatsAppUsageCategory | "auto";
  /** Overrides type stored on whatsapp_logs (dashboard auditor). */
  auditType?: WhatsAppAuditLogType;
};

export const WHATSAPP_SKIPPED_USAGE_LIMIT_SID = "skipped-usage-limit";

/** Synthetic SID when global platform WhatsApp automations are disabled (no Twilio send). */
export const WHATSAPP_SKIPPED_GLOBAL_AUTOMATIONS_SID = "skipped-global-disabled";

/** True when Twilio accepted an outbound message (not skipped by limit or global kill-switch). */
export function isWhatsAppOutboundDelivered(sid: string): boolean {
  return (
    Boolean(sid) &&
    sid !== WHATSAPP_SKIPPED_USAGE_LIMIT_SID &&
    sid !== WHATSAPP_SKIPPED_GLOBAL_AUTOMATIONS_SID
  );
}

/**
 * Send WhatsApp message via Twilio and log to Firestore whatsapp_messages.
 * Returns Twilio message SID. If global WhatsApp automations are disabled, skips send and returns synthetic sid.
 */
export async function sendWhatsApp(params: SendWhatsAppParams): Promise<{ sid: string }> {
  const {
    toE164,
    body,
    template,
    siteId: siteIdParam = null,
    bookingId = null,
    bookingRef = null,
    salonId: salonIdParam = null,
    meta = null,
    bypassAutomationKillSwitch = false,
    usageCategory = "auto",
    auditType: auditTypeParam,
  } = params;
  const siteId = siteIdParam ?? salonIdParam;
  const automationName =
    meta && typeof meta === "object" && "automation" in meta && typeof (meta as { automation: unknown }).automation === "string"
      ? (meta as { automation: string }).automation
      : "outbound";
  const sandboxMode = (process.env.TWILIO_WHATSAPP_SANDBOX_MODE ?? "").toLowerCase() === "true";
  const outgoingBody = sandboxMode ? mapBodyForSandbox({ body, automation: automationName }) : body;

  const enabled = bypassAutomationKillSwitch || (await isWhatsAppAutomationEnabled());
  if (!enabled) {
    if (process.env.NODE_ENV !== "test") {
      console.log("[WhatsApp] skipped (global disabled)", {
        siteId: siteId ?? undefined,
        bookingId: bookingId ?? undefined,
        automation: automationName,
        toE164: toE164.slice(-4) ? `***${toE164.slice(-4)}` : "***",
        timestamp: new Date().toISOString(),
      });
    }
    return { sid: WHATSAPP_SKIPPED_GLOBAL_AUTOMATIONS_SID };
  }

  if (siteId) {
    const { allowed } = await assertSiteWithinWhatsAppLimit(siteId);
    if (!allowed) {
      console.warn("[WhatsApp] Limit Reached", {
        siteId,
        automation: automationName,
        toE164: toE164.slice(-4) ? `***${toE164.slice(-4)}` : "***",
        timestamp: new Date().toISOString(),
      });
      return { sid: WHATSAPP_SKIPPED_USAGE_LIMIT_SID };
    }
  }

  const { accountSid, authToken, messagingServiceSid, fromForLogs } = getTwilioEnv();
  const to = toWhatsAppTo(toE164);

  const client = twilio(accountSid, authToken);
  let sid: string;
  let status: "sent" | "failed" = "sent";
  let error: string | null = null;

  try {
    if (!template) {
      throw new Error(
        "Template content send is required: pass template { name/contentSid, variables } so Twilio uses contentSid/contentVariables."
      );
    }
    const contentSid = template.contentSid?.trim() || resolveTemplateContentSid(template.name);
    if (!contentSid) {
      throw new Error(
        `Missing content SID env for template '${template.name}'. Set TWILIO_TEMPLATE_*_CONTENT_SID env vars.`
      );
    }
    console.log("🚀 DEBUG: Sending WhatsApp with SID:", contentSid);
    const payload: {
      messagingServiceSid: string;
      to: string;
      contentSid: string;
      contentVariables: string;
      body?: string;
    } = {
      messagingServiceSid,
      to,
      contentSid,
      contentVariables: JSON.stringify(template.variables),
      body: outgoingBody,
    };
    // Strict enforcement: never send freeform body when Content API SID is present.
    if (contentSid) {
      delete payload.body;
    }
    const message = await client.messages.create(payload);
    sid = message.sid;
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
    sid = "";
    await logOutbound({
      toPhone: to,
      fromPhone: fromForLogs,
      body: outgoingBody,
      siteId,
      bookingId,
      bookingRef,
      twilioMessageSid: null,
      status,
      error,
      meta,
    });
    throw e;
  }

  await logOutbound({
    toPhone: to,
    fromPhone: fromForLogs,
    body: outgoingBody,
    siteId,
    bookingId,
    bookingRef,
    twilioMessageSid: sid,
    status,
    error: null,
    meta,
  });

  if (siteId) {
    try {
      const cat: WhatsAppUsageCategory =
        usageCategory === "auto" ? await resolveOutboundUsageCategory(toE164) : usageCategory;
      await incrementWhatsAppUsage(siteId, cat);
    } catch (e) {
      console.error("[WhatsApp] usage increment failed", {
        siteId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    if (isWhatsAppOutboundDelivered(sid)) {
      try {
        await writeWhatsAppAuditLog(siteId, {
          type: inferAuditTypeFromSend(auditTypeParam, meta),
          bookingId,
          bookingRef,
          twilioMessageSid: sid,
          channel: "api",
        });
      } catch (e) {
        console.error("[WhatsApp] whatsapp_logs audit write failed", {
          siteId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return { sid };
}

async function logOutbound(params: {
  toPhone: string;
  fromPhone: string;
  body: string;
  siteId: string | null;
  bookingId: string | null;
  bookingRef: string | null;
  twilioMessageSid: string | null;
  status: "sent" | "failed";
  error: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  const db = getAdminDb();
  const doc: Record<string, unknown> = {
    direction: "outbound",
    toPhone: params.toPhone,
    fromPhone: params.fromPhone,
    body: params.body,
    siteId: params.siteId ?? null,
    bookingId: params.bookingId ?? null,
    bookingRef: params.bookingRef ?? null,
    twilioMessageSid: params.twilioMessageSid ?? null,
    createdAt: Timestamp.now(),
    error: params.error ?? null,
  };
  if (params.meta && typeof params.meta === "object") {
    Object.assign(doc, params.meta);
  }
  if (params.meta && typeof params.meta === "object" && "templateName" in params.meta) {
    doc.templateName = (params.meta as { templateName?: string }).templateName ?? null;
  }
  await db.collection("whatsapp_messages").add(doc);
}

/**
 * Log an inbound message (called from webhook).
 */
export async function logInboundWhatsApp(params: {
  fromPhone: string;
  toPhone: string;
  body: string;
  twilioMessageSid: string;
}): Promise<void> {
  const db = getAdminDb();
  await db.collection("whatsapp_messages").add({
    direction: "inbound",
    toPhone: params.toPhone,
    fromPhone: params.fromPhone,
    body: params.body,
    bookingId: null,
    salonId: null,
    twilioMessageSid: params.twilioMessageSid,
    createdAt: Timestamp.now(),
    error: null,
  });
}

/**
 * Log ambiguous YES/NO when multiple bookings await confirmation for this phone.
 */
export async function logAmbiguousWhatsApp(params: {
  fromPhone: string;
  toPhone: string;
  body: string;
  twilioMessageSid: string;
  bookingRefs: string[];
}): Promise<void> {
  const db = getAdminDb();
  await db.collection("whatsapp_messages").add({
    direction: "inbound",
    status: "ambiguous",
    fromPhone: params.fromPhone,
    toPhone: params.toPhone,
    body: params.body,
    twilioMessageSid: params.twilioMessageSid,
    bookingRefs: params.bookingRefs,
    createdAt: Timestamp.now(),
  });
}
