"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// Builder is dynamic - it requires authentication and loads user data
export const dynamic = "force-dynamic";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  V0AuthShell,
  liquidGlassPrimaryBrandClass,
  liquidGlassSocialButtonClass,
  v0GlassBuilderCardClassName,
  v0GlassCardStyle,
  v0InputGlassClass,
  v0SelectGlassClass,
} from "@/components/auth/V0AuthShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";
import type { MainGoal, SiteConfig } from "@/types/siteConfig";
import { defaultSiteConfig } from "@/types/siteConfig";
import type { SalonBookingState } from "@/types/booking";
import { defaultBookingState } from "@/types/booking";
import { HAIR_HERO_IMAGES, HAIR_ABOUT_IMAGES } from "@/lib/hairImages";
import { validateTenantSlug, getSitePublicUrl } from "@/lib/tenant";
import { AdminBookingTab } from "@/components/admin/AdminBookingTab";
import { convertSalonBookingStateToBookingSettings } from "@/lib/firestoreBookingSettings";
import { isSalonBookingHoursValidForWizard } from "@/lib/openingHoursValidation";
import { BuilderBotCoach } from "@/components/builder/BuilderBotCoach";
import { PublicSiteTemplatePickerForm } from "@/components/builder/PublicSiteTemplatePickerForm";
import { PUBLIC_TEMPLATE_SALON_TYPE } from "@/components/templates/builderPublicTemplates";

/*
 * Manual test steps (signup wizard + subdomain):
 * 1. Sign up through wizard; pick template; at subdomain step enter slug "testamitay", check availability; finish hours step → site created (no payment step).
 * 2. Firestore: tenants/testamitay exists with correct siteId; sites/<siteId> has slug "testamitay"; users/<uid>.siteId set.
 * 3. Slug availability: GET /api/tenants/check-slug?slug=… returns 200 { available: true|false }.
 * 4. Open https://testamitay.caleno.co/admin (or localhost /admin?tenant=testamitay); should load and prompt login if needed.
 */

// Reusable component for the "editable later" hint
function EditableLaterHint() {
  return (
    <p className="mb-4 mt-1 text-right font-sans text-sm leading-relaxed text-[#417374]/90">
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
      <div className="pointer-events-none absolute -top-20 left-0 z-[5] hidden sm:block">
        <div className="relative rounded-xl border border-white/70 bg-white/55 px-4 py-3 shadow-[0_8px_24px_-12px_rgba(7,18,25,0.12)] backdrop-blur-md">
          <p className="text-xs font-semibold text-[#071219]">דומיין</p>
          <p className="mt-1 text-xs leading-relaxed text-[#417374]">
            זו הכתובת של האתר בשורת הכתובת בדפדפן.
          </p>
          <div className="absolute -bottom-2 left-6 h-4 w-4 rotate-45 border-b border-l border-white/70 bg-white/55" />
        </div>
      </div>

      {/* Mobile hint: bubble below + arrow pointing up */}
      <div className="pointer-events-none absolute -bottom-20 left-1/2 z-[5] -translate-x-1/2 sm:hidden">
        <div className="relative rounded-xl border border-white/70 bg-white/55 px-4 py-3 shadow-[0_8px_24px_-12px_rgba(7,18,25,0.12)] backdrop-blur-md">
          <p className="text-xs font-semibold text-[#071219]">דומיין</p>
          <p className="mt-1 text-xs leading-relaxed text-[#417374]">
            הכתובת של האתר. בחרו שם שיופיע לפני ‎.caleno.co
          </p>
          <div className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-l border-t border-white/70 bg-white/55" />
        </div>
      </div>
    </>
  );
}

/** Same wordmark as landing v2 (`components/landing-v2/header.tsx`). */
const BUILDER_LOGO_PRIMARY = "/images/newlandinglogo.svg";
const BUILDER_LOGO_FALLBACK = "/images/new_landing_caleno_logo1.svg";

