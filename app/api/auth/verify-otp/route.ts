import { NextResponse } from "next/server";
import { normalizeE164, isValidE164 } from "@/lib/whatsapp/e164";
import { checkVerificationCode } from "@/lib/twilioVerify";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { createPhonePrimaryUserDocumentAdmin } from "@/lib/firestoreUsersAdmin";

type Intent = "signup" | "login";

/**
 * POST /api/auth/verify-otp
 * Body: { phoneNumber: string, code: string, intent?: "signup"|"login", fullName?: string }
 *
 * If approved:
 * - signup: create a user if missing, then sign in
 * - login: sign in only if user exists
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch((): Record<string, unknown> => ({}))) as {
      phoneNumber?: string;
      phone?: string;
      code?: string;
      intent?: unknown;
      fullName?: string;
    };

    const rawPhone =
      typeof body.phoneNumber === "string"
        ? body.phoneNumber
        : typeof body.phone === "string"
          ? body.phone
          : "";
    const codeRaw = typeof body.code === "string" ? body.code : "";
    const intent = body.intent === "login" ? "login" : body.intent === "signup" ? "signup" : "signup";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";

    const digits = codeRaw.replace(/\D/g, "");
    const e164 = normalizeE164(rawPhone, "IL");

    if (!isValidE164(e164) || !/^\d{6}$/.test(digits)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const checked = await checkVerificationCode(e164, codeRaw);
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

    // 1) Look up existing Firebase Auth user by phone.
    let userRecord: { uid: string } | null = null;
    try {
      userRecord = await auth.getUserByPhoneNumber(e164);
    } catch (e: unknown) {
      const codeErr = (e as { code?: string })?.code;
      if (intent === "login" && codeErr === "auth/user-not-found") {
        return NextResponse.json({ error: "phone_not_registered" }, { status: 404 });
      }
      if (intent === "signup" && codeErr === "auth/user-not-found") {
        userRecord = null;
      } else {
        console.error("[verify-otp] getUserByPhoneNumber", e);
        return NextResponse.json({ error: "auth_lookup_failed" }, { status: 500 });
      }
    }

    // 2) If missing and intent is signup → create user + Firestore doc.
    if (!userRecord) {
      if (intent !== "signup") {
        return NextResponse.json({ error: "phone_not_registered" }, { status: 404 });
      }
      if (fullName.length < 2 || fullName.length > 120) {
        return NextResponse.json({ error: "invalid_name" }, { status: 400 });
      }

      userRecord = await auth.createUser({
        phoneNumber: e164,
        displayName: fullName,
      });

      // Store platform user profile in Firestore (role OWNER).
      await createPhonePrimaryUserDocumentAdmin(userRecord.uid, fullName, e164);
    }

    // 3) Create custom token so the client can sign in.
    const customToken = await auth.createCustomToken(userRecord.uid);
    return NextResponse.json({ ok: true, customToken });
  } catch (e) {
    console.error("[verify-otp]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

