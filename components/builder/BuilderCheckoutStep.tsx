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

      <div className="rounded-2xl border border-caleno-border bg-white/95 p-6 shadow-[0_24px_80px_-32px_rgba(15,69,80,0.35)] ring-1 ring-black/5 backdrop-blur-sm sm:p-8">
        <h2 className="text-right text-xl font-bold text-caleno-ink sm:text-2xl">
          סיכום והשקה
        </h2>
        <p className="mt-2 text-right text-sm leading-relaxed text-[#64748B]">
          {paymentEnforced
            ? checkoutProvider === "paddle"
              ? "אחרי אישור התשלום ב-Paddle ניצור עבורכם את האתר, הקישור והפאנל — בלי תשלום מאושר לא נשמר כלום בשרת."
              : checkoutProvider === "stripe"
                ? "אחרי אישור התשלום ב-Stripe ניצור עבורכם את האתר, הקישור והפאנל — בלי תשלום מאושר לא נשמר כלום בשרת."
                : "אחרי אישור תשלום מאובטח ניצור עבורכם את האתר והפאנל — בלי אישור לא נשמר כלום בשרת."
            : "במצב זה אפשר להשלים בלי תשלום (ללא ספק תשלום מוגדר או מצב פיתוח)."}
        </p>

        <div className="mt-6 rounded-xl border border-caleno-border bg-caleno-off/40 px-4 py-3 text-right">
          <p className="text-sm font-semibold text-caleno-ink">{salonName}</p>
          <p className="mt-1 break-all text-xs text-[#64748B] dir-ltr text-left">{previewUrl}</p>
        </div>

        <h3 className="mt-8 text-right text-base font-semibold text-caleno-ink">
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
                  "rounded-2xl border p-4 text-right transition-all",
                  selected
                    ? "border-caleno-deep bg-caleno-off/50 ring-2 ring-caleno-deep/30"
                    : "border-caleno-border bg-white hover:border-caleno-deep/40"
                )}
              >
                <p className="font-semibold text-caleno-ink">{tier.name}</p>
                <p className="mt-1 text-lg font-bold text-caleno-deep">
                  {tier.price}
                  <span className="text-sm font-medium text-[#64748B]">{tier.period}</span>
                </p>
                <ul className="mt-3 space-y-1.5">
                  {tier.features.slice(0, 3).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#64748B]">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-caleno-brand" />
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
          <p className="mt-6 text-center text-sm text-[#64748B]">טוען הגדרות תשלום…</p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          {paymentEnforced && checkoutReady && (
            <button
              type="button"
              onClick={() => void startCheckout()}
              disabled={isSaving || paymentConfigLoading}
              className="rounded-full bg-caleno-ink px-8 py-3 text-center text-sm font-semibold text-white shadow-md transition hover:bg-[#1E293B] disabled:opacity-50"
            >
              {isSaving ? "פותח דף תשלום…" : "המשך לתשלום מאובטח"}
            </button>
          )}
          {paymentEnforced && !checkoutReady && !paymentConfigLoading && (
            <p className="text-right text-sm text-red-700">
              {checkoutProvider === "paddle"
                ? "תשלום נדרש אך Paddle לא הוגדר במלואו. הוסיפו PADDLE_API_KEY ו-PADDLE_PRICE_CALENO_BASIC (מזהה מחיר pri_ מהקטלוג), או ALLOW_ONBOARDING_WITHOUT_PAYMENT=true לפיתוח."
                : checkoutProvider === "stripe"
                  ? "תשלום נדרש אך Stripe לא הוגדר בשרת. הוסיפו STRIPE_SECRET_KEY ו-STRIPE_PRICE_CALENO_BASIC או ALLOW_ONBOARDING_WITHOUT_PAYMENT=true לפיתוח."
                  : "תשלום נדרש אך לא הוגדר ספק תשלום בשרת."}
            </p>
          )}
          {!paymentEnforced && !paymentConfigLoading && (
            <button
              type="button"
              onClick={() => void onDevComplete()}
              disabled={isSaving}
              className="rounded-full bg-caleno-deep px-8 py-3 text-center text-sm font-semibold text-white shadow-md transition hover:bg-caleno-600 disabled:opacity-50"
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
