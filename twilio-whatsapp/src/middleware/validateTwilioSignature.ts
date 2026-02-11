/**
 * Validates X-Twilio-Signature on incoming webhook requests.
 * Uses TWILIO_AUTH_TOKEN and the request URL + body to verify the request is from Twilio.
 */

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

const authToken = process.env.TWILIO_AUTH_TOKEN;

function getSignatureValidationMiddleware(webhookPath: string) {
  return function validateTwilioSignature(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (!authToken) {
      res.status(500).send("Server misconfiguration: TWILIO_AUTH_TOKEN not set");
      return;
    }

    const signature = req.headers["x-twilio-signature"] as string | undefined;
    if (!signature) {
      res.status(403).send("Missing X-Twilio-Signature");
      return;
    }

    // Twilio signs the full URL (including protocol + host) and sorted body params
    const baseUrl = process.env.WEBHOOK_BASE_URL || "";
    const fullUrl = baseUrl
      ? `${baseUrl.replace(/\/$/, "")}${webhookPath}`
      : `${req.protocol}://${req.get("host")}${req.originalUrl}`;

    // Use raw body when available (set by webhook route middleware) for accurate signature validation
    const rawBody = (req as Request & { rawBody?: string }).rawBody;
    const payload = rawBody != null ? fullUrl + rawBody : fullUrl;

    const expected = crypto
      .createHmac("sha1", authToken)
      .update(payload)
      .digest("base64");

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      next();
    } else {
      res.status(403).send("Invalid signature");
    }
  };
}

/** Use for POST /webhooks/twilio/whatsapp */
export const validateTwilioWhatsAppSignature = getSignatureValidationMiddleware(
  "/webhooks/twilio/whatsapp"
);
