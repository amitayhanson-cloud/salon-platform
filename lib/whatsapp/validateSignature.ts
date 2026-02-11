/**
 * Validate X-Twilio-Signature using TWILIO_AUTH_TOKEN and the full request URL + raw body.
 * Twilio signs: full URL (e.g. https://your-host/api/webhooks/twilio/whatsapp) + raw POST body.
 */

import crypto from "crypto";

export function validateTwilioSignature(
  authToken: string,
  signature: string,
  fullUrl: string,
  rawBody: string
): boolean {
  if (!authToken || !signature) return false;
  const payload = fullUrl + rawBody;
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(payload)
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export type WebhookUrlSource = "TWILIO_WEBHOOK_URL" | "inferred";

/**
 * Build full webhook URL for Twilio signature validation.
 * When TWILIO_WEBHOOK_URL is set, use it exactly — do not use request.url or headers
 * (production behind proxies: Twilio signs the URL they call, which may differ from
 * Host/x-forwarded-*). Otherwise infer from request (WEBHOOK_BASE_URL or headers/url).
 */
export function getWebhookUrl(
  path: string,
  request: Request
): { url: string; source: WebhookUrlSource } {
  const explicit = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (explicit) {
    return { url: explicit.replace(/\/$/, ""), source: "TWILIO_WEBHOOK_URL" };
  }
  const base = process.env.WEBHOOK_BASE_URL?.trim();
  if (base) {
    return { url: `${base.replace(/\/$/, "")}${path}`, source: "inferred" };
  }
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (host) {
    return { url: `${proto}://${host}${path}`, source: "inferred" };
  }
  const url = new URL(request.url);
  return { url: url.origin + path, source: "inferred" };
}
