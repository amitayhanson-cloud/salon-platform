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

/**
 * Build full webhook URL for Twilio signature validation.
 * Prefer TWILIO_WEBHOOK_URL (exact URL Twilio calls) for production behind proxies.
 * Else use x-forwarded-proto/host when present, fallback to request url.
 */
export function getWebhookUrl(path: string, request: Request): string {
  const explicit = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const base = process.env.WEBHOOK_BASE_URL?.trim();
  if (base) {
    return `${base.replace(/\/$/, "")}${path}`;
  }
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (host) {
    return `${proto}://${host}${path}`;
  }
  const url = new URL(request.url);
  return url.origin + path;
}
