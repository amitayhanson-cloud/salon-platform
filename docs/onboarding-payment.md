# Builder onboarding + payments (Paddle or Stripe)

After opening hours, **step 7** collects payment. The site and admin are created **only after** the provider confirms payment (unless `ALLOW_ONBOARDING_WITHOUT_PAYMENT=true`).

## Provider priority

1. **Paddle Billing** — if `PADDLE_API_KEY` and `PADDLE_PRICE_CALENO_BASIC` are set.  
   - Sandbox API: `https://sandbox-api.paddle.com`  
   - Production: set `PADDLE_ENVIRONMENT=production` → `https://api.paddle.com`  
   - Dashboard: [sandbox vendors](https://sandbox-vendors.paddle.com/) / [Paddle login](https://vendors.paddle.com/)

2. **Stripe** — used only if Paddle is **not** configured but Stripe env vars are.

## Paddle environment variables

| Variable | Purpose |
|----------|---------|
| `PADDLE_API_KEY` | Server API key (`pdl_sdbx_apikey_...` in sandbox). **Never commit; use `.env.local` only.** |
| `PADDLE_PRICE_CALENO_BASIC` | Catalog **Price** ID for the basic plan (`pri_...`) from Paddle → Catalog |
| `PADDLE_PRICE_CALENO_PLUS` | Optional second price for Caleno+; falls back to basic if omitted |
| `PADDLE_ENVIRONMENT` | Omit or `sandbox` for sandbox; `production` for live API + live keys |
| `NEXT_PUBLIC_APP_URL` | e.g. `https://caleno.co` — used as checkout return base (`/builder` + Paddle `?_ptxn=` ) |
| `ALLOW_ONBOARDING_WITHOUT_PAYMENT` | `true` = allow `POST /api/onboarding/complete` without payment (dev only) |

In Paddle **Checkout → Default payment link**, configure an approved URL (see [Paddle: default payment link](https://developer.paddle.com/build/transactions/default-payment-link)). If `checkout.url` is missing from the API response, this is usually the cause.

## Stripe (fallback)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PRICE_CALENO_BASIC` | Stripe Price ID |
| `STRIPE_PRICE_CALENO_PLUS` | Optional |

## Flow

1. `POST /api/onboarding/checkout-session` — writes `onboardingPending/{uid}`, returns checkout URL (Paddle or Stripe).
2. **Paddle:** user returns to `{APP_URL}/builder?_ptxn=txn_...`  
   **Stripe:** `{APP_URL}/builder?checkout=success&session_id=cs_...`
3. `POST /api/onboarding/complete-from-session` with `{ transactionId }` or `{ sessionId }` — verifies payment, creates site, deletes pending doc.

## Security

- Rotate any API key that was pasted into chat, logs, or tickets.
- Pending onboarding is server-only (`onboardingPending` is denied in Firestore rules for clients).

## Optional hardening

Add a **Paddle webhook** (`transaction.completed`) to finish onboarding if the user closes the tab before the client calls `complete-from-session`.
