"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Check } from "lucide-react";
import type { SiteConfig } from "@/types/siteConfig";
import type { SalonBookingState } from "@/types/booking";
import { PRICING_TIERS } from "@/lib/landingContent";
import { convertSalonBookingStateToBookingSettings } from "@/lib/firestoreBookingSettings";
import { cn } from "@/lib/utils";
import { getSitePublicUrl } from "@/lib/tenant";
import { liquidGlassPrimaryBrandClass } from "@/components/auth/V0AuthShell";

type PlanId = "essential" | "plus";

export function BuilderCheckoutStep({
  salonName,
  slug,
  config,
  bookingState,
  paymentEnforced,
  checkoutProvider,
  paddleConfigured,
  stripeConfigured,
  paymentConfigLoading,
  firebaseUser,
  onDevComplete,
  isSaving,
  setIsSaving,
  saveError,
  setSaveError,
  checkoutMessage,
}: {
  salonName: string;
  slug: string;
  config: SiteConfig;
  bookingState: SalonBookingState;
  paymentEnforced: boolean;
  checkoutProvider: "paddle" | "stripe" | null;
  paddleConfigured: boolean;
  stripeConfigured: boolean;
  paymentConfigLoading: boolean;
  firebaseUser: User;
  onDevComplete: () => Promise<void>;
  isSaving: boolean;
  setIsSaving: (v: boolean) => void;
  saveError: string | null;
  setSaveError: (v: string | null) => void;
  checkoutMessage?: string | null;
}) {
  const [plan, setPlan] = useState<PlanId>("essential");

  const previewUrl = getSitePublicUrl(slug, "");

  const checkoutReady =
    checkoutProvider === "paddle"
      ? paddleConfigured
      : checkoutProvider === "stripe"
        ? stripeConfigured
        : false;

  const startCheckout = async () => {
    setSaveError(null);
    setIsSaving(true);
    try {
      const token = await firebaseUser.getIdToken();
      const bookingSettings = convertSalonBookingStateToBookingSettings(bookingState);
      const res = await fetch("/api/onboarding/checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slug,
          config: { ...config, slug, services: [] },
          services: [],
          bookingSettings,
          plan,
        }),
      });
      const data = (await res.json()) as { success?: boolean; url?: string; error?: string };
      if (!res.ok || !data.success || !data.url) {
        setSaveError(data.error || "לא ניתן לפתוח דף תשלום");
        setIsSaving(false);
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "שגיאה");
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      {checkoutMessage && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-900">
          {checkoutMessage}
        </div>
      )}

      <div className="rounded-2xl border border-white/60 bg-white/35 p-6 shadow-[0_16px_48px_-20px_rgba(7,18,25,0.12)] backdrop-blur-md sm:p-8">
        <h2 className="text-right font-sans text-xl font-bold text-[#071219] sm:text-2xl">
          סיכום והשקה
        </h2>
        <p className="mt-2 text-right font-sans text-sm leading-relaxed text-[#417374]">
          {paymentEnforced
            ? checkoutProvider === "paddle"
              ? "אחרי אישור התשלום ב-Paddle ניצור עבורכם את האתר, הקישור והפאנל — בלי תשלום מאושר לא נשמר כלום בשרת."
              : checkoutProvider === "stripe"
                ? "אחרי אישור התשלום ב-Stripe ניצור עבורכם את האתר, הקישור והפאנל — בלי תשלום מאושר לא נשמר כלום בשרת."
                : "אחרי אישור תשלום מאובטח ניצור עבורכם את האתר והפאנל — בלי אישור לא נשמר כלום בשרת."
            : "במצב זה אפשר להשלים בלי תשלום (ללא ספק תשלום מוגדר או מצב פיתוח)."}
        </p>

        <div className="mt-6 rounded-xl border border-white/55 bg-white/40 px-4 py-3 text-right backdrop-blur-sm">
          <p className="font-sans text-sm font-semibold text-[#071219]">{salonName}</p>
          <p className="mt-1 break-all text-left font-sans text-xs text-[#417374] dir-ltr">{previewUrl}</p>
        </div>

        <h3 className="mt-8 text-right font-sans text-base font-semibold text-[#071219]">
          בחרו מנוי
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PRICING_TIERS.map((tier) => {
            const id = tier.id === "plus" ? "plus" : "essential";
            const selected = plan === id;
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => setPlan(id as PlanId)}
                className={cn(
                  "rounded-2xl border p-4 text-right transition-all backdrop-blur-sm",
                  selected
                    ? "border-[#4e979f] bg-white/55 ring-2 ring-[#7ac7d4]/35"
                    : "border-white/55 bg-white/30 hover:border-[#4e979f]/50 hover:bg-white/45"
                )}
              >
                <p className="font-sans font-semibold text-[#071219]">{tier.name}</p>
                <p className="mt-1 font-sans text-lg font-bold text-[#417374]">
                  {tier.price}
                  <span className="text-sm font-medium text-[#417374]/80">{tier.period}</span>
                </p>
                <ul className="mt-3 space-y-1.5">
                  {tier.features.slice(0, 3).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 font-sans text-xs text-[#417374]">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4e979f]" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {saveError && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-right text-sm text-red-700">
            {saveError}
          </div>
        )}

        {paymentConfigLoading && (
          <p className="mt-6 text-center font-sans text-sm text-[#417374]">טוען הגדרות תשלום…</p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          {paymentEnforced && checkoutReady && (
            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={isSaving || paymentConfigLoading}
              className={cn(liquidGlassPrimaryBrandClass, "rounded-xl px-8 disabled:opacity-50")}
            >
              {isSaving ? "פותח דף תשלום…" : "המשך לתשלום מאובטח"}
            </button>
          )}
          {paymentEnforced && !checkoutReady && !paymentConfigLoading && (
            <p className="text-right text-sm text-red-700">
              {checkoutProvider === "paddle"
                ? "תשלום נדרש אך Paddle לא הוגדר במלואו. הוסיפו PADDLE_API_KEY ו-PADDLE_PRICE_CALENO_BASIC (מזהה מחיר pri_ מהקטלוג), או בטלו REQUIRE_ONBOARDING_PAYMENT."
                : checkoutProvider === "stripe"
                  ? "תשלום נדרש אך Stripe לא הוגדר בשרת. הוסיפו STRIPE_SECRET_KEY ו-STRIPE_PRICE_CALENO_BASIC או בטלו REQUIRE_ONBOARDING_PAYMENT."
                  : "תשלום נדרש אך לא הוגדר ספק תשלום בשרת."}
            </p>
          )}
          {!paymentEnforced && !paymentConfigLoading && (
            <button
              type="button"
              onClick={() => void onDevComplete()}
              disabled={isSaving}
              className={cn(liquidGlassPrimaryBrandClass, "rounded-xl px-8 disabled:opacity-50")}
            >
              {isSaving ? "יוצר את האתר…" : "השלם וצור את האתר"}
            </button>
          )}
        </div>

        {paymentEnforced && checkoutReady && checkoutProvider === "paddle" && (
          <p className="mt-4 text-center text-xs text-[#94A3B8]">
            התשלום מעובד דרך Paddle (מצב sandbox או production לפי ההגדרות).
          </p>
        )}
        {paymentEnforced && checkoutReady && checkoutProvider === "stripe" && (
          <p className="mt-4 text-center text-xs text-[#94A3B8]">
            התשלום מעובד ב-Stripe. לא שומרים כרטיס אשראי בשרתים שלנו.
          </p>
        )}
      </div>
    </div>
  );
}