export default function BuilderPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, firebaseUser, authReady, loading: authLoading } = useAuth();
  
  // Redirect guard: require login. Users with existing site(s) may still use /builder to add another site.
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

    didRedirect.current = false;
    if (process.env.NODE_ENV === "development") {
      console.log(`[BUILDER GUARD] authReady=true, uid=${user.id} -> allow builder (incl. additional site)`);
    }
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
  const [builderLogoSrc, setBuilderLogoSrc] = useState(BUILDER_LOGO_PRIMARY);
  const totalSteps = 7;

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
    if (step > 1) setStep(step - 1);
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

  /** From opening-hours step → create site (no separate payment step for now). */
  const tryFinishWizard = () => {
    if (step !== 7) return;
    if (!isStepValid()) {
      setShowStepValidationHint(true);
      return;
    }
    setShowStepValidationHint(false);
    void handleFinish();
  };

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
      <div dir="rtl" lang="he" className="min-h-screen">
        <V0AuthShell>
          <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
            <div
              className="h-12 w-12 animate-spin rounded-full border-2 border-[#417374]/25 border-t-[#4e979f]"
              aria-hidden
            />
            <p className="mt-4 font-sans text-sm font-medium text-[#417374]">טוען…</p>
          </div>
        </V0AuthShell>
      </div>
    );
  }

  return (
    <div dir="rtl" lang="he" className="min-h-screen">
      <V0AuthShell>
        <div className="flex w-full flex-col items-center px-4 py-4 sm:px-6 sm:py-8">
          <div className="mb-3 flex flex-col items-center pt-1 sm:mb-6 sm:pt-2">
            <Link
              href="/"
              className="inline-flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4e979f]/50 focus-visible:ring-offset-2"
              aria-label="Caleno – דף הבית"
            >
              <img
                src={builderLogoSrc}
                alt="Caleno"
                className="h-9 w-auto max-w-[min(200px,55vw)] object-contain object-center drop-shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:h-10 sm:max-w-[min(220px,50vw)]"
                width={220}
                height={48}
                decoding="async"
                fetchPriority="high"
                loading="eager"
                onError={() =>
                  setBuilderLogoSrc((s) =>
                    s === BUILDER_LOGO_FALLBACK ? s : BUILDER_LOGO_FALLBACK
                  )
                }
              />
            </Link>
            <p className="mt-2 font-sans text-sm font-medium text-[#417374]">
              בונה את העסק שלך
            </p>
          </div>

        <Card className={v0GlassBuilderCardClassName()} style={v0GlassCardStyle()}>
        <CardContent className="mb-8 px-4 pb-8 pt-4 text-right sm:mb-12 sm:px-8 sm:pb-10 sm:pt-8">
          {/* Step indicator */}
          <div className="mb-4 sm:mb-8">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-sans text-sm font-medium text-[#417374]">
                שלב {step} מתוך {totalSteps}
              </span>
              <Link
                href="/"
                className="font-sans text-sm text-[#417374] underline-offset-2 transition-colors hover:text-[#3c7a8d] hover:underline"
              >
                חזרה לדף הבית
              </Link>
            </div>
            <div className="h-2 w-full rounded-full border border-white/50 bg-white/40">
              <div
                className="h-full rounded-full bg-[#417374] transition-all duration-300"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
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
                  className="mb-2 block font-sans text-sm font-medium text-[#071219]"
                >
                  איך קוראים לעסק? *
                </label>
                <input
                  type="text"
                  id="salonName"
                  value={config.salonName}
                  onChange={(e) => updateConfig({ salonName: e.target.value })}
                  className={cn(v0InputGlassClass, "w-full text-right")}
                  placeholder="הזן את שם הסלון"
                />
              </div>
              <div>
                <label
                  htmlFor="salonType"
                  className="mb-2 block font-sans text-sm font-medium text-[#071219]"
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
                    className={cn(v0SelectGlassClass, "w-full text-right disabled:opacity-50")}
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
            <PublicSiteTemplatePickerForm
              selectedId={config.publicSiteTemplateId ?? "hair-luxury"}
              onSelect={(id) =>
                updateConfig({
                  publicSiteTemplateId: id,
                  salonType: PUBLIC_TEMPLATE_SALON_TYPE[id],
                })
              }
            />
          )}

          {/* Step 3 - Choose your link (subdomain) */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <label
                  htmlFor="wizardSlug"
                  className="mb-2 block font-sans text-sm font-medium text-[#071219]"
                >
                  איך תרצו שהקישור ייראה? *
                </label>
                <div className="flex flex-wrap items-stretch gap-2">
                  <div
                    className="relative flex min-w-[200px] flex-1 items-stretch overflow-hidden rounded-xl border border-white/55 bg-white/45 shadow-[0_1px_2px_rgba(7,18,25,0.06)] backdrop-blur-sm transition-[box-shadow,border-color] focus-within:border-[#4e979f] focus-within:ring-2 focus-within:ring-[#7ac7d4]/40"
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
                      className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-left font-sans text-base text-[#071219] placeholder:text-[#417374]/45 focus:outline-none focus:ring-0"
                      placeholder="mysalon"
                      maxLength={30}
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                    />
                    <span
                      className="flex shrink-0 select-none items-center border-l border-white/55 bg-white/35 px-3 py-2 font-sans text-sm font-medium tabular-nums text-[#417374]"
                      aria-hidden
                    >
                      .caleno.co
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => checkSlugAvailability(wizardSlug.trim().toLowerCase())}
                    disabled={slugCheckLoading || !wizardSlug.trim()}
                    className={cn(
                      liquidGlassPrimaryBrandClass,
                      "w-auto min-w-0 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-45"
                    )}
                  >
                    {slugCheckLoading ? "בודק..." : "בדוק זמינות"}
                  </button>
                </div>
                {wizardSlug.trim() && (
                  <div
                    className="mt-4 rounded-xl border border-white/65 bg-white/40 p-4 shadow-[0_8px_32px_-12px_rgba(7,18,25,0.12)] backdrop-blur-md"
                    role="status"
                    aria-live="polite"
                  >
                    <p className="mb-1.5 text-right font-sans text-xs font-bold uppercase tracking-wide text-[#417374]">
                      תצוגה מקדימה
                    </p>
                    <p className="mb-3 text-right font-sans text-sm font-semibold leading-snug text-[#071219]">
                      כך ייראה הקישור המלא — מה שלקוחות יראו בדפדפן
                    </p>
                    <div
                      dir="ltr"
                      className="rounded-lg border border-white/60 bg-white/55 px-3 py-3 text-left shadow-inner backdrop-blur-sm sm:px-4"
                    >
                      <span className="break-all font-mono text-[0.95rem] font-medium leading-relaxed text-[#071219] [word-break:break-word] sm:text-base">
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
                <p className="mt-1 text-right font-sans text-xs text-[#417374]/90">
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
                  className="mb-2 block font-sans text-sm font-medium text-[#071219]"
                >
                  מה השם בגוגל מפות? *
                </label>
                <input
                  type="text"
                  id="address"
                  value={config.address || ""}
                  onChange={(e) => updateConfig({ address: e.target.value })}
                  className={cn(v0InputGlassClass, "w-full text-right")}
                  placeholder="למשל: שם הסלון כפי שמופיע בגוגל מפות"
                  required
                />
                <p className="mt-1.5 text-right font-sans text-xs leading-relaxed text-[#417374]/90">
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
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/55 bg-white/35 p-4 backdrop-blur-sm transition-colors hover:border-[#4e979f]/50 hover:bg-white/50"
                  >
                    <input
                      type="checkbox"
                      checked={config.mainGoals.includes(goal)}
                      onChange={() => toggleMainGoal(goal)}
                      className="h-4 w-4 rounded border-white/60 text-[#417374] focus:ring-2 focus:ring-[#7ac7d4]/40"
                    />
                    <span className="font-sans text-[#071219]">{mainGoalLabels[goal]}</span>
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
                    className="mb-1 block font-sans text-sm font-medium text-[#071219]"
                  >
                    מספר טלפון להצגה באתר
                  </label>
                  <input
                    type="text"
                    id="phoneNumber"
                    value={config.phoneNumber || ""}
                    onChange={(e) => updateConfig({ phoneNumber: e.target.value })}
                    className={cn(v0InputGlassClass, "w-full text-right")}
                    placeholder="למשל: 050-1234567"
                  />
                </div>

                <div>
                  <label
                    htmlFor="whatsappNumber"
                    className="mb-1 block font-sans text-sm font-medium text-[#071219]"
                  >
                    מספר וואטסאפ
                  </label>
                  <input
                    type="text"
                    id="whatsappNumber"
                    value={config.whatsappNumber || ""}
                    onChange={(e) => updateConfig({ whatsappNumber: e.target.value })}
                    className={cn(v0InputGlassClass, "w-full text-right")}
                    placeholder="למשל: 050-1234567"
                  />
                </div>

                <div>
                  <label
                    htmlFor="instagramHandle"
                    className="mb-1 block font-sans text-sm font-medium text-[#071219]"
                  >
                    אינסטגרם
                  </label>
                  <input
                    type="text"
                    id="instagramHandle"
                    value={config.instagramHandle || ""}
                    onChange={(e) => updateConfig({ instagramHandle: e.target.value })}
                    className={cn(v0InputGlassClass, "w-full text-right")}
                    placeholder="למשל: salon_beauty"
                  />
                </div>

                <div>
                  <label
                    htmlFor="facebookPage"
                    className="mb-1 block font-sans text-sm font-medium text-[#071219]"
                  >
                    עמוד פייסבוק
                  </label>
                  <input
                    type="text"
                    id="facebookPage"
                    value={config.facebookPage || ""}
                    onChange={(e) => updateConfig({ facebookPage: e.target.value })}
                    className={cn(v0InputGlassClass, "w-full text-right")}
                    placeholder="למשל: https://facebook.com/your-salon"
                  />
                </div>

                <div>
                  <label
                    htmlFor="contactEmail"
                    className="mb-1 block font-sans text-sm font-medium text-[#071219]"
                  >
                    אימייל לקבלת פניות מהטופס
                  </label>
                  <input
                    type="email"
                    id="contactEmail"
                    value={config.contactEmail || ""}
                    onChange={(e) => updateConfig({ contactEmail: e.target.value })}
                    className={cn(v0InputGlassClass, "w-full text-right")}
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
              <div className="rounded-xl border border-white/55 bg-white/35 p-3 backdrop-blur-sm sm:p-4">
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
            <div className="mt-4 rounded-xl border border-red-200/80 bg-red-50/90 p-3 text-right backdrop-blur-sm">
              <p className="font-sans text-sm text-red-800">{saveError}</p>
            </div>
          )}

          {/* Validation error — only after user clicked המשך / finish while step invalid */}
          {showStepValidationHint && !isStepValid() && (
            <div className="mt-4 rounded-xl border border-red-200/80 bg-red-50/90 p-3 text-right backdrop-blur-sm">
              <p className="font-sans text-sm text-red-800">
                עוד רגע — נשלים את השדות החובה ואז נמשיך יחד.
              </p>
            </div>
          )}
          </div>

          {/* Navigation: חזור תמיד; המשך / סיום אחרי סיום דיבור הבוט */}
          <div className="mt-8 flex justify-between gap-4 border-t border-white/55 pt-6">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1}
              className={cn(
                liquidGlassSocialButtonClass,
                "w-auto min-w-0 px-6 disabled:cursor-not-allowed disabled:opacity-45"
              )}
            >
              חזור
            </button>
            <div className={builderFormFadeClass} aria-hidden={!builderFormVisible}>
              {step < 7 ? (
                <button
                  type="button"
                  onClick={tryAdvanceStep}
                  className={cn(liquidGlassPrimaryBrandClass, "w-auto min-w-[8.5rem] px-6")}
                >
                  המשך
                </button>
              ) : (
                <button
                  type="button"
                  onClick={tryFinishWizard}
                  disabled={isSaving}
                  className={cn(
                    liquidGlassPrimaryBrandClass,
                    "w-auto min-w-0 px-5 disabled:cursor-not-allowed disabled:opacity-45"
                  )}
                >
                  {isSaving ? "יוצר את האתר…" : "סיום ויצירת האתר"}
                </button>
              )}
            </div>
          </div>

        </CardContent>
        </Card>
        </div>
      </V0AuthShell>
    </div>
  );
}
