"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// Builder is dynamic - it requires authentication and loads user data
export const dynamic = "force-dynamic";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";
import type { MainGoal, SiteConfig } from "@/types/siteConfig";
import { defaultSiteConfig } from "@/types/siteConfig";
import type { SalonBookingState } from "@/types/booking";
import { defaultBookingState } from "@/types/booking";
import { HAIR_HERO_IMAGES, HAIR_ABOUT_IMAGES } from "@/lib/hairImages";
import { validateTenantSlug, getSitePublicUrl } from "@/lib/tenant";
import { getDashboardUrl } from "@/lib/url";
import { AdminBookingTab } from "@/components/admin/AdminBookingTab";
import { convertSalonBookingStateToBookingSettings } from "@/lib/firestoreBookingSettings";
import { isSalonBookingHoursValidForWizard } from "@/lib/openingHoursValidation";
import { BuilderBotCoach } from "@/components/builder/BuilderBotCoach";
import { BuilderCheckoutStep } from "@/components/builder/BuilderCheckoutStep";
import { BuilderTemplateSelector } from "@/components/builder/BuilderTemplateSelector";

/*
 * Manual test steps (signup wizard + subdomain):
 * 1. Sign up through wizard; pick template; at subdomain step enter slug "testamitay", check availability, continue and complete.
 * 2. Firestore: tenants/testamitay exists with correct siteId; sites/<siteId> has slug "testamitay"; users/<uid>.siteId set.
 * 3. Slug availability: GET /api/tenants/check-slug?slug=… returns 200 { available: true|false }.
 * 4. Open https://testamitay.caleno.co/admin (or localhost /admin?tenant=testamitay); should load and prompt login if needed.
 */

// Reusable component for the "editable later" hint
function EditableLaterHint() {
  return (
    <p className="text-sm text-caleno-600/85 text-right mt-1 mb-4 leading-relaxed">
      אפשר לשנות הכל אחר כך בפאנל הניהול.
    </p>
  );
}

/**
 * Domain hint arrow for subdomain step (subdomain/domain input).
 * Desktop: anchored top-left near the input.
 * Mobile: anchored bottom-middle near the input.
 */
function DomainHintArrow() {
  return (
    <>
      {/* Desktop hint: bubble above + arrow pointing down */}
      <div className="hidden sm:block absolute -top-20 left-0 z-[5] pointer-events-none">
        <div className="relative rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-900">דומיין</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            זו הכתובת של האתר בשורת הכתובת בדפדפן.
          </p>
          <div className="absolute -bottom-2 left-6 h-4 w-4 rotate-45 border-l border-b border-slate-200 bg-white/95" />
        </div>
      </div>

      {/* Mobile hint: bubble below + arrow pointing up */}
      <div className="sm:hidden absolute -bottom-20 left-1/2 -translate-x-1/2 z-[5] pointer-events-none">
        <div className="relative rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold text-slate-900">דומיין</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">הכתובת של האתר. בחרו שם שיופיע לפני ‎.caleno.co</p>
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-4 rotate-45 border-l border-t border-slate-200 bg-white/95" />
        </div>
      </div>
    </>
  );
}

/** Same subtle wash as tenant admin + signup (radial teal + soft blobs). */
function BuilderCalenoBackground() {
  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 100% 100% at 50% 50%, #cceef1 0%, #e6f5f7 25%, #f0f9fa 50%, #f8fcfd 75%, #ffffff 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -top-24 -left-24 -z-10 h-80 w-80 rounded-full bg-caleno-200/35 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-32 -right-20 -z-10 h-72 w-72 rounded-full bg-caleno-brand/20 blur-3xl"
      />
    </>
  );
}

