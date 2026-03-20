import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import {
  getBuilderCheckoutProvider,
  getStripePriceIdForPlan,
  getPaddlePriceIdForPlan,
  isStripeBuilderCheckoutConfigured,
  isPaddleBuilderCheckoutConfigured,
} from "@/lib/builderPaymentConfig";
import { paddleCreateCheckoutTransaction } from "@/lib/paddleBillingClient";
import { validateSlug } from "@/lib/slug";
import type { SiteConfig } from "@/types/siteConfig";
import type { BookingSettings } from "@/types/bookingSettings";
import { sanitizeForFirestore } from "@/lib/sanitizeForFirestore";

const PENDING_COLLECTION = "onboardingPending";

type Body = {
  slug: string;
  config: SiteConfig;
  services?: Array<{ id: string; name: string; enabled?: boolean; sortOrder?: number }>;
  bookingSettings?: BookingSettings;
  plan?: "essential" | "plus";
};

function getOrigin(request: NextRequest): string {
  const fromHeader = request.headers.get("origin")?.trim();
  if (fromHeader) return fromHeader.replace(/\/$/, "");
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  return "http://localhost:3000";
}

/**
 * POST /api/onboarding/checkout-session
 * Paddle (preferred) or Stripe: stores pending onboarding, returns checkout URL.
 */
export async function POST(request: NextRequest) {
  try {
    const provider = getBuilderCheckoutProvider();
    if (!provider) {
      return NextResponse.json(
        { success: false, error: "No payment provider configured for onboarding." },
        { status: 501 }
      );
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let uid: string;
    let email: string | undefined;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
      if (decoded.email) email = decoded.email;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 }
      );
    }

    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(uid).get();
    const userData = userSnap.data() as { siteId?: string } | undefined;
    if (userData?.siteId) {
      return NextResponse.json(
        { success: false, error: "Account already has a site." },
        { status: 409 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Partial<Body>;
    const rawSlug = typeof body.slug === "string" ? body.slug : "";
    const slugValidation = validateSlug(rawSlug);
    if (!slugValidation.ok) {
      return NextResponse.json(
        { success: false, error: slugValidation.error },
        { status: 400 }
      );
    }
    const slug = slugValidation.normalized;

    const tenantSnap = await db.collection("tenants").doc(slug).get();
    if (tenantSnap.exists) {
      return NextResponse.json(
        { success: false, error: "This subdomain is already taken." },
        { status: 409 }
      );
    }

    const config = body.config as SiteConfig | undefined;
    if (!config || typeof config !== "object" || !config.salonName?.trim()) {
      return NextResponse.json(
        { success: false, error: "config with salonName is required" },
        { status: 400 }
      );
    }

    const plan = body.plan === "plus" ? "plus" : "essential";
    const services = Array.isArray(body.services) ? body.services : [];
    const pendingPayload = sanitizeForFirestore({
      slug,
      config: { ...config, slug },
      services,
      bookingSettings: body.bookingSettings ?? null,
      plan,
      paymentProvider: provider,
      createdAt: FieldValue.serverTimestamp(),
    }) as Record<string, unknown>;

    await db.collection(PENDING_COLLECTION).doc(uid).set(pendingPayload, { merge: false });

    const origin = getOrigin(request);

    if (provider === "paddle") {
      if (!isPaddleBuilderCheckoutConfigured()) {
        return NextResponse.json(
          { success: false, error: "Paddle is not fully configured." },
          { status: 501 }
        );
      }
      const priceId = getPaddlePriceIdForPlan(plan);
      if (!priceId) {
        return NextResponse.json(
          { success: false, error: "Missing Paddle price ID (PADDLE_PRICE_CALENO_BASIC)." },
          { status: 500 }
        );
      }
      try {
        const { checkoutUrl } = await paddleCreateCheckoutTransaction({
          priceId,
          quantity: 1,
          customData: {
            firebase_uid: uid,
            slug,
            plan,
          },
          checkoutReturnBaseUrl: `${origin}/builder`,
        });
        return NextResponse.json({
          success: true,
          url: checkoutUrl,
          provider: "paddle" as const,
        });
      } catch (e) {
        console.error("[onboarding/checkout-session] Paddle", e);
        return NextResponse.json(
          {
            success: false,
            error: e instanceof Error ? e.message : "Paddle checkout failed",
          },
          { status: 502 }
        );
      }
    }

    // Stripe
    if (!isStripeBuilderCheckoutConfigured()) {
      return NextResponse.json(
        { success: false, error: "Stripe is not fully configured." },
        { status: 501 }
      );
    }
    const priceId = getStripePriceIdForPlan(plan);
    if (!priceId) {
      return NextResponse.json(
        { success: false, error: "Missing Stripe price configuration." },
        { status: 500 }
      );
    }

    const secret = process.env.STRIPE_SECRET_KEY!.trim();
    const stripe = new Stripe(secret);
    const successUrl = `${origin}/builder?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/builder?checkout=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: uid,
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        firebaseUid: uid,
        slug,
        plan,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { success: false, error: "Stripe did not return a checkout URL." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: session.url,
      provider: "stripe" as const,
    });
  } catch (err) {
    console.error("[onboarding/checkout-session]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
