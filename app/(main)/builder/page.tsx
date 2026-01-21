"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import type { MainGoal, SiteConfig } from "@/types/siteConfig";
import { defaultSiteConfig } from "@/types/siteConfig";
import { defaultBookingState } from "@/types/booking";
import { HAIR_HERO_IMAGES, HAIR_ABOUT_IMAGES } from "@/lib/hairImages";
import { Timestamp } from "firebase/firestore";

// Reusable component for the "editable later" hint
function EditableLaterHint() {
  return (
    <p className="text-sm text-slate-500 text-right mt-2 mb-4">
      אפשר לערוך הכל אחר כך בפאנל הניהול.
    </p>
  );
}

const SERVICE_OPTIONS: Record<SiteConfig["salonType"], string[]> = {
  hair: ["תספורת", "צבע", "פן", "החלקה", "טיפולי שיער"],
  nails: ["מניקור", "פדיקור", "לק ג׳ל", "בניית ציפורניים", "טיפול כף רגל"],
  barber: ["תספורת גברים", "עיצוב זקן", "תספורת ילדים"],
  spa: ["עיסוי", "טיפולי פנים", "טיפול גוף", "שיאצו", "רפלקסולוגיה"],
  mixed: [
    "תספורת",
    "צבע",
    "פן",
    "לק ג׳ל",
    "מניקור",
    "פדיקור",
    "עיסוי",
    "טיפולי פנים",
  ],
  other: ["שירות 1", "שירות 2"], // placeholders
};

