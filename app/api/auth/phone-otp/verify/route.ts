import { NextResponse } from "next/server";
import { normalizeE164, isValidE164 } from "@/lib/whatsapp/e164";
import { checkVerificationCode } from "@/lib/twilioVerify";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { createPhonePrimaryUserDocumentAdmin } from "@/lib/firestoreUsersAdmin";

type Intent = "signup" | "login";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      phone?: string;
      code?: string;
      intent?: Intent;
      fullName?: string;
    };

    const rawPhone = typeof body.phone === "string" ? body.phone : "";
    const code = typeof body.code === "string" ? body.code : "";
    const intent = body.intent === "login" ? "login" : body.intent === "signup" ? "signup" : null;

    const digits = code.replace(/\D/g, "");
    const e164 = normalizeE164(rawPhone, "IL");
    if (!isValidE164(e164) || !/^\d{6}$/.test(digits)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    if (!intent) {
      return NextResponse.json({ error: "invalid_intent" }, { status: 400 });
    }

    const checked = await checkVerificationCode(e164, code);
    if (!checked.ok) {
      if (checked.reason === "misconfigured") {
        return NextResponse.json({ error: "misconfigured" }, { status: 503 });
      }
      if (checked.reason === "invalid") {
        return NextResponse.json({ error: "code_invalid" }, { status: 400 });
      }
      return NextResponse.json({ error: "verify_failed" }, { status: 502 });
    }

    const auth = getAdminAuth();

    if (intent === "signup") {
      const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
      if (fullName.length < 2 || fullName.length > 120) {
        return NextResponse.json({ error: "invalid_name" }, { status: 400 });
      }

      try {
        await auth.getUserByPhoneNumber(e164);
        return NextResponse.json({ error: "phone_already_registered" }, { status: 409 });
      } catch (e: unknown) {
        const codeErr = (e as { code?: string })?.code;
        if (codeErr !== "auth/user-not-found") {
          console.error("[phone-otp/verify] getUserByPhoneNumber", e);
          return NextResponse.json({ error: "auth_lookup_failed" }, { status: 500 });
        }
      }

      let userRecord;
      try {
        userRecord = await auth.createUser({
          phoneNumber: e164,
          displayName: fullName,
        });
      } catch (e: unknown) {
        if ((e as { code?: string })?.code === "auth/phone-number-already-exists") {
          return NextResponse.json({ error: "phone_already_registered" }, { status: 409 });
        }
        throw e;
      }

      await createPhonePrimaryUserDocumentAdmin(userRecord.uid, fullName, e164);

      const customToken = await auth.createCustomToken(userRecord.uid);
      return NextResponse.json({ ok: true, customToken });
    }

    // login
    let userRecord;
    try {
      userRecord = await auth.getUserByPhoneNumber(e164);
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === "auth/user-not-found") {
        return NextResponse.json({ error: "phone_not_registered" }, { status: 404 });
      }
      console.error("[phone-otp/verify] login getUserByPhoneNumber", e);
      return NextResponse.json({ error: "auth_lookup_failed" }, { status: 500 });
    }

    const customToken = await auth.createCustomToken(userRecord.uid);
    return NextResponse.json({ ok: true, customToken });
  } catch (e) {
    console.error("[phone-otp/verify]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
