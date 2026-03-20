import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { runOnboardingComplete } from "@/lib/onboardingCompleteServer";
import {
  isPaddleBuilderCheckoutConfigured,
  isStripeBuilderCheckoutConfigured,
} from "@/lib/builderPaymentConfig";
import { paddleGetTransaction } from "@/lib/paddleBillingClient";
import type { SiteConfig } from "@/types/siteConfig";
import type { SiteService } from "@/types/siteConfig";
import type { BookingSettings } from "@/types/bookingSettings";

const PENDING_COLLECTION = "onboardingPending";

type PendingDoc = {
  slug?: string;
  config?: SiteConfig;
  services?: SiteService[];
  bookingSettings?: BookingSettings | null;
};

function readCustomUid(data: Record<string, unknown> | null | undefined): string | null {
  if (!data || typeof data !== "object") return null;
  const v = data.firebase_uid;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function finalizeFromPending(uid: string) {
  const db = getAdminDb();
  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.data() as { siteId?: string } | undefined;
  if (userData?.siteId) {
    return NextResponse.json({
      success: true,
      alreadyCompleted: true,
      siteId: userData.siteId,
    });
  }

  const pendingRef = db.collection(PENDING_COLLECTION).doc(uid);
  const pendingSnap = await pendingRef.get();
  if (!pendingSnap.exists) {
    return NextResponse.json(
      {
        success: false,
        error:
          "לא נמצאו נתוני הרשמה ממתינים. חזרו לשלב התשלום או פנו לתמיכה.",
      },
      { status: 404 }
    );
  }

  const pending = pendingSnap.data() as PendingDoc;
  const slug = typeof pending.slug === "string" ? pending.slug : "";
  const config = pending.config;
  if (!slug || !config?.salonName?.trim()) {
    await pendingRef.delete().catch(() => {});
    return NextResponse.json(
      { success: false, error: "נתוני הרשמה פגומים. התחילו שוב מהבונה." },
      { status: 400 }
    );
  }

  const services: SiteService[] = Array.isArray(pending.services)
    ? pending.services
    : [];

  const result = await runOnboardingComplete({
    uid,
    slug,
    config,
    services,
    bookingSettings: pending.bookingSettings ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    );
  }

  await pendingRef.delete().catch(() => {});

  return NextResponse.json({
    success: true,
    siteId: result.siteId,
    slug: result.slug,
    publicUrl: result.publicUrl,
  });
}

/**
 * POST /api/onboarding/complete-from-session
 * Stripe: body.sessionId (cs_...)
 * Paddle: body.transactionId (txn_...) after checkout; custom_data.firebase_uid must match user.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      transactionId?: string;
    };

    const transactionId =
      typeof body.transactionId === "string" ? body.transactionId.trim() : "";
    if (transactionId.startsWith("txn_")) {
      if (!isPaddleBuilderCheckoutConfigured()) {
        return NextResponse.json(
          { success: false, error: "Paddle is not configured." },
          { status: 501 }
        );
      }

      let txn;
      try {
        txn = await paddleGetTransaction(transactionId);
      } catch (e) {
        console.error("[complete-from-session] Paddle get transaction", e);
        return NextResponse.json(
          {
            success: false,
            error:
              e instanceof Error ? e.message : "לא ניתן לאמת את העסקה ב-Paddle",
          },
          { status: 502 }
        );
      }

      const customUid = readCustomUid(
        txn.custom_data as Record<string, unknown> | null | undefined
      );
      if (!customUid || customUid !== uid) {
        return NextResponse.json(
          { success: false, error: "העסקה אינה תואמת למשתמש המחובר." },
          { status: 403 }
        );
      }

      if (txn.status !== "completed" && txn.status !== "paid") {
        return NextResponse.json(
          {
            success: false,
            error: "התשלום טרם הושלם. נסו שוב בעוד רגע או פנו לתמיכה.",
            paddleStatus: txn.status,
          },
          { status: 402 }
        );
      }

      return finalizeFromPending(uid);
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (sessionId.startsWith("cs_")) {
      if (!isStripeBuilderCheckoutConfigured()) {
        return NextResponse.json(
          { success: false, error: "Stripe is not configured." },
          { status: 501 }
        );
      }

      const secret = process.env.STRIPE_SECRET_KEY!.trim();
      const stripe = new Stripe(secret);
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.client_reference_id !== uid) {
        return NextResponse.json(
          { success: false, error: "Session does not match signed-in user." },
          { status: 403 }
        );
      }

      const paid =
        session.payment_status === "paid" ||
        session.payment_status === "no_payment_required";
      if (!paid || session.status !== "complete") {
        return NextResponse.json(
          {
            success: false,
            error: "התשלום טרם אושר. נסו שוב או פנו לתמיכה.",
            paymentStatus: session.payment_status,
          },
          { status: 402 }
        );
      }

      return finalizeFromPending(uid);
    }

    return NextResponse.json(
      { success: false, error: "נדרש sessionId (Stripe) או transactionId (Paddle)." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[onboarding/complete-from-session]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
