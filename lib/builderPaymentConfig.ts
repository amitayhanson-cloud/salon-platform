/**
 * Builder checkout: Paddle Billing (preferred) or Stripe (fallback).
 * Server-only. Secrets via env — never commit API keys.
 */

export type BuilderCheckoutProvider = "paddle" | "stripe";

export function isStripeBuilderCheckoutConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_PRICE_CALENO_BASIC?.trim()
  );
}

export function getStripePriceIdForPlan(plan: "essential" | "plus"): string | null {
  const basic = process.env.STRIPE_PRICE_CALENO_BASIC?.trim();
  const plus = process.env.STRIPE_PRICE_CALENO_PLUS?.trim() || basic;
  if (!basic) return null;
  return plan === "plus" ? plus || basic : basic;
}

/** Sandbox: https://sandbox-api.paddle.com — production: https://api.paddle.com */
export function isPaddleBuilderCheckoutConfigured(): boolean {
  return Boolean(
    process.env.PADDLE_API_KEY?.trim() &&
      process.env.PADDLE_PRICE_CALENO_BASIC?.trim()
  );
}

export function getPaddlePriceIdForPlan(plan: "essential" | "plus"): string | null {
  const basic = process.env.PADDLE_PRICE_CALENO_BASIC?.trim();
  const plus = process.env.PADDLE_PRICE_CALENO_PLUS?.trim() || basic;
  if (!basic) return null;
  return plan === "plus" ? plus || basic : basic;
}

/** Paddle takes precedence when both are configured. */
export function getBuilderCheckoutProvider(): BuilderCheckoutProvider | null {
  if (isPaddleBuilderCheckoutConfigured()) return "paddle";
  if (isStripeBuilderCheckoutConfigured()) return "stripe";
  return null;
}

export function getPaddleApiBaseUrl(): string {
  return process.env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

/**
 * When true, `POST /api/onboarding/complete` returns 402 and users must pay via checkout +
 * `complete-from-session`. Opt-in only: set `REQUIRE_ONBOARDING_PAYMENT=true` and configure
 * Paddle or Stripe. Having payment keys in env alone does not block onboarding.
 *
 * Legacy escape hatch: `ALLOW_ONBOARDING_WITHOUT_PAYMENT=true` still forces enforcement off.
 */
export function isPaidOnboardingEnforced(): boolean {
  if (process.env.ALLOW_ONBOARDING_WITHOUT_PAYMENT === "true") {
    return false;
  }
  if (process.env.REQUIRE_ONBOARDING_PAYMENT !== "true") {
    return false;
  }
  return getBuilderCheckoutProvider() !== null;
}
