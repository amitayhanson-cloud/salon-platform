import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { runOnboardingComplete } from "@/lib/onboardingCompleteServer";
import { isPaidOnboardingEnforced } from "@/lib/builderPaymentConfig";
import type { SiteConfig } from "@/types/siteConfig";
import type { SiteService } from "@/types/siteConfig";
import type { BookingSettings } from "@/types/bookingSettings";

type Body = {
  slug: string;
  config: SiteConfig;
  services: Array<{ id: string; name: string; enabled?: boolean; sortOrder?: number }>;
  bookingSettings?: BookingSettings;
};

/**
 * POST /api/onboarding/complete
 * Creates site + tenant + user update. When Stripe checkout is configured for onboarding,
 * this route is disabled unless ALLOW_ONBOARDING_WITHOUT_PAYMENT=true (local dev).
 */
export async function POST(request: NextRequest) {
  try {
    if (isPaidOnboardingEnforced()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "יש להשלים תשלום דרך תהליך ההרשמה. חזרו לשלב התשלום או התחילו מחדש.",
          code: "PAYMENT_REQUIRED",
        },
        { status: 402 }
      );
    }

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

    const body = (await request.json().catch(() => ({}))) as Partial<Body>;
    const rawSlug = typeof body.slug === "string" ? body.slug : "";
    const config = body.config as SiteConfig | undefined;

    const services: SiteService[] = Array.isArray(body.services)
      ? body.services.map((s, i) => ({
          id: typeof s.id === "string" ? s.id : `svc_${Date.now()}_${i}`,
          name: typeof s.name === "string" ? s.name : "",
          enabled: s.enabled !== false,
          sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : i,
        }))
      : [];

    const result = await runOnboardingComplete({
      uid,
      slug: rawSlug,
      config: config ?? ({} as SiteConfig),
      services,
      bookingSettings: body.bookingSettings,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      siteId: result.siteId,
      slug: result.slug,
      publicUrl: result.publicUrl,
    });
  } catch (err) {
    console.error("[onboarding/complete]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
