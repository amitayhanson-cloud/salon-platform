import { NextResponse } from "next/server";
import {
  getBuilderCheckoutProvider,
  isPaidOnboardingEnforced,
  isPaddleBuilderCheckoutConfigured,
  isStripeBuilderCheckoutConfigured,
} from "@/lib/builderPaymentConfig";

/**
 * GET /api/onboarding/payment-config
 * Public: active provider (Paddle preferred over Stripe) and whether payment is required.
 */
export async function GET() {
  const provider = getBuilderCheckoutProvider();
  const paymentEnforced = isPaidOnboardingEnforced();
  return NextResponse.json({
    provider,
    paddleConfigured: isPaddleBuilderCheckoutConfigured(),
    stripeConfigured: isStripeBuilderCheckoutConfigured(),
    paymentEnforced,
    canCompleteWithoutPayment: !paymentEnforced,
  });
}
