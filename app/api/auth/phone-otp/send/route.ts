import { NextResponse } from "next/server";
import { normalizeE164, isValidE164 } from "@/lib/whatsapp/e164";
import { sendVerificationSms } from "@/lib/twilioVerify";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { phone?: string };
    const raw = typeof body.phone === "string" ? body.phone : "";
    const e164 = normalizeE164(raw, "IL");
    if (!isValidE164(e164)) {
      return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
    }

    const sent = await sendVerificationSms(e164);
    if (!sent.ok) {
      if (sent.reason === "misconfigured") {
        return NextResponse.json({ error: "misconfigured" }, { status: 503 });
      }
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[phone-otp/send]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
