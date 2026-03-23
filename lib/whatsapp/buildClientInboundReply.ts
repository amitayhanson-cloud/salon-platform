/**
 * Server-only: inbound YES/NO (and menu) auto-replies using site WhatsApp templates.
 */

import { formatIsraelDateTime, formatIsraelTime } from "@/lib/datetime/formatIsraelTime";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getPublicBookingPageAbsoluteUrlForSite } from "@/lib/url";
import type { WhatsAppTemplateVariables } from "@/types/whatsappSettings";
import { fetchWazeUrlForSite } from "./fetchWazeUrlForSite";
import { getSiteWhatsAppSettings } from "./siteWhatsAppSettings";
import { buildClientCancelSystemFallbackText, buildClientConfirmSystemFallbackText } from "./inboundReplyFallbackText";
import { renderWhatsAppTemplate } from "./templateRender";

async function getSiteSlugForLink(siteId: string): Promise<string | null> {
  const snap = await getAdminDb().collection("sites").doc(siteId).get();
  const slug = snap.data()?.slug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : null;
}

function templateVarsForInbound(params: {
  startAt: Date;
  businessName: string;
  customerName?: string;
  link: string;
  wazeUrl: string;
}): WhatsAppTemplateVariables {
  const { dateStr, timeStr } = formatIsraelDateTime(params.startAt);
  const timeOnly = formatIsraelTime(params.startAt);
  return {
    time: timeOnly,
    date: dateStr,
    זמן_תור: timeStr,
    תאריך_תור: dateStr,
    business_name: params.businessName,
    שם_העסק: params.businessName,
    client_name: params.customerName ?? "",
    שם_לקוח: params.customerName ?? "",
    link: params.link,
    קישור_לתיאום: params.link,
    waze_link: params.wazeUrl,
  };
}

export async function buildClientConfirmReplyMessage(
  siteId: string,
  params: { startAt: Date; businessName: string; customerName?: string }
): Promise<string> {
  const settings = await getSiteWhatsAppSettings(siteId);
  const [wazeUrl, slug] = await Promise.all([fetchWazeUrlForSite(siteId), getSiteSlugForLink(siteId)]);
  const link = getPublicBookingPageAbsoluteUrlForSite(siteId, slug);
  const waze = wazeUrl ?? "";
  const timeOnly = formatIsraelTime(params.startAt);

  if (!settings.clientConfirmReplyEnabled) {
    return buildClientConfirmSystemFallbackText({
      time: timeOnly,
      businessName: params.businessName,
      wazeUrl: waze,
    });
  }

  const template = settings.clientConfirmReplyTemplate?.trim() || "";
  if (!template) {
    return buildClientConfirmSystemFallbackText({
      time: timeOnly,
      businessName: params.businessName,
      wazeUrl: waze,
    });
  }

  const vars = templateVarsForInbound({
    ...params,
    link,
    wazeUrl: waze,
  });
  return renderWhatsAppTemplate(template, vars);
}

export async function buildClientCancelReplyMessage(
  siteId: string,
  params: { businessName: string; startAt: Date; customerName?: string }
): Promise<string> {
  const settings = await getSiteWhatsAppSettings(siteId);
  const [wazeUrl, slug] = await Promise.all([fetchWazeUrlForSite(siteId), getSiteSlugForLink(siteId)]);
  const link = getPublicBookingPageAbsoluteUrlForSite(siteId, slug);
  const waze = wazeUrl ?? "";

  if (!settings.clientCancelReplyEnabled) {
    return buildClientCancelSystemFallbackText(params.businessName);
  }

  const template = settings.clientCancelReplyTemplate?.trim() || "";
  if (!template) {
    return buildClientCancelSystemFallbackText(params.businessName);
  }

  const vars = templateVarsForInbound({
    ...params,
    link,
    wazeUrl: waze,
  });
  return renderWhatsAppTemplate(template, vars);
}