export default function BuilderPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, authReady, loading: authLoading } = useAuth();
  
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
          // User has a siteId - redirect to admin (only if not already there)
          const targetPath = `/site/${userDoc.siteId}/admin`;
          if (pathname === targetPath) {
            // Already on target page, don't redirect
            if (process.env.NODE_ENV === "development") {
              console.log(`[BUILDER GUARD] Already on ${targetPath}, skipping redirect`);
            }
            return;
          }
          
          if (!didRedirect.current) {
            didRedirect.current = true;
            if (process.env.NODE_ENV === "development") {
              console.log(`[BUILDER GUARD] authReady=true, uid=${user.id}, siteId=${userDoc.siteId} -> redirect to ${targetPath}`, {
                currentPath: pathname
              });
            }
            router.replace(targetPath);
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
    // Initialize with random hero image and default about image
    const randomHeroIndex = Math.floor(Math.random() * HAIR_HERO_IMAGES.length);
    return {
      ...defaultSiteConfig,
      salonType: "hair",
      heroImage: HAIR_HERO_IMAGES[randomHeroIndex],
      aboutImage: HAIR_ABOUT_IMAGES[0],
    };
  });
  const [step, setStep] = useState(1);
  const [customService, setCustomService] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const totalSteps = 8;

  const updateConfig = (updates: Partial<SiteConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const isStepValid = (): boolean => {
    switch (step) {
      case 1:
        return config.salonName.trim() !== "";
      case 2:
        return !!(config.address && config.address.trim() !== "");
      case 3:
        return config.mainGoals.length > 0;
      case 4:
        return config.services.length > 0;
      case 5:
        return true; // vibe has a default value
      case 6:
        return true; // photosOption has a default value
      case 7: {
        const hasContact =
          (config.phoneNumber && config.phoneNumber.trim() !== "") ||
          (config.whatsappNumber && config.whatsappNumber.trim() !== "") ||
          (config.instagramHandle && config.instagramHandle.trim() !== "") ||
          (config.facebookPage && config.facebookPage.trim() !== "") ||
          (config.contactEmail && config.contactEmail.trim() !== "");

        if (!hasContact) return false;

        if (config.bookingOption === "booking_system") {
          return (
            typeof config.bookingSystemName === "string" &&
            config.bookingSystemName.trim() !== ""
          );
        }

        // simple_form or none are fine as long as we have at least one contact method
        return true;
      }
      case 8:
        return true; // Step 8 is optional
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (isStepValid() && step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleFinish = async () => {
    if (!config.salonName.trim()) return;

    if (!user) {
      setSaveError("משתמש לא מחובר. אנא רענן את הדף.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // Check if user already has a siteId
      const { getUserDocument } = await import("@/lib/firestoreUsers");
      const userDoc = await getUserDocument(user.id);
      
      if (userDoc?.siteId) {
        // User already has a site - redirect to it
        console.log(`[handleFinish] User already has siteId=${userDoc.siteId}, redirecting`);
        router.replace(`/site/${userDoc.siteId}/admin`);
        return;
      }

      // Convert selected services (strings) to SiteService objects
      const { saveSiteServices } = await import("@/lib/firestoreSiteServices");
      const siteServices = config.services.map((serviceName, index) => ({
        id: `svc_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
        name: serviceName,
        enabled: true,
        sortOrder: index,
      }));

      // Create new site from template with builder config
      const { createSiteFromTemplate } = await import("@/lib/firestoreSites");
      const newSiteId = await createSiteFromTemplate(user.id, config);
      
      // Save services to the new site
      await saveSiteServices(newSiteId, siteServices);
      
      // Update user document with siteId
      const { updateUserSiteId } = await import("@/lib/firestoreUsers");
      await updateUserSiteId(user.id, newSiteId);

      console.log(`[handleFinish] Created site ${newSiteId} for user ${user.id}`);

      if (process.env.NODE_ENV === "development") {
        console.log(`[handleFinish] Redirecting to /site/${newSiteId}/admin`);
      }

      // Also save to localStorage for backward compatibility
      if (typeof window !== "undefined") {
        // Save per-site config (using siteId as key)
        window.localStorage.setItem(
          `siteConfig:${newSiteId}`,
          JSON.stringify(config)
        );

        // Save per-site booking state (initialize with default if not exists)
        const existingBookingState = window.localStorage.getItem(`bookingState:${newSiteId}`);
        if (!existingBookingState) {
          window.localStorage.setItem(
            `bookingState:${newSiteId}`,
            JSON.stringify(defaultBookingState)
          );
        }
      }

      // Navigate to admin dashboard after wizard completion
      // Use replace to prevent going back to builder
      router.replace(`/site/${newSiteId}/admin`);
    } catch (err) {
      console.error("Failed to save site config to Firestore", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setSaveError(`שגיאה בשמירה: ${errorMessage}`);
      setIsSaving(false);
    }
  };

  const toggleService = (serviceName: string) => {
    const exists = config.services.includes(serviceName);
    if (exists) {
      updateConfig({
        services: config.services.filter((s) => s !== serviceName),
      });
    } else {
      updateConfig({
        services: [...config.services, serviceName],
      });
    }
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

  const addCustomService = () => {
    const customServiceTrimmed = customService.trim();
    if (customServiceTrimmed) {
      const exists = config.services.includes(customServiceTrimmed);
      if (!exists) {
        updateConfig({
          services: [...config.services, customServiceTrimmed],
        });
        setCustomService("");
      }
    }
  };


  const toggleExtraPage = (page: SiteConfig["extraPages"][number]) => {
    setConfig((prev) => {
      const extraPages = prev.extraPages.includes(page)
        ? prev.extraPages.filter((p) => p !== page)
        : [...prev.extraPages, page];
      return { ...prev, extraPages };
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

  const mainGoalLabels: Record<MainGoal, string> = {
    new_clients: "להביא לקוחות חדשים",
    online_booking: "לאפשר הזמנות אונליין",
    show_photos: "להציג תמונות ועבודות",
    info_only: "לתת מידע בסיסי בלבד",
  };

  const vibeLabels: Record<SiteConfig["vibe"], string> = {
    luxury: "סגנון יוקרתי",
    clean: "סגנון נקי ורך",
    colorful: "סגנון צבעוני וכיפי",
    spa: "לא בשימוש כרגע",
    surprise: "לא בשימוש כרגע",
  };

  const photosOptionLabels: Record<SiteConfig["photosOption"], string> = {
    own: "אני מעלה תמונות שלי",
    ai: "AI ייצור תמונות בשבילי",
    mixed: "שילוב של שניהם",
  };

  const bookingOptionLabels: Record<SiteConfig["bookingOption"], string> = {
    simple_form: "כן, אני רוצה הזמנות אונליין",
    none: "לא, בלי הזמנות אונליין כרגע",
    // keep booking_system in the type but we won't render it in the UI for now
    booking_system: "יש לי כבר מערכת הזמנות ואני רוצה לחבר אותה",
  };

  const extraPageLabels: Record<SiteConfig["extraPages"][number], string> = {
    reviews: "ביקורות מלקוחות",
    faq: "שאלות נפוצות",
  };


  // Show loading while auth initializes
  if (!authReady || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p className="text-slate-600">טוען...</p>
        </div>
      </div>
    );
  }

  // Show loading if redirecting
  if (user && user.siteId && didRedirect.current) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p className="text-slate-600">מעביר...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
        <div className="container mx-auto px-4 max-w-2xl">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 sm:p-8 mt-8 mb-16 text-right">
          {/* Step indicator */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-600">
                שלב {step} מתוך {totalSteps}
              </span>
              <Link
                href="/"
                className="text-sm text-sky-700 hover:text-sky-800 transition-colors"
              >
                חזרה לדף הבית
              </Link>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-sky-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Step 1 - Basic details */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                פרטים בסיסיים
              </h2>
              <EditableLaterHint />
              <div>
                <label
                  htmlFor="salonName"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  שם הסלון *
                </label>
                <input
                  type="text"
                  id="salonName"
                  value={config.salonName}
                  onChange={(e) => updateConfig({ salonName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  placeholder="הזן את שם הסלון"
                />
              </div>
              <div>
                <label
                  htmlFor="salonType"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  איזה סוג סלון? *
                </label>
                <select
                  id="salonType"
                  value="hair"
                  onChange={() => {}}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-slate-100 cursor-not-allowed"
                >
                  <option value="hair">מספרת שיער</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 2 - Location */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">מיקום</h2>
              <EditableLaterHint />
              <div>
                <label
                  htmlFor="address"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  כתובת *
                </label>
                <input
                  type="text"
                  id="address"
                  value={config.address || ""}
                  onChange={(e) => updateConfig({ address: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  placeholder="למשל: רחוב בן יהודה 10, תל אביב"
                  required
                />
                <p className="text-xs text-slate-500 mt-1 text-right">
                  הכתובת תוצג במפה באתר. אם לא מוגדר, המפה לא תוצג.
                </p>
              </div>
            </div>
          )}

          {/* Step 3 - Main goal */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                מה המטרה העיקרית של האתר? *
              </h2>
              <EditableLaterHint />
              <div className="space-y-3">
                {(Object.keys(mainGoalLabels) as MainGoal[]).map((goal) => (
                  <label
                    key={goal}
                    className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={config.mainGoals.includes(goal)}
                      onChange={() => toggleMainGoal(goal)}
                      className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                    />
                    <span className="text-slate-700">{mainGoalLabels[goal]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 4 - Services */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                איזה שירותים יש בסלון? *
              </h2>
              <EditableLaterHint />
              <div className="space-y-3">
                {(SERVICE_OPTIONS[config.salonType] ?? []).map((serviceName) => {
                  const isChecked = config.services.includes(serviceName);
                  return (
                    <label
                      key={serviceName}
                      className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleService(serviceName)}
                        className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                      />
                      <span className="text-slate-700">{serviceName}</span>
                    </label>
                  );
                })}
              </div>
              <div className="pt-4 border-t border-slate-200">
                <label
                  htmlFor="customService"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  אחר (הוסף שירות מותאם אישית)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="customService"
                    value={customService}
                    onChange={(e) => setCustomService(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomService();
                      }
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="הזן שירות נוסף"
                  />
                  <button
                    type="button"
                    onClick={addCustomService}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium transition-colors"
                  >
                    הוסף
                  </button>
                </div>
                {config.services.filter(
                  (s) => !(SERVICE_OPTIONS[config.salonType] ?? []).includes(s)
                ).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {config.services
                      .filter(
                        (s) => !(SERVICE_OPTIONS[config.salonType] ?? []).includes(s)
                      )
                      .map((service) => (
                        <span
                          key={service}
                          className="inline-flex items-center gap-2 px-3 py-1 bg-sky-100 text-sky-700 rounded-full text-sm"
                        >
                          <span>{service}</span>
                          <button
                            type="button"
                            onClick={() => toggleService(service)}
                            className="hover:text-sky-900"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 5 - Style / Vibe */}
          {step === 5 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                איזה סגנון אתר אתה רוצה?
              </h2>
              <EditableLaterHint />
              <div className="space-y-3">
                {(["luxury", "clean", "colorful"] as Array<keyof typeof vibeLabels>).map(
                  (vibe) => (
                    <label
                      key={vibe}
                      className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
                    >
                      <input
                        type="radio"
                        name="vibe"
                        value={vibe}
                        checked={config.vibe === vibe}
                        onChange={(e) =>
                          updateConfig({
                            vibe: e.target.value as SiteConfig["vibe"],
                          })
                        }
                        className="w-4 h-4 text-sky-500 focus:ring-sky-500"
                      />
                      <span className="text-slate-700">{vibeLabels[vibe]}</span>
                    </label>
                  )
                )}
              </div>
            </div>
          )}

          {/* Step 6 - Photos */}
          {step === 6 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                מה לגבי תמונות?
              </h2>
              <EditableLaterHint />
              <div className="space-y-3">
                {(
                  Object.keys(photosOptionLabels) as Array<
                    keyof typeof photosOptionLabels
                  >
                ).map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
                  >
                    <input
                      type="radio"
                      name="photosOption"
                      value={option}
                      checked={config.photosOption === option}
                      onChange={(e) =>
                        updateConfig({
                          photosOption: e.target.value as SiteConfig["photosOption"],
                        })
                      }
                      className="w-4 h-4 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-slate-700">
                      {photosOptionLabels[option]}
                    </span>
                  </label>
                ))}
              </div>
              {(config.photosOption === "own" ||
                config.photosOption === "mixed") && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <label className="block text-sm font-medium mb-2 text-right text-slate-700">
                    העלאת תמונות מהסלון
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="w-full text-sm text-slate-700 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 file:cursor-pointer"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setPhotoFiles(files);
                    }}
                  />
                  {photoFiles.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500 text-right">
                      נבחרו {photoFiles.length} קבצים.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 7 - Contact & booking */}
          {step === 7 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                איך לקוחות יכולים ליצור קשר? *
              </h2>
              <EditableLaterHint />
              
              {/* Contact details */}
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="phoneNumber"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    מספר טלפון להצגה באתר
                  </label>
                  <input
                    type="text"
                    id="phoneNumber"
                    value={config.phoneNumber || ""}
                    onChange={(e) => updateConfig({ phoneNumber: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="למשל: 050-1234567"
                  />
                </div>

                <div>
                  <label
                    htmlFor="whatsappNumber"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    מספר וואטסאפ
                  </label>
                  <input
                    type="text"
                    id="whatsappNumber"
                    value={config.whatsappNumber || ""}
                    onChange={(e) => updateConfig({ whatsappNumber: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="למשל: 050-1234567"
                  />
                </div>

                <div>
                  <label
                    htmlFor="instagramHandle"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    אינסטגרם
                  </label>
                  <input
                    type="text"
                    id="instagramHandle"
                    value={config.instagramHandle || ""}
                    onChange={(e) => updateConfig({ instagramHandle: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="למשל: salon_beauty"
                  />
                </div>

                <div>
                  <label
                    htmlFor="facebookPage"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    עמוד פייסבוק
                  </label>
                  <input
                    type="text"
                    id="facebookPage"
                    value={config.facebookPage || ""}
                    onChange={(e) => updateConfig({ facebookPage: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="למשל: https://facebook.com/your-salon"
                  />
                </div>

                <div>
                  <label
                    htmlFor="contactEmail"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    אימייל לקבלת פניות מהטופס
                  </label>
                  <input
                    type="email"
                    id="contactEmail"
                    value={config.contactEmail || ""}
                    onChange={(e) => updateConfig({ contactEmail: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  האם תרצה הזמנות אונליין?
                </h3>
                <div className="space-y-3">
                  {(["simple_form", "none"] as Array<keyof typeof bookingOptionLabels>).map(
                    (option) => (
                      <label
                        key={option}
                        className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
                      >
                        <input
                          type="radio"
                          name="bookingOption"
                          value={option}
                          checked={config.bookingOption === option}
                          onChange={(e) =>
                            updateConfig({
                              bookingOption: e.target.value as SiteConfig["bookingOption"],
                            })
                          }
                          className="w-4 h-4 text-sky-500 focus:ring-sky-500"
                        />
                        <span className="text-slate-700">
                          {bookingOptionLabels[option]}
                        </span>
                      </label>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 8 - Extra pages and note */}
          {step === 8 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                איזה עמודים נוספים תרצה באתר?
              </h2>
              <EditableLaterHint />
              <div className="space-y-3">
                {(
                  Object.keys(extraPageLabels) as Array<
                    keyof typeof extraPageLabels
                  >
                ).map((page) => (
                  <label
                    key={page}
                    className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={config.extraPages.includes(page)}
                      onChange={() => toggleExtraPage(page)}
                      className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
                    />
                    <span className="text-slate-700">
                      {extraPageLabels[page]}
                    </span>
                  </label>
                ))}
              </div>

              <div className="pt-6 border-t border-slate-200">
                <label
                  htmlFor="specialNote"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  משהו מיוחד שחשוב לך שיכתבו על הסלון?
                </label>
                <textarea
                  id="specialNote"
                  value={config.specialNote || ""}
                  onChange={(e) =>
                    updateConfig({ specialNote: e.target.value })
                  }
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
                  placeholder="כתוב כאן הערות או פרטים מיוחדים..."
                />
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="mt-8 pt-6 border-t border-slate-200 flex justify-between gap-4">
            <button
              onClick={handleBack}
              disabled={step === 1}
              className="px-6 py-3 border border-sky-200 text-sky-700 hover:bg-sky-50 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              חזור
            </button>
            {step < totalSteps ? (
              <button
                onClick={handleNext}
                disabled={!isStepValid()}
                className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                המשך
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={isSaving}
                className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "שומר…" : "צור תצוגה מקדימה לאתר"}
              </button>
            )}
          </div>

          {/* Save error message */}
          {saveError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          )}

          {/* Validation error message */}
          {!isStepValid() && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-right">
              <p className="text-sm text-red-700">
                יש למלא את כל השדות החובה לפני המשך
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
