import { NextResponse } from "next/server";
import { normalizeE164, isValidE164 } from "@/lib/whatsapp/e164";
import { sendVerificationOtp } from "@/lib/twilioVerify";

/**
 * POST /api/auth/send-otp
 * Body: { phoneNumber: string } (also accepts legacy { phone?: string })
 * Sends Twilio Verify OTP (WhatsApp preferred, SMS fallback).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { phoneNumber?: string; phone?: string };
    const raw = typeof body.phoneNumber === "string" ? body.phoneNumber : typeof body.phone === "string" ? body.phone : "";
    const e164 = normalizeE164(raw, "IL");

    if (!isValidE164(e164)) {
      return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
    }

    const sent = await sendVerificationOtp(e164);
    if (!sent.ok) {
      if (sent.reason === "misconfigured") {
        return NextResponse.json({ error: "misconfigured" }, { status: 503 });
      }
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[send-otp]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