export default function BuilderPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, firebaseUser, authReady, loading: authLoading } = useAuth();
  
  // Redirect guard: prevent users with site from accessing builder
  const didRedirect = useRef(false);
  
  useEffect(() => {
    // Wait for auth to be ready
    if (!authReady || authLoading) {
      if (process.env.NODE_ENV === "development") {
        console.log("[BUILDER GUARD] Waiting for auth", { 
          authReady, 
          authLoading, 
          pathname,
          uid: user?.id || "null"
        });
      }
      return;
    }

    // Not logged in - redirect to login (only if not already on login)
    if (!user) {
      if (pathname === "/login") {
        // Already on login page, don't redirect
        if (process.env.NODE_ENV === "development") {
          console.log("[BUILDER GUARD] Already on /login, skipping redirect");
        }
        return;
      }
      
      if (!didRedirect.current) {
        didRedirect.current = true;
        if (process.env.NODE_ENV === "development") {
          console.log("[BUILDER GUARD] Not logged in, redirecting to /login", {
            pathname,
            authReady,
            authLoading
          });
        }
        router.replace("/login");
      }
      return;
    }

    // Check if user has a siteId
    const checkSiteId = async () => {
      try {
        const { getUserDocument } = await import("@/lib/firestoreUsers");
        const userDoc = await getUserDocument(user.id);
        
        if (userDoc?.siteId) {
          const url = getDashboardUrl({
            slug: userDoc.primarySlug ?? null,
            siteId: userDoc.siteId,
          });
          const isFullUrl = url.startsWith("http");
          if (!isFullUrl && pathname === url) {
            if (process.env.NODE_ENV === "development") {
              console.log(`[BUILDER GUARD] Already on ${url}, skipping redirect`);
            }
            return;
          }
          if (!didRedirect.current) {
            didRedirect.current = true;
            if (process.env.NODE_ENV === "development") {
              console.log(`[BUILDER GUARD] authReady=true, uid=${user.id}, siteId=${userDoc.siteId} -> redirect to ${url}`);
            }
            if (isFullUrl) {
              window.location.href = url;
            } else {
              router.replace(url);
            }
          }
          return;
        }

        // User exists but no siteId - allow builder access
        if (process.env.NODE_ENV === "development") {
          console.log(`[BUILDER GUARD] authReady=true, uid=${user.id}, no siteId -> allow builder`);
        }
        didRedirect.current = false; // Reset flag if no siteId
      } catch (error) {
        console.error("[BUILDER GUARD] Error checking siteId:", error);
      }
    };

    checkSiteId();
  }, [user, authReady, authLoading, router, pathname]);
  
  const [config, setConfig] = useState<SiteConfig>(() => {
    // Initialize with random hero image and default about image; booking always enabled
    const randomHeroIndex = Math.floor(Math.random() * HAIR_HERO_IMAGES.length);
    return {
      ...defaultSiteConfig,
      salonType: "hair",
      heroImage: HAIR_HERO_IMAGES[randomHeroIndex],
      aboutImage: HAIR_ABOUT_IMAGES[0],
      bookingOption: "simple_form",
    };
  });
  const [step, setStep] = useState(1);
  const prevBuilderStepRef = useRef(step);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [wizardSlug, setWizardSlug] = useState("");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugCheckLoading, setSlugCheckLoading] = useState(false);
  const [templateOptions, setTemplateOptions] = useState<
    Array<{ templateKey: string; salonType: SiteConfig["salonType"]; label: string }>
  >([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [bookingState, setBookingState] = useState<SalonBookingState>(() => ({
    ...defaultBookingState,
    workers: [],
    bookings: [],
  }));
  /** Inline “fill required fields” only after user clicks המשך / finish while invalid */
  const [showStepValidationHint, setShowStepValidationHint] = useState(false);
  /** Step fields + primary actions fade in after bot finishes typing */
  const [builderFormVisible, setBuilderFormVisible] = useState(false);
  /** Steps that already played the typewriter once — revisiting skips animation */
  const [botStepsSpeechCompleted, setBotStepsSpeechCompleted] = useState<
    Set<number>
  >(() => new Set());
  /** Stripe checkout required before site creation (from GET /api/onboarding/payment-config) */
  const [paymentEnforced, setPaymentEnforced] = useState(false);
  const [checkoutProvider, setCheckoutProvider] = useState<
    "paddle" | "stripe" | null
  >(null);
  const [paddleConfigured, setPaddleConfigured] = useState(false);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [paymentConfigLoading, setPaymentConfigLoading] = useState(true);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const checkoutReturnHandledRef = useRef(false);

  const totalSteps = 8;

  useEffect(() => {
    const prev = prevBuilderStepRef.current;
    prevBuilderStepRef.current = step;
    if (step <= prev) return;
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  useEffect(() => {
    setBuilderFormVisible(false);
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding/payment-config")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: {
          paymentEnforced?: boolean;
          provider?: "paddle" | "stripe" | null;
          paddleConfigured?: boolean;
          stripeConfigured?: boolean;
        } | null) => {
          if (cancelled || !data) return;
          setPaymentEnforced(Boolean(data.paymentEnforced));
          setCheckoutProvider(
            data.provider === "paddle" || data.provider === "stripe"
              ? data.provider
              : null
          );
          setPaddleConfigured(Boolean(data.paddleConfigured));
          setStripeConfigured(Boolean(data.stripeConfigured));
        }
      )
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPaymentConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBuilderBotSpeechComplete = useCallback(() => {
    setBuilderFormVisible(true);
    setBotStepsSpeechCompleted((prev) => {
      if (prev.has(step)) return prev;
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  }, [step]);

  const builderFormFadeClass =
    "transition-opacity duration-700 ease-out motion-reduce:transition-none " +
    (builderFormVisible
      ? "opacity-100"
      : "pointer-events-none select-none opacity-0");

  const updateConfig = (updates: Partial<SiteConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const checkSlugAvailability = useCallback(async (slug: string) => {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) {
      setSlugAvailable(null);
      return;
    }
    const v = validateTenantSlug(trimmed);
    if (!v.ok) {
      setSlugAvailable(false);
      return;
    }
    setSlugCheckLoading(true);
    setSlugAvailable(null);
    try {
      const res = await fetch(
        `/api/tenants/check-slug?slug=${encodeURIComponent(trimmed)}`
      );
      const data = (await res.json().catch(() => ({}))) as { available?: boolean };
      if (res.ok && data.available === true) setSlugAvailable(true);
      else if (res.ok && data.available === false) setSlugAvailable(false);
      else setSlugAvailable(null);
    } catch {
      setSlugAvailable(null);
    } finally {
      setSlugCheckLoading(false);
    }
  }, []);

  // Debounced auto-check slug availability when user types a valid slug
  useEffect(() => {
    const trimmed = wizardSlug.trim().toLowerCase();
    if (!trimmed || !validateTenantSlug(trimmed).ok) return;
    const t = setTimeout(() => checkSlugAvailability(trimmed), 500);
    return () => clearTimeout(t);
  }, [wizardSlug, checkSlugAvailability]);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await fetch("/api/templates");
        if (!res.ok) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[Builder] Failed to load templates from API", res.status);
          }
          return;
        }
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          templates?: Array<{
          templateKey: string;
          salonType: SiteConfig["salonType"];
          label: string;
          }>;
        };
        const options = Array.isArray(data.templates) ? data.templates : [];
        if (options.length === 0) return;
        setTemplateOptions(options);
        const allowed = new Set(options.map((o) => o.salonType));
        if (!allowed.has(config.salonType)) {
          updateConfig({ salonType: options[0].salonType });
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[Builder] Failed to load template options:", error);
        }
      } finally {
        setTemplatesLoading(false);
      }
    };
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        return config.salonName.trim() !== "";
      case 2:
        return true; // template has default hair-luxury
      case 3: {
        const trimmed = wizardSlug.trim().toLowerCase();
        if (!trimmed) return false;
        if (!validateTenantSlug(trimmed).ok) return false;
        return slugAvailable === true;
      }
      case 4:
        return !!(config.address && config.address.trim() !== "");
      case 5:
        return config.mainGoals.length > 0;
      case 6: {
        const hasPhone = Boolean(config.phoneNumber?.trim());
        const hasWhatsapp = Boolean(config.whatsappNumber?.trim());
        const hasInstagram = Boolean(config.instagramHandle?.trim());
        const hasFacebook = Boolean(config.facebookPage?.trim());
        const hasEmail = Boolean(config.contactEmail?.trim());
        const hasContact: boolean =
          hasPhone || hasWhatsapp || hasInstagram || hasFacebook || hasEmail;
        return hasContact;
      }
      case 7:
        return isSalonBookingHoursValidForWizard(bookingState);
      case 8:
        return true;
      default:
        return false;
    }
  };

  useEffect(() => {
    setShowStepValidationHint(false);
  }, [step]);

  useEffect(() => {
    if (!showStepValidationHint) return;
    if (isStepValid()) setShowStepValidationHint(false);
  }, [
    showStepValidationHint,
    step,
    config,
    wizardSlug,
    slugAvailable,
    bookingState,
  ]);

  const tryAdvanceStep = () => {
    if (!isStepValid()) {
      setShowStepValidationHint(true);
      return;
    }
    setShowStepValidationHint(false);
    handleNext();
  };

  /** From opening-hours step → payment step (does not create site yet). */
  const tryGoToPaymentStep = () => {
    if (step !== 7) return;
    if (!isStepValid()) {
      setShowStepValidationHint(true);
      return;
    }
    setShowStepValidationHint(false);
    setCheckoutMessage(null);
    setStep(8);
  };

  const handleNext = () => {
    if (step >= totalSteps) return;

    const advance = () => setStep((s) => s + 1);

    // Persist main goals to users/{uid} when leaving the goals step (before site exists).
    if (step === 5 && user?.id && config.mainGoals.length > 0) {
      void (async () => {
        try {
          const { updateUserProfile } = await import("@/lib/firestoreUsers");
          await updateUserProfile(user.id, {
            onboardingMainGoals: config.mainGoals,
          });
        } catch (err) {
          console.error("[Builder] Failed to save onboarding main goals:", err);
        } finally {
          advance();
        }
      })();
      return;
    }

    // Persist public-site display phone to users/{uid} when leaving the contact step.
    if (step === 6 && user?.id) {
      void (async () => {
        try {
          const { updateUserProfile, getUserDocument } = await import("@/lib/firestoreUsers");
          const display = config.phoneNumber?.trim() || null;
          const fresh = await getUserDocument(user.id);
          const hasAccountPhone =
            typeof fresh?.phone === "string" && fresh.phone.trim().length > 0;
          await updateUserProfile(user.id, {
            onboardingSiteDisplayPhone: display,
            // So platform admin always has a phone: copy salon contact when account phone missing (e.g. Google signup)
            ...(display && !hasAccountPhone ? { phone: display } : {}),
          });
        } catch (err) {
          console.error("[Builder] Failed to save onboarding site display phone:", err);
        } finally {
          advance();
        }
      })();
      return;
    }

    advance();
  };

  const handleBack = () => {
    if (step > 1) {
      if (step === 8) setCheckoutMessage(null);
      setStep(step - 1);
    }
  };

  const applyPostOnboardingSuccess = useCallback(
    async (newSiteId: string, slug: string, publicUrl: string) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          `siteConfig:${newSiteId}`,
          JSON.stringify({ ...config, services: [] })
        );
        const existingBookingState = window.localStorage.getItem(
          `bookingState:${newSiteId}`
        );
        if (!existingBookingState) {
          window.localStorage.setItem(
            `bookingState:${newSiteId}`,
            JSON.stringify(defaultBookingState)
          );
        }
      }
      const isLocalhost =
        typeof window !== "undefined" &&
        window.location.hostname === "localhost";
      if (isLocalhost) {
        router.replace(`/admin?tenant=${encodeURIComponent(slug)}`);
      } else {
        window.location.href = `${publicUrl}/admin`;
      }
    },
    [config, router]
  );

  const handleFinish = async () => {
    if (!config.salonName.trim()) return;
    const slug = wizardSlug.trim().toLowerCase();
    if (!validateTenantSlug(slug).ok || slugAvailable !== true) return;

    if (!user || !firebaseUser) {
      setSaveError("משתמש לא מחובר. אנא רענן את הדף.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const { getUserDocument } = await import("@/lib/firestoreUsers");
      const userDoc = await getUserDocument(user.id);

      if (userDoc?.siteId) {
        setIsSaving(false);
        const url = getDashboardUrl({
          slug: userDoc.primarySlug ?? null,
          siteId: userDoc.siteId,
        });
        if (url.startsWith("http")) {
          window.location.href = url;
        } else {
          router.replace(url);
        }
        return;
      }

      const bookingSettings = convertSalonBookingStateToBookingSettings(bookingState);
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/onboarding/complete", {
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
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        siteId?: string;
        publicUrl?: string;
      };

      if (!res.ok || !data.success) {
        setSaveError(data.error || "שגיאה ביצירת האתר");
        setIsSaving(false);
        return;
      }

      const newSiteId = data.siteId!;
      const publicUrl = data.publicUrl ?? getSitePublicUrl(slug);
      await applyPostOnboardingSuccess(newSiteId, slug, publicUrl);
    } catch (err) {
      console.error("Failed to complete onboarding", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSaveError(`שגיאה בשמירה: ${errorMessage}`);
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "cancel") return;
    setCheckoutMessage("התשלום בוטל. אפשר לנסות שוב למטה.");
    setStep(8);
    window.history.replaceState({}, "", "/builder");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !firebaseUser) return;
    const params = new URLSearchParams(window.location.search);
    const ptxn = params.get("_ptxn");
    const sessionId = params.get("session_id");
    const stripeOk =
      params.get("checkout") === "success" &&
      typeof sessionId === "string" &&
      sessionId.startsWith("cs_");
    const paddleOk = typeof ptxn === "string" && ptxn.startsWith("txn_");

    if (!stripeOk && !paddleOk) return;
    if (checkoutReturnHandledRef.current) return;
    checkoutReturnHandledRef.current = true;

    const body = paddleOk
      ? { transactionId: ptxn }
      : { sessionId: sessionId! };

    let cancelled = false;
    (async () => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch("/api/onboarding/complete-from-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          siteId?: string;
          publicUrl?: string;
          slug?: string;
          alreadyCompleted?: boolean;
        };
        if (cancelled) return;
        if (data.alreadyCompleted && data.siteId) {
          window.history.replaceState({}, "", "/builder");
          router.replace("/account");
          setIsSaving(false);
          return;
        }
        if (
          !res.ok ||
          !data.success ||
          !data.siteId ||
          !data.publicUrl ||
          !data.slug
        ) {
          setSaveError(data.error || "לא ניתן להשלים את ההרשמה לאחר התשלום");
          setIsSaving(false);
          checkoutReturnHandledRef.current = false;
          setStep(8);
          return;
        }
        window.history.replaceState({}, "", "/builder");
        await applyPostOnboardingSuccess(data.siteId, data.slug, data.publicUrl);
      } catch (e) {
        if (cancelled) return;
        setSaveError(e instanceof Error ? e.message : "שגיאה");
        setIsSaving(false);
        checkoutReturnHandledRef.current = false;
        setStep(8);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, router, applyPostOnboardingSuccess]);

  const toggleMainGoal = (goal: MainGoal) => {
    setConfig((prev) => {
      const exists = prev.mainGoals.includes(goal);
      return {
        ...prev,
        mainGoals: exists
          ? prev.mainGoals.filter((g) => g !== goal)
          : [...prev.mainGoals, goal],
      };
    });
  };

  const salonTypeLabels: Record<SiteConfig["salonType"], string> = {
    hair: "ספרות / עיצוב שיער",
    nails: "מניקור / פדיקור",
    barber: "ברברשופ",
    spa: "ספא / טיפולי גוף",
    mixed: "משולב",
    other: "אחר",
  };

  const renderedSalonTypeOptions = templateOptions;

  const mainGoalLabels: Record<MainGoal, string> = {
    new_clients: "להביא לקוחות חדשים",
    online_booking: "לאפשר הזמנות אונליין",
    show_photos: "להציג תמונות ועבודות",
    info_only: "לתת מידע בסיסי בלבד",
  };

  // Show loading while auth initializes
  if (!authReady || authLoading) {
    return (
      <div className="relative min-h-screen w-full overflow-x-hidden" dir="rtl">
        <BuilderCalenoBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-caleno-deep" />
            <p className="text-caleno-deep">טוען...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show loading if redirecting
  if (user && user.siteId && didRedirect.current) {
    return (
      <div className="relative min-h-screen w-full overflow-x-hidden" dir="rtl">
        <BuilderCalenoBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-caleno-deep" />
            <p className="text-caleno-deep">מעביר...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden" dir="rtl">
      <BuilderCalenoBackground />
      <div className="relative z-10 py-8">
        <div
          className={`container mx-auto px-4 ${step === 8 ? "max-w-4xl" : "max-w-2xl"}`}
        >
          {/* Caleno branding */}
          <div className="flex flex-col items-center pt-4 pb-6">
            <Link
              href="/"
              className="inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2 rounded"
              aria-label="Caleno – דף הבית"
            >
              <span className="relative block h-10 w-36 sm:h-11 sm:w-44">
                <Image
                  src="/brand/caleno logo/caleno_logo_new.png"
                  alt="Caleno"
                  fill
                  className="object-contain object-center"
                  priority
                  sizes="176px"
                />
              </span>
            </Link>
            <p className="mt-2 text-sm font-medium text-caleno-deep">
              {step === 8 ? "תשלום והשקת האתר" : "בונה את העסק שלך"}
            </p>
          </div>

        {step === 8 ? (
          <div className="mb-20 space-y-8">
            <div className="text-right">
              <span className="text-sm font-medium text-caleno-deep/90">
                שלב אחרון · תשלום
              </span>
              <div className="mt-2 h-2 w-full rounded-full bg-caleno-border">
                <div
                  className="h-2 rounded-full bg-caleno-deep transition-all duration-300"
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <BuilderBotCoach
              key={step}
              step={step}
              instantSpeech={botStepsSpeechCompleted.has(step)}
              onSpeakingComplete={handleBuilderBotSpeechComplete}
            />

            <div
              className={builderFormFadeClass}
              aria-hidden={!builderFormVisible}
            >
              {firebaseUser ? (
                <BuilderCheckoutStep
                  salonName={config.salonName}
                  slug={wizardSlug.trim().toLowerCase()}
                  config={config}
                  bookingState={bookingState}
                  paymentEnforced={paymentEnforced}
                  checkoutProvider={checkoutProvider}
                  paddleConfigured={paddleConfigured}
                  stripeConfigured={stripeConfigured}
                  paymentConfigLoading={paymentConfigLoading}
                  firebaseUser={firebaseUser}
                  onDevComplete={async () => {
                    await handleFinish();
                  }}
                  isSaving={isSaving}
                  setIsSaving={setIsSaving}
                  saveError={saveError}
                  setSaveError={setSaveError}
                  checkoutMessage={checkoutMessage}
                />
              ) : null}
            </div>

            <div className="flex justify-between gap-4 border-t border-caleno-border/50 pt-8">
              <button
                type="button"
                onClick={handleBack}
                className="rounded-lg border border-caleno-border px-6 py-3 font-medium text-caleno-ink transition-colors hover:bg-[rgba(15,23,42,0.04)]"
              >
                חזור לשעות פעילות
              </button>
            </div>
          </div>
        ) : (
        <div className="rounded-xl border border-caleno-border bg-white p-6 shadow-sm sm:p-8 mb-16 text-right ring-1 ring-black/5">
          {/* Step indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-caleno-deep/90">
                שלב {step} מתוך {totalSteps}
              </span>
              <Link
                href="/"
                className="text-sm text-caleno-deep transition-colors hover:text-caleno-ink"
              >
                חזרה לדף הבית
              </Link>
            </div>
            <div className="w-full rounded-full h-2 bg-caleno-border">
              <div
                className="h-2 rounded-full bg-caleno-deep transition-all duration-300"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* key=step remounts the coach so typewriter state never leaks across steps (fixes back nav: form staying hidden). */}
          <BuilderBotCoach
            key={step}
            step={step}
            instantSpeech={botStepsSpeechCompleted.has(step)}
            onSpeakingComplete={handleBuilderBotSpeechComplete}
          />

          <div
            className={builderFormFadeClass}
            aria-hidden={!builderFormVisible}
          >
          {/* Step 1 - Basic details */}
          {step === 1 && (
            <div className="space-y-6">
              <EditableLaterHint />
              <div>
                <label
                  htmlFor="salonName"
                  className="block text-sm font-medium text-[#64748B] mb-2"
                >
                  איך קוראים לעסק? *
                </label>
                <input
                  type="text"
                  id="salonName"
                  value={config.salonName}
                  onChange={(e) => updateConfig({ salonName: e.target.value })}
                  className="w-full rounded-lg border border-caleno-border px-3 py-2 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                  placeholder="הזן את שם הסלון"
                />
              </div>
              <div>
                <label
                  htmlFor="salonType"
                  className="block text-sm font-medium text-[#64748B] mb-2"
                >
                  איזה סוג סלון? *
                </label>
                <div className="w-full" dir="ltr" style={{ position: "relative" }}>
                  <select
                    id="salonType"
                    value={config.salonType}
                    onChange={(e) =>
                      updateConfig({
                        salonType: e.target.value as SiteConfig["salonType"],
                      })
                    }
                    disabled={templatesLoading}
                    className="w-full rounded-lg border border-caleno-border bg-white px-3 py-2 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                  >
                    {templatesLoading && (
                      <option value={config.salonType}>טוען תבניות...</option>
                    )}
                    {!templatesLoading && renderedSalonTypeOptions.length === 0 && (
                      <option value={config.salonType}>{salonTypeLabels[config.salonType]}</option>
                    )}
                    {renderedSalonTypeOptions.map((option) => (
                      <option key={option.templateKey} value={option.salonType}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 - Public site template */}
          {step === 2 && (
            <BuilderTemplateSelector
              selectedId={config.publicSiteTemplateId ?? "hair-luxury"}
              onSelect={(id) => updateConfig({ publicSiteTemplateId: id })}
            />
          )}

          {/* Step 3 - Choose your link (subdomain) */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="wizardSlug"
                  className="block text-sm font-medium text-[#64748B] mb-2"
                >
                  איך תרצו שהקישור ייראה? *
                </label>
                <div className="flex flex-wrap items-stretch gap-2">
                  <div
                    className="relative flex min-w-[200px] flex-1 items-stretch overflow-hidden rounded-lg border border-caleno-border bg-white shadow-sm transition-[box-shadow,border-color] focus-within:border-caleno-deep focus-within:ring-[3px] focus-within:ring-[rgba(30,111,124,0.15)]"
                    dir="ltr"
                  >
                    <DomainHintArrow />
                    <input
                      type="text"
                      id="wizardSlug"
                      value={wizardSlug}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const normalized = raw
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "");
                        setWizardSlug(normalized);
                        setSlugAvailable(null);
                      }}
                      className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-left text-base text-caleno-ink placeholder:text-[#94A3B8] focus:outline-none focus:ring-0"
                      placeholder="mysalon"
                      maxLength={30}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                    />
                    <span
                      className="flex shrink-0 select-none items-center border-l border-caleno-border bg-[#F8FAFC] px-3 py-2 text-sm font-medium tabular-nums text-[#64748B]"
                      aria-hidden
                    >
                      .caleno.co
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => checkSlugAvailability(wizardSlug.trim().toLowerCase())}
                    disabled={slugCheckLoading || !wizardSlug.trim()}
                    className="rounded-lg bg-caleno-ink px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {slugCheckLoading ? "בודק..." : "בדוק זמינות"}
                  </button>
                </div>
                {wizardSlug.trim() && (
                  <div
                    className="mt-4 rounded-xl border-2 border-[#1E6F7C]/25 bg-gradient-to-br from-[#E8F6F8]/90 to-white p-4 shadow-[0_8px_24px_-12px_rgba(30,111,124,0.35)]"
                    role="status"
                    aria-live="polite"
                  >
                    <p className="text-right text-xs font-bold uppercase tracking-wide text-[#1E6F7C] mb-1.5">
                      תצוגה מקדימה
                    </p>
                    <p className="text-right text-sm font-semibold text-caleno-ink mb-3 leading-snug">
                      כך ייראה הקישור המלא — מה שלקוחות יראו בדפדפן
                    </p>
                    <div
                      dir="ltr"
                      className="rounded-lg border border-[#1E6F7C]/20 bg-white px-3 py-3 sm:px-4 text-left shadow-inner"
                    >
                      <span className="font-mono text-[0.95rem] sm:text-base font-medium text-[#0F172A] break-all [word-break:break-word] leading-relaxed">
                        {getSitePublicUrl(wizardSlug.trim().toLowerCase(), "")}
                      </span>
                    </div>
                  </div>
                )}
                {wizardSlug.trim() && (() => {
                  const v = validateTenantSlug(wizardSlug.trim().toLowerCase());
                  return !v.ok ? (
                    <p className="text-sm text-amber-600 mt-1 text-right">
                      {v.error}
                    </p>
                  ) : null;
                })()}
                {slugAvailable === true && (
                  <p className="text-sm text-green-600 mt-1 text-right">הקישור פנוי</p>
                )}
                {slugAvailable === false && (
                  <p className="text-sm text-red-600 mt-1 text-right">הקישור תפוס או לא תקין</p>
                )}
                <p className="text-xs text-[#64748B] mt-1 text-right">
                  3–30 תווים, אותיות באנגלית, ספרות ומקף. לא להתחיל או לסיים במקף.
                </p>
              </div>
            </div>
          )}

          {/* Step 4 - Google Maps place name (shows business + reviews on embed) */}
          {step === 4 && (
            <div className="space-y-6">
              <EditableLaterHint />
              <div>
                <label
                  htmlFor="address"
                  className="block text-sm font-medium text-[#64748B] mb-2"
                >
                  מה השם בגוגל מפות? *
                </label>
                <input
                  type="text"
                  id="address"
                  value={config.address || ""}
                  onChange={(e) => updateConfig({ address: e.target.value })}
                  className="w-full rounded-lg border border-caleno-border px-3 py-2 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                  placeholder="למשל: שם הסלון כפי שמופיע בגוגל מפות"
                  required
                />
                <p className="text-xs text-caleno-600/90 mt-1.5 text-right leading-relaxed">
                  טיפ קטן: בדיוק כמו בגוגל — ככה המפה והביקורות יתחברו יפה.
                </p>
              </div>
            </div>
          )}

          {/* Step 5 - Main goal */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="space-y-3">
                {(Object.keys(mainGoalLabels) as MainGoal[]).map((goal) => (
                  <label
                    key={goal}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-caleno-border p-4 transition-colors hover:border-caleno-deep/40 hover:bg-[rgba(30,111,124,0.04)]"
                  >
                    <input
                      type="checkbox"
                      checked={config.mainGoals.includes(goal)}
                      onChange={() => toggleMainGoal(goal)}
                      className="h-4 w-4 rounded text-caleno-deep focus:ring-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                    />
                    <span className="text-[#0F172A]">{mainGoalLabels[goal]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 6 - Contact & booking */}
          {step === 6 && (
            <div className="space-y-6">
              <EditableLaterHint />
              
              {/* Contact details */}
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="phoneNumber"
                    className="block text-sm font-medium text-[#64748B] mb-1"
                  >
                    מספר טלפון להצגה באתר
                  </label>
                  <input
                    type="text"
                    id="phoneNumber"
                    value={config.phoneNumber || ""}
                    onChange={(e) => updateConfig({ phoneNumber: e.target.value })}
                    className="w-full rounded-lg border border-caleno-border px-3 py-2 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                    placeholder="למשל: 050-1234567"
                  />
                </div>

                <div>
                  <label
                    htmlFor="whatsappNumber"
                    className="block text-sm font-medium text-[#64748B] mb-1"
                  >
                    מספר וואטסאפ
                  </label>
                  <input
                    type="text"
                    id="whatsappNumber"
                    value={config.whatsappNumber || ""}
                    onChange={(e) => updateConfig({ whatsappNumber: e.target.value })}
                    className="w-full rounded-lg border border-caleno-border px-3 py-2 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                    placeholder="למשל: 050-1234567"
                  />
                </div>

                <div>
                  <label
                    htmlFor="instagramHandle"
                    className="block text-sm font-medium text-[#64748B] mb-1"
                  >
                    אינסטגרם
                  </label>
                  <input
                    type="text"
                    id="instagramHandle"
                    value={config.instagramHandle || ""}
                    onChange={(e) => updateConfig({ instagramHandle: e.target.value })}
                    className="w-full rounded-lg border border-caleno-border px-3 py-2 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                    placeholder="למשל: salon_beauty"
                  />
                </div>

                <div>
                  <label
                    htmlFor="facebookPage"
                    className="block text-sm font-medium text-[#64748B] mb-1"
                  >
                    עמוד פייסבוק
                  </label>
                  <input
                    type="text"
                    id="facebookPage"
                    value={config.facebookPage || ""}
                    onChange={(e) => updateConfig({ facebookPage: e.target.value })}
                    className="w-full rounded-lg border border-caleno-border px-3 py-2 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                    placeholder="למשל: https://facebook.com/your-salon"
                  />
                </div>

                <div>
                  <label
                    htmlFor="contactEmail"
                    className="block text-sm font-medium text-[#64748B] mb-1"
                  >
                    אימייל לקבלת פניות מהטופס
                  </label>
                  <input
                    type="email"
                    id="contactEmail"
                    value={config.contactEmail || ""}
                    onChange={(e) => updateConfig({ contactEmail: e.target.value })}
                    className="w-full rounded-lg border border-caleno-border px-3 py-2 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

            </div>
          )}

          {/* Step 7 - Opening hours (same as admin שעות פעילות) */}
          {step === 7 && (
            <div className="space-y-4">
              <EditableLaterHint />
              <div className="rounded-lg border border-caleno-border bg-slate-50/50 p-3 sm:p-4">
                <AdminBookingTab
                  embedded
                  state={bookingState}
                  onChange={setBookingState}
                  title="מתי פתוחים?"
                  description="סמנו ימים, שעות, הפסקות ותאריכים סגורים — תמיד אפשר לעדכן אחר כך בפאנל."
                />
              </div>
            </div>
          )}

          {/* Save error message */}
          {saveError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          )}

          {/* Validation error — only after user clicked המשך / finish while step invalid */}
          {showStepValidationHint && !isStepValid() && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
              <p className="text-sm text-red-700">
                עוד רגע — נשלים את השדות החובה ואז נמשיך יחד.
              </p>
            </div>
          )}
          </div>

          {/* Navigation: חזור תמיד; המשך / סיום אחרי סיום דיבור הבוט */}
          <div className="mt-8 pt-6 border-t border-caleno-border flex justify-between gap-4">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1}
              className="rounded-lg border border-caleno-border px-6 py-3 font-medium text-caleno-ink transition-colors hover:bg-[rgba(15,23,42,0.04)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              חזור
            </button>
            <div className={builderFormFadeClass} aria-hidden={!builderFormVisible}>
              {step < 7 ? (
                <button
                  type="button"
                  onClick={tryAdvanceStep}
                  className="rounded-lg bg-caleno-ink px-6 py-3 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md"
                >
                  המשך
                </button>
              ) : (
                <button
                  type="button"
                  onClick={tryGoToPaymentStep}
                  disabled={isSaving}
                  className="rounded-lg bg-caleno-ink px-6 py-3 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  המשך לתשלום והשקה
                </button>
              )}
            </div>
          </div>

        </div>
        )}
        </div>
      </div>
    </div>
  );
}
