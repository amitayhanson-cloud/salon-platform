"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ymdLocal } from "@/lib/dateLocal";
import type { SiteConfig, MainGoal } from "@/types/siteConfig";
import { defaultSiteConfig } from "@/types/siteConfig";
import type { SalonBookingState } from "@/types/booking";
import { defaultBookingState } from "@/types/booking";
import { saveSiteConfig } from "@/lib/firestoreSiteConfig";
import { bookingEnabled } from "@/lib/bookingEnabled";
import { normalizeServices } from "@/lib/normalizeServices";
import { defaultThemeColors } from "@/types/siteConfig";
import { HAIR_HERO_IMAGES, HAIR_ABOUT_IMAGES } from "@/lib/hairImages";
import { pickNewImage } from "@/lib/pickNewImage";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import Image from "next/image";
import AIFloatingWidget from "@/components/admin/AIFloatingWidget";

type AdminTab = "site" | "colors" | "images" | "dividers" | "salary";

export default function SalonAdminPage() {
  const params = useParams();
  const siteId = params?.siteId as string;

  const [activeTab, setActiveTab] = useState<AdminTab>("site");
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [bookingState, setBookingState] = useState<SalonBookingState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Load config and booking state per site
  useEffect(() => {
    if (typeof window === "undefined" || !siteId) return;

    // SiteConfig per site
    try {
      const raw = window.localStorage.getItem(`siteConfig:${siteId}`);
      if (raw) {
        const loaded = JSON.parse(raw);
        // Migrate from old ServiceItem[] format to new string[] format
        if (loaded.services && Array.isArray(loaded.services) && loaded.services.length > 0) {
          const firstService = loaded.services[0];
          if (typeof firstService === 'object' && firstService.name) {
            // Old format: ServiceItem[]
            const serviceNames = normalizeServices(
              loaded.services.map((s: any) => s.name).filter(Boolean)
            );
            const servicePricing: Record<string, number> = {};
            // Migrate prices from ServiceItem.price to servicePricing
            for (const s of loaded.services) {
              if (s.name && s.price && s.price > 0) {
                const normalizedName = String(s.name).trim();
                if (serviceNames.includes(normalizedName)) {
                  servicePricing[normalizedName] = s.price;
                }
              }
            }
            loaded.services = serviceNames;
            loaded.servicePricing = { ...(loaded.servicePricing || {}), ...servicePricing };
          }
        }
        const merged = { ...defaultSiteConfig, ...loaded };
        // Ensure themeColors has defaults
        if (!merged.themeColors) {
          merged.themeColors = defaultThemeColors;
        }
        setSiteConfig(merged);
      } else {
        setSiteConfig(defaultSiteConfig);
      }
    } catch (e) {
      console.error("Failed to parse siteConfig for admin", e);
      setSiteConfig(defaultSiteConfig);
    }

    // Booking state per site
    try {
      const bookingRaw = window.localStorage.getItem(`bookingState:${siteId}`);
      if (bookingRaw) {
        setBookingState(JSON.parse(bookingRaw));
      } else {
        setBookingState(defaultBookingState);
      }
    } catch (e) {
      console.error("Failed to parse booking state for admin", e);
      setBookingState(defaultBookingState);
    }
  }, [siteId]);

  const handleConfigChange = (updates: Partial<SiteConfig>) => {
    setSiteConfig((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  const saveBookingState = (next: SalonBookingState) => {
    setBookingState(next);
    if (typeof window !== "undefined" && siteId) {
      window.localStorage.setItem(`bookingState:${siteId}`, JSON.stringify(next));
    }
  };

  const handleSaveConfig = async () => {
    if (!siteConfig || typeof window === "undefined" || !siteId) return;
    setIsSaving(true);
    setSaveMessage("");

    try {
      console.log("[Admin] saving to siteId", siteId);

      // Normalize field names (handle any legacy field names)
      const siteConfigAny = siteConfig as any;
      const normalizedReviews = siteConfig.reviews ?? siteConfigAny.reviewItems ?? siteConfigAny.customerReviews ?? [];
      const normalizedFaqs = siteConfig.faqs ?? siteConfigAny.faqItems ?? [];

      // Auto-add "reviews" to extraPages if reviews exist
      // Auto-add "faq" to extraPages if faqs exist
      const extraPages = new Set(siteConfig.extraPages ?? []);
      if ((normalizedReviews.length ?? 0) > 0) {
        extraPages.add("reviews");
      }
      if ((normalizedFaqs.length ?? 0) > 0) {
        extraPages.add("faq");
      }
      
      // Normalize services: trim, remove blanks, dedupe preserving order
      const currentServices = siteConfig.services || [];
      const serviceNames = normalizeServices(
        currentServices.map((s) => typeof s === 'string' ? s : (s as any).name)
      );
      
      // Build servicePricing map - only include pricing for services that exist
      // Keys must match services, delete pricing entries for removed services
      const servicePricing: Record<string, number> = {};
      const existingPricing = siteConfig.servicePricing || {};
      
      // Only include pricing for services in the normalized list
      // This ensures pricing keys match services and removes pricing for deleted services
      for (const serviceName of serviceNames) {
        // First, try to get price from existing servicePricing
        if (existingPricing[serviceName] !== undefined) {
          servicePricing[serviceName] = existingPricing[serviceName];
        } else {
          // Fallback: migrate from ServiceItem format if servicePricing doesn't have it
          if (currentServices.length > 0 && typeof currentServices[0] === 'object') {
            for (const s of currentServices) {
              const name = typeof s === 'string' ? s : (s as any).name;
              if (name && name.trim() === serviceName) {
                const price = typeof s === 'object' ? ((s as any).price || 0) : 0;
                if (price > 0) {
                  servicePricing[serviceName] = price;
                }
              }
            }
          }
        }
      }
      
      const updatedConfig: SiteConfig = {
        ...siteConfig,
        services: serviceNames,
        servicePricing: servicePricing,
        reviews: normalizedReviews,
        faqs: normalizedFaqs,
        extraPages: Array.from(extraPages),
      };

      // Remove any legacy field names
      delete (updatedConfig as any).reviewItems;
      delete (updatedConfig as any).customerReviews;
      delete (updatedConfig as any).faqItems;

      console.log("[Admin] saving reviews count", updatedConfig.reviews?.length ?? 0);
      console.log("[Admin] saving reviews payload", updatedConfig.reviews);
      console.log("[Admin] saved config reviews/faqs counts",
        updatedConfig.reviews?.length ?? 0,
        updatedConfig.faqs?.length ?? 0
      );

      // Save to Firestore (single source of truth)
      await saveSiteConfig(siteId, updatedConfig);

      // Also save to localStorage for offline/fallback
      window.localStorage.setItem(
        `siteConfig:${siteId}`,
        JSON.stringify(updatedConfig)
      );

      if (bookingState) {
        window.localStorage.setItem(
          `bookingState:${siteId}`,
          JSON.stringify(bookingState)
        );
      }

      // Update local state
      setSiteConfig(updatedConfig);

      setSaveMessage("השינויים נשמרו בהצלחה");
    } catch (e) {
      console.error("Failed to save admin state", e);
      setSaveMessage("אירעה שגיאה בשמירה");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(""), 2500);
    }
  };

  // Check for validation errors in services
  const hasServiceValidationErrors = (() => {
    const services = siteConfig?.services || [];
    if (!Array.isArray(services)) return true;
    
    const serviceNames = services
      .map((s) => typeof s === 'string' ? s : (s as any).name || '')
      .map((s) => s.trim())
      .filter(Boolean);
    
    // Check for empty names
    if (serviceNames.length !== services.length) return true;
    
    // Check for duplicates
    const lowerNames = serviceNames.map(n => n.toLowerCase());
    return new Set(lowerNames).size !== lowerNames.length;
  })();

  if (!siteConfig || !bookingState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600 text-sm">טוען את נתוני הסלון…</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-sky-500 text-white flex items-center justify-center font-bold text-lg">
              {siteConfig.salonName ? siteConfig.salonName[0] : "ס"}
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-900">
                פאנל ניהול לסלון
              </div>
              <div className="text-xs text-slate-500">
                {siteConfig.salonName || "שם הסלון"} ·{" "}
                {siteConfig.city || "עיר לא מוגדרת"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {saveMessage && (
              <span className="text-xs text-emerald-600">{saveMessage}</span>
            )}
            <button
              onClick={handleSaveConfig}
              disabled={isSaving || hasServiceValidationErrors}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {isSaving ? "שומר…" : "שמור שינויים"}
            </button>
            {hasServiceValidationErrors && (
              <span className="text-xs text-red-600">יש שגיאות בשירותים - אנא תקן לפני שמירה</span>
            )}
            <Link
              href={`/site/${siteId}`}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              חזרה לאתר
            </Link>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[220px,1fr] gap-6">
          {/* Sidebar tabs */}
          <aside className="bg-white rounded-2xl border border-slate-200 p-4">
            <nav className="space-y-2 text-right">
              <button
                onClick={() => setActiveTab("site")}
                className={`w-full text-sm rounded-lg px-3 py-2 text-right ${
                  activeTab === "site"
                    ? "bg-sky-50 text-sky-700 font-semibold border border-sky-200"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                האתר שלי
              </button>
              {bookingEnabled(siteConfig) && (
                <Link
                  href={`/site/${siteId}/admin/bookings`}
                  className="w-full text-sm rounded-lg px-3 py-2 text-right text-slate-700 hover:bg-slate-50 block"
                >
                  ניהול הזמנות
                </Link>
              )}
              <button
                onClick={() => setActiveTab("colors")}
                className={`w-full text-sm rounded-lg px-3 py-2 text-right ${
                  activeTab === "colors"
                    ? "bg-sky-50 text-sky-700 font-semibold border border-sky-200"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                צבעים
              </button>
              <button
                onClick={() => setActiveTab("images")}
                className={`w-full text-sm rounded-lg px-3 py-2 text-right ${
                  activeTab === "images"
                    ? "bg-sky-50 text-sky-700 font-semibold border border-sky-200"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                תמונות
              </button>
              <button
                onClick={() => setActiveTab("salary")}
                className={`w-full text-sm rounded-lg px-3 py-2 text-right ${
                  activeTab === "salary"
                    ? "bg-sky-50 text-sky-700 font-semibold border border-sky-200"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                שכר
              </button>
            </nav>
          </aside>

          {/* Active tab content */}
          <section className="space-y-6">
            {activeTab === "site" && (
              <AdminSiteTab
                siteConfig={siteConfig}
                onChange={handleConfigChange}
              />
            )}

            {activeTab === "colors" && (
              <AdminColorsTab
                siteConfig={siteConfig}
                onChange={handleConfigChange}
                onSave={handleSaveConfig}
                isSaving={isSaving}
              />
            )}

            {activeTab === "images" && (
              <AdminImagesTab
                siteConfig={siteConfig}
                siteId={siteId}
                onChange={handleConfigChange}
              />
            )}

            {activeTab === "dividers" && (
              <AdminDividersTab
                siteConfig={siteConfig}
                siteId={siteId}
                onChange={handleConfigChange}
                onSave={handleSaveConfig}
                isSaving={isSaving}
              />
            )}

            {activeTab === "salary" && <AdminSalaryTab />}
          </section>
        </div>
      </main>

      {/* AI Floating Widget */}
      <AIFloatingWidget siteId={siteId} />
    </div>
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
  other: [],
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
  booking_system: "יש לי כבר מערכת הזמנות ואני רוצה לחבר אותה",
};

const extraPageLabels: Record<SiteConfig["extraPages"][number], string> = {
  reviews: "ביקורות מלקוחות",
  faq: "שאלות נפוצות",
};

const salonTypeLabels: Record<SiteConfig["salonType"], string> = {
  hair: "ספרות / עיצוב שיער",
  nails: "מניקור / פדיקור",
  barber: "ברברשופ",
  spa: "ספא / טיפולי גוף",
  mixed: "משולב",
  other: "אחר",
};

function AdminSiteTab({
  siteConfig,
  onChange,
}: {
  siteConfig: SiteConfig;
  onChange: (updates: Partial<SiteConfig>) => void;
}) {
  // Convert services to string[] format if needed (backwards compatibility)
  const currentServices = Array.isArray(siteConfig.services) 
    ? siteConfig.services.map((s) => typeof s === 'string' ? s : (s as any).name || '').filter(Boolean)
    : [];
  
  const currentPricing = siteConfig.servicePricing || {};
  
  // Local state for services editing - track by index to handle renames
  const [serviceRows, setServiceRows] = useState<Array<{ id: string; name: string; price: number }>>(() => {
    return currentServices.map((name, idx) => ({
      id: `service-${idx}-${name}`, // Stable ID based on index and name
      name: name,
      price: currentPricing[name] || 0,
    }));
  });

  // Track if we're updating internally to avoid sync loops
  const [isInternalUpdate, setIsInternalUpdate] = useState(false);

  // Sync with siteConfig changes only when it changes externally (not from our updates)
  useEffect(() => {
    if (isInternalUpdate) {
      setIsInternalUpdate(false);
      return;
    }
    const normalized = normalizeServices(currentServices);
    const rows = normalized.map((name, idx) => ({
      id: `service-${idx}-${name}`,
      name: name,
      price: currentPricing[name] || 0,
    }));
    setServiceRows(rows);
  }, [siteConfig.services, siteConfig.servicePricing]);

  const updateServiceRow = (index: number, updates: { name?: string; price?: number }) => {
    setIsInternalUpdate(true);
    const newRows = [...serviceRows];
    const oldRow = newRows[index];
    const newRow = { ...oldRow, ...updates };
    newRows[index] = newRow;
    setServiceRows(newRows);
    
    // Update siteConfig immediately
    const normalizedServices = normalizeServices(newRows.map(r => r.name.trim()).filter(Boolean));
    const newPricing: Record<string, number> = {};
    
    // Map prices: if renamed, carry over price by index
    newRows.forEach((row, idx) => {
      const trimmedName = row.name.trim();
      if (trimmedName) {
        // If this is a rename (same index), carry over the old price
        if (idx === index && oldRow.name !== trimmedName && oldRow.price > 0) {
          newPricing[trimmedName] = updates.price !== undefined ? updates.price : oldRow.price;
        } else {
          newPricing[trimmedName] = row.price || 0;
        }
      }
    });
    
    onChange({
      services: normalizedServices,
      servicePricing: newPricing,
    });
  };

  const removeService = (index: number) => {
    setIsInternalUpdate(true);
    const newRows = serviceRows.filter((_, idx) => idx !== index);
    setServiceRows(newRows);
    
    const normalizedServices = normalizeServices(newRows.map(r => r.name.trim()).filter(Boolean));
    const newPricing: Record<string, number> = {};
    newRows.forEach((row) => {
      const trimmedName = row.name.trim();
      if (trimmedName) {
        newPricing[trimmedName] = row.price || 0;
      }
    });
    
    onChange({
      services: normalizedServices,
      servicePricing: newPricing,
    });
  };

  const addService = () => {
    setIsInternalUpdate(true);
    const newRows = [...serviceRows, { id: `service-${Date.now()}`, name: '', price: 0 }];
    setServiceRows(newRows);
    // Update siteConfig to include empty row for validation
    // Include empty strings so validation can catch them
    onChange({
      services: newRows.map(r => r.name),
      servicePricing: (() => {
        const pricing: Record<string, number> = {};
        newRows.forEach(row => {
          if (row.name.trim()) {
            pricing[row.name.trim()] = row.price || 0;
          }
        });
        return pricing;
      })(),
    });
  };

  // Validation
  const hasEmptyNames = serviceRows.some(r => !r.name.trim());
  const serviceNames = serviceRows.map(r => r.name.trim().toLowerCase()).filter(Boolean);
  const hasDuplicates = new Set(serviceNames).size !== serviceNames.length;

  const toggleExtraPage = (page: SiteConfig["extraPages"][number]) => {
    const exists = siteConfig.extraPages.includes(page);
    onChange({
      extraPages: exists
        ? siteConfig.extraPages.filter((p) => p !== page)
        : [...siteConfig.extraPages, page],
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-6">
      <h1 className="text-xl font-bold text-slate-900 mb-2">
        הגדרות אתר - כל השדות
      </h1>
      <p className="text-xs text-slate-500 mb-4">
        כאן תוכל לעדכן את כל הפרטים שהזנת בשאלון.
      </p>

      {/* Basic Details */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <h2 className="text-sm font-semibold text-slate-900">פרטים בסיסיים</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              שם הסלון *
            </label>
            <input
              type="text"
              value={siteConfig.salonName}
              onChange={(e) => onChange({ salonName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="הקלד את שם הסלון"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              סוג סלון
            </label>
            <select
              value={siteConfig.salonType}
              onChange={(e) =>
                onChange({ salonType: e.target.value as SiteConfig["salonType"] })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white"
            >
              {Object.entries(salonTypeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <h2 className="text-sm font-semibold text-slate-900">מיקום</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              עיר *
            </label>
            <input
              type="text"
              value={siteConfig.city}
              onChange={(e) => onChange({ city: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="למשל: תל אביב"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              שכונה (לא חובה)
            </label>
            <input
              type="text"
              value={siteConfig.neighborhood || ""}
              onChange={(e) => onChange({ neighborhood: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="הזן את שם השכונה"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            כתובת מלאה (להצגה במפה)
          </label>
          <input
            type="text"
            value={siteConfig.address || ""}
            onChange={(e) => onChange({ address: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            placeholder="למשל: רחוב בן יהודה 10, תל אביב"
          />
          <p className="text-xs text-slate-500 mt-1 text-right">
            הכתובת הזו תשמש למפה ולכפתור Waze. אם לא מוגדר, ייעשה שימוש בעיר ושכונה.
          </p>
        </div>
      </div>

      {/* Services */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-900">שירותים</h2>
          <button
            type="button"
            onClick={addService}
            className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-xs font-medium transition-colors"
          >
            הוסף שירות
          </button>
        </div>

        {/* Validation errors */}
        {(hasEmptyNames || hasDuplicates) && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
            {hasEmptyNames && (
              <p className="text-xs text-red-700 mb-1">יש למלא שם לכל השירותים</p>
            )}
            {hasDuplicates && (
              <p className="text-xs text-red-700">יש שירותים כפולים. אנא הסר כפילויות</p>
            )}
          </div>
        )}

        {/* Service rows */}
        <div className="space-y-3">
          {serviceRows.map((row, index) => (
            <div
              key={row.id}
              className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg bg-white hover:border-slate-300 transition-colors"
            >
              {/* Service name input */}
              <input
                type="text"
                value={row.name}
                onChange={(e) => updateServiceRow(index, { name: e.target.value })}
                className={`flex-1 rounded-lg border px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 ${
                  !row.name.trim()
                    ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                    : "border-slate-300 focus:ring-sky-500 focus:border-sky-500"
                }`}
                placeholder="שם השירות"
              />

              {/* Price input - aligned to the left */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-slate-500 whitespace-nowrap">החל מ־₪</span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={row.price || ""}
                  onChange={(e) => updateServiceRow(index, { price: Number(e.target.value) || 0 })}
                  className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  placeholder="0"
                />
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeService(index)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                title="הסר שירות"
              >
                ×
              </button>
            </div>
          ))}

          {serviceRows.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-4">
              אין שירותים. לחץ על "הוסף שירות" כדי להתחיל
            </p>
          )}
        </div>
      </div>

      {/* Vibe / Style */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <h2 className="text-sm font-semibold text-slate-900">סגנון אתר</h2>
        <div className="space-y-2">
          {(["luxury", "clean", "colorful"] as Array<keyof typeof vibeLabels>).map(
            (vibe) => (
              <label
                key={vibe}
                className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
              >
                <input
                  type="radio"
                  name="vibe"
                  value={vibe}
                  checked={siteConfig.vibe === vibe}
                  onChange={(e) =>
                    onChange({ vibe: e.target.value as SiteConfig["vibe"] })
                  }
                  className="w-4 h-4 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-sm text-slate-700">{vibeLabels[vibe]}</span>
              </label>
            )
          )}
        </div>
      </div>

      {/* Photos Option */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <h2 className="text-sm font-semibold text-slate-900">אפשרויות תמונות</h2>
        <div className="space-y-2">
          {(
            Object.keys(photosOptionLabels) as Array<
              keyof typeof photosOptionLabels
            >
          ).map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
            >
              <input
                type="radio"
                name="photosOption"
                value={option}
                checked={siteConfig.photosOption === option}
                onChange={(e) =>
                  onChange({
                    photosOption: e.target.value as SiteConfig["photosOption"],
                  })
                }
                className="w-4 h-4 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-sm text-slate-700">
                {photosOptionLabels[option]}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Contact Details */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <h2 className="text-sm font-semibold text-slate-900">פרטי יצירת קשר</h2>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="adminPhoneNumber"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              מספר טלפון להצגה באתר
            </label>
            <input
              id="adminPhoneNumber"
              type="text"
              value={siteConfig.phoneNumber || ""}
              onChange={(e) => onChange({ phoneNumber: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="למשל: 050-1234567"
            />
          </div>

          <div>
            <label
              htmlFor="adminWhatsappNumber"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              מספר וואטסאפ
            </label>
            <input
              id="adminWhatsappNumber"
              type="text"
              value={siteConfig.whatsappNumber || ""}
              onChange={(e) => onChange({ whatsappNumber: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="למשל: 050-1234567"
            />
          </div>

          <div>
            <label
              htmlFor="adminInstagramHandle"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              אינסטגרם
            </label>
            <input
              id="adminInstagramHandle"
              type="text"
              value={siteConfig.instagramHandle || ""}
              onChange={(e) => onChange({ instagramHandle: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="למשל: salon_beauty"
            />
          </div>

          <div>
            <label
              htmlFor="adminFacebookPage"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              עמוד פייסבוק
            </label>
            <input
              id="adminFacebookPage"
              type="text"
              value={siteConfig.facebookPage || ""}
              onChange={(e) => onChange({ facebookPage: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="למשל: https://facebook.com/your-salon"
            />
          </div>

          <div>
            <label
              htmlFor="adminContactEmail"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              אימייל לקבלת פניות מהטופס
            </label>
            <input
              id="adminContactEmail"
              type="email"
              value={siteConfig.contactEmail || ""}
              onChange={(e) => onChange({ contactEmail: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="name@example.com"
            />
          </div>
        </div>
      </div>

      {/* Booking Option */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <h2 className="text-sm font-semibold text-slate-900">הזמנות אונליין</h2>
        <div className="space-y-2">
          {(["simple_form", "none", "booking_system"] as Array<
            keyof typeof bookingOptionLabels
          >).map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
            >
              <input
                type="radio"
                name="bookingOption"
                value={option}
                checked={siteConfig.bookingOption === option}
                onChange={(e) =>
                  onChange({
                    bookingOption: e.target.value as SiteConfig["bookingOption"],
                  })
                }
                className="w-4 h-4 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-sm text-slate-700">
                {bookingOptionLabels[option]}
              </span>
            </label>
          ))}
        </div>
        {siteConfig.bookingOption === "booking_system" && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              שם מערכת ההזמנות *
            </label>
            <input
              type="text"
              value={siteConfig.bookingSystemName || ""}
              onChange={(e) =>
                onChange({ bookingSystemName: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="למשל: Calendly, Acuity"
            />
          </div>
        )}
      </div>

      {/* Extra Pages */}
      <div className="space-y-4 border-b border-slate-200 pb-6">
        <h2 className="text-sm font-semibold text-slate-900">עמודים נוספים</h2>
        <div className="space-y-2">
          {(
            Object.keys(extraPageLabels) as Array<keyof typeof extraPageLabels>
          ).map((page) => (
            <label
              key={page}
              className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-sky-300 hover:bg-sky-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={siteConfig.extraPages.includes(page)}
                onChange={() => toggleExtraPage(page)}
                className="w-4 h-4 text-sky-500 rounded focus:ring-sky-500"
              />
              <span className="text-sm text-slate-700">
                {extraPageLabels[page]}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Special Note */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">הערה מיוחדת</h2>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            משהו מיוחד שחשוב שיכתבו על הסלון?
          </label>
          <textarea
            value={siteConfig.specialNote || ""}
            onChange={(e) => onChange({ specialNote: e.target.value })}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
            placeholder="כתוב כאן הערות או פרטים מיוחדים..."
          />
        </div>
      </div>

      {/* Reviews Editor */}
      {siteConfig.extraPages.includes("reviews") && (
        <div className="space-y-4 border-t border-slate-200 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">ביקורות</h2>
          <AdminReviewsEditor
            reviews={siteConfig.reviews || []}
            onChange={(reviews) => onChange({ reviews })}
          />
        </div>
      )}

      {/* FAQ Editor */}
      {siteConfig.extraPages.includes("faq") && (
        <div className="space-y-4 border-t border-slate-200 pt-6">
          <h2 className="text-sm font-semibold text-slate-900">שאלות נפוצות</h2>
          <AdminFaqEditor
            faqs={siteConfig.faqs || []}
            onChange={(faqs) => onChange({ faqs })}
          />
        </div>
      )}
    </div>
  );
}

// Helper function to generate stable IDs
function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Reviews Editor Component
function AdminReviewsEditor({
  reviews,
  onChange,
}: {
  reviews: import("@/types/siteConfig").ReviewItem[];
  onChange: (reviews: import("@/types/siteConfig").ReviewItem[]) => void;
}) {
  const [newReview, setNewReview] = useState({
    name: "",
    rating: 5,
    text: "",
    avatarUrl: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editReview, setEditReview] = useState({
    name: "",
    rating: 5,
    text: "",
    avatarUrl: "",
  });

  const handleAdd = () => {
    if (!newReview.name.trim() || !newReview.text.trim()) return;
    onChange([
      ...reviews,
      {
        id: generateId(),
        name: newReview.name.trim(),
        rating: newReview.rating,
        text: newReview.text.trim(),
        avatarUrl: newReview.avatarUrl.trim() || null,
      },
    ]);
    setNewReview({ name: "", rating: 5, text: "", avatarUrl: "" });
  };

  const handleEdit = (id: string) => {
    const review = reviews.find((r) => r.id === id);
    if (review) {
      setEditingId(id);
      setEditReview({
        name: review.name,
        rating: review.rating,
        text: review.text,
        avatarUrl: review.avatarUrl || "",
      });
    }
  };

  const handleSaveEdit = () => {
    if (!editingId || !editReview.name.trim() || !editReview.text.trim()) return;
    onChange(
      reviews.map((r) =>
        r.id === editingId
          ? {
              id: r.id,
              name: editReview.name.trim(),
              rating: editReview.rating,
              text: editReview.text.trim(),
              avatarUrl: editReview.avatarUrl.trim() || null,
            }
          : r
      )
    );
    setEditingId(null);
    setEditReview({ name: "", rating: 5, text: "", avatarUrl: "" });
  };

  const handleDelete = (id: string) => {
    onChange(reviews.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Add new review form */}
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
        <h3 className="text-xs font-semibold text-slate-700">הוסף ביקורת חדשה</h3>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            שם הלקוח *
          </label>
          <input
            type="text"
            value={newReview.name}
            onChange={(e) => setNewReview({ ...newReview, name: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="הזן שם לקוח"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            דירוג (1-5) *
          </label>
          <select
            value={newReview.rating}
            onChange={(e) =>
              setNewReview({ ...newReview, rating: Number(e.target.value) })
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} כוכבים
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            טקסט הביקורת *
          </label>
          <textarea
            value={newReview.text}
            onChange={(e) => setNewReview({ ...newReview, text: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            placeholder="הזן את טקסט הביקורת"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            תמונת פרופיל (URL)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newReview.avatarUrl}
              onChange={(e) => setNewReview({ ...newReview, avatarUrl: e.target.value })}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="https://example.com/image.jpg"
            />
            {newReview.avatarUrl.trim() && (
              <div className="flex-shrink-0">
                <img
                  src={newReview.avatarUrl.trim()}
                  alt="Preview"
                  className="w-12 h-12 rounded-full object-cover border border-slate-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium"
        >
          הוסף ביקורת
        </button>
      </div>

      {/* Existing reviews list */}
      {reviews.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">
          אין ביקורות עדיין. הוסף ביקורת ראשונה למעלה.
        </p>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="p-4 border border-slate-200 rounded-lg bg-white"
            >
              {editingId === review.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editReview.name}
                    onChange={(e) =>
                      setEditReview({ ...editReview, name: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="שם הלקוח"
                  />
                  <select
                    value={editReview.rating}
                    onChange={(e) =>
                      setEditReview({ ...editReview, rating: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} כוכבים
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={editReview.text}
                    onChange={(e) =>
                      setEditReview({ ...editReview, text: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                    placeholder="טקסט הביקורת"
                  />
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      תמונת פרופיל (URL)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={editReview.avatarUrl}
                        onChange={(e) =>
                          setEditReview({ ...editReview, avatarUrl: e.target.value })
                        }
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder="https://example.com/image.jpg"
                      />
                      {editReview.avatarUrl.trim() && (
                        <div className="flex-shrink-0">
                          <img
                            src={editReview.avatarUrl.trim()}
                            alt="Preview"
                            className="w-12 h-12 rounded-full object-cover border border-slate-300"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="px-3 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded text-sm"
                    >
                      שמור
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditReview({ name: "", rating: 5, text: "", avatarUrl: "" });
                      }}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900 text-right">
                        {review.name}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={`text-sm ${
                              i < review.rating ? "text-yellow-400" : "text-slate-300"
                            }`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(review.id)}
                        className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                      >
                        ערוך
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(review.id)}
                        className="px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded"
                      >
                        מחק
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 text-right leading-relaxed">
                    {review.text}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// FAQ Editor Component
function AdminFaqEditor({
  faqs,
  onChange,
}: {
  faqs: import("@/types/siteConfig").FaqItem[];
  onChange: (faqs: import("@/types/siteConfig").FaqItem[]) => void;
}) {
  const [newFaq, setNewFaq] = useState({
    question: "",
    answer: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFaq, setEditFaq] = useState({
    question: "",
    answer: "",
  });

  const handleAdd = () => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) return;
    onChange([
      ...faqs,
      {
        id: generateId(),
        question: newFaq.question.trim(),
        answer: newFaq.answer.trim(),
      },
    ]);
    setNewFaq({ question: "", answer: "" });
  };

  const handleEdit = (id: string) => {
    const faq = faqs.find((f) => f.id === id);
    if (faq) {
      setEditingId(id);
      setEditFaq({
        question: faq.question,
        answer: faq.answer,
      });
    }
  };

  const handleSaveEdit = () => {
    if (!editingId || !editFaq.question.trim() || !editFaq.answer.trim()) return;
    onChange(
      faqs.map((f) =>
        f.id === editingId
          ? {
              id: f.id,
              question: editFaq.question.trim(),
              answer: editFaq.answer.trim(),
            }
          : f
      )
    );
    setEditingId(null);
    setEditFaq({ question: "", answer: "" });
  };

  const handleDelete = (id: string) => {
    onChange(faqs.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Add new FAQ form */}
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
        <h3 className="text-xs font-semibold text-slate-700">הוסף שאלה חדשה</h3>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            שאלה *
          </label>
          <input
            type="text"
            value={newFaq.question}
            onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="הזן שאלה"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            תשובה *
          </label>
          <textarea
            value={newFaq.answer}
            onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            placeholder="הזן תשובה"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium"
        >
          הוסף שאלה
        </button>
      </div>

      {/* Existing FAQ list */}
      {faqs.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-4">
          אין שאלות עדיין. הוסף שאלה ראשונה למעלה.
        </p>
      ) : (
        <div className="space-y-3">
          {faqs.map((faq) => (
            <div
              key={faq.id}
              className="p-4 border border-slate-200 rounded-lg bg-white"
            >
              {editingId === faq.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editFaq.question}
                    onChange={(e) =>
                      setEditFaq({ ...editFaq, question: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="שאלה"
                  />
                  <textarea
                    value={editFaq.answer}
                    onChange={(e) =>
                      setEditFaq({ ...editFaq, answer: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                    placeholder="תשובה"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="px-3 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded text-sm"
                    >
                      שמור
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditFaq({ question: "", answer: "" });
                      }}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-900 text-right">
                        {faq.question}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(faq.id)}
                        className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                      >
                        ערוך
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(faq.id)}
                        className="px-3 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded"
                      >
                        מחק
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 text-right leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminBookingTab({
  state,
  onChange,
}: {
  state: SalonBookingState;
  onChange: (next: SalonBookingState) => void;
}) {
  const updateHours = (dayIndex: number, field: "open" | "close", value: string) => {
    const updated = { ...state };
    const day = { ...updated.openingHours[dayIndex] };
    day[field] = value || null;
    updated.openingHours = [
      ...updated.openingHours.slice(0, dayIndex),
      day,
      ...updated.openingHours.slice(dayIndex + 1),
    ];
    onChange(updated);
  };

  const toggleClosed = (dayIndex: number) => {
    const updated = { ...state };
    const day = { ...updated.openingHours[dayIndex] };
    const isClosed = !day.open && !day.close;
    if (isClosed) {
      // set default open-close if currently closed
      day.open = "09:00";
      day.close = "18:00";
    } else {
      day.open = null;
      day.close = null;
    }
    updated.openingHours = [
      ...updated.openingHours.slice(0, dayIndex),
      day,
      ...updated.openingHours.slice(dayIndex + 1),
    ];
    onChange(updated);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-6">
      <h2 className="text-xl font-bold text-slate-900">ניהול תורים ושעות פתיחה</h2>
      <p className="text-xs text-slate-500">
        כאן תוכל להגדיר באילו ימים ושעות הסלון פתוח לקבלת לקוחות. הזמנות חדשות
        ייבנו על בסיס שעות הפתיחה האלו.
      </p>

      <div className="overflow-x-auto mt-4">
        <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
          <thead className="bg-slate-50">
            <tr>
              <th className="py-2 px-3 text-right font-medium text-slate-600">
                יום
              </th>
              <th className="py-2 px-3 text-right font-medium text-slate-600">
                פתיחה
              </th>
              <th className="py-2 px-3 text-right font-medium text-slate-600">
                סגירה
              </th>
              <th className="py-2 px-3 text-right font-medium text-slate-600">
                מצב
              </th>
            </tr>
          </thead>
          <tbody>
            {state.openingHours.map((day, index) => {
              const closed = !day.open && !day.close;
              return (
                <tr key={day.day} className="border-t border-slate-100">
                  <td className="py-2 px-3 text-slate-800 whitespace-nowrap">
                    {day.label}
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="time"
                      value={day.open ?? ""}
                      disabled={closed}
                      onChange={(e) =>
                        updateHours(index, "open", e.target.value)
                      }
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-xs text-right disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="time"
                      value={day.close ?? ""}
                      disabled={closed}
                      onChange={(e) =>
                        updateHours(index, "close", e.target.value)
                      }
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-xs text-right disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <button
                      type="button"
                      onClick={() => toggleClosed(index)}
                      className={`px-3 py-1 rounded-full text-[11px] border ${
                        closed
                          ? "bg-slate-50 text-slate-600 border-slate-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}
                    >
                      {closed ? "סגור" : "פתוח"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pt-2 text-xs text-slate-500">
        אורך ברירת מחדל של כל תור:{" "}
        <span className="font-semibold">
          {state.defaultSlotMinutes} דקות
        </span>{" "}
        (ניתן לשנות זאת בהמשך בהגדרות מתקדמות).
      </div>
    </div>
  );
}

function AdminWorkersTab({
  state,
  onChange,
}: {
  state: SalonBookingState;
  onChange: (next: SalonBookingState) => void;
}) {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(
    state.workers[0]?.id ?? null
  );

  const todayDate = new Date();
  const todayStr = ymdLocal(todayDate); // YYYY-MM-DD using local date

  const selectedWorker = state.workers.find((w) => w.id === selectedWorkerId) ?? null;

  const todaysBookings = state.bookings
    .filter((b) => b.workerId === selectedWorkerId && b.date === todayStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-6">
      <h2 className="text-xl font-bold text-slate-900">עובדי הסלון ותורים להיום</h2>
      <p className="text-xs text-slate-500">
        בחר עובד כדי לראות אילו תורים יש לו היום. בהמשך תוכל לערוך עובדים, לשנות
        אחוזי שכר ועוד.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-5">
        {/* Workers list */}
        <div className="border border-slate-200 rounded-2xl p-3">
          <div className="text-xs font-medium text-slate-700 mb-2">
            רשימת עובדים
          </div>
          <div className="space-y-2">
            {state.workers.map((worker) => {
              const active = worker.id === selectedWorkerId;
              return (
                <button
                  key={worker.id}
                  type="button"
                  onClick={() => setSelectedWorkerId(worker.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs border ${
                    active
                      ? "bg-sky-50 text-sky-700 border-sky-300"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[11px] font-semibold">
                      {worker.name[0]}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{worker.name}</div>
                      {worker.role && (
                        <div className="text-[11px] text-slate-500">
                          {worker.role}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Today's jobs for selected worker */}
        <div className="border border-slate-200 rounded-2xl p-4 min-h-[200px]">
          {selectedWorker ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    תורים להיום – {selectedWorker.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    תאריך היום: {todayStr}
                  </div>
                </div>
              </div>

              {todaysBookings.length === 0 ? (
                <p className="text-xs text-slate-500 mt-2">
                  אין תורים מתוכננים להיום עבור עובד זה.
                </p>
              ) : (
                <div className="space-y-2">
                  {todaysBookings.map((b) => (
                    <div
                      key={b.id}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-xs flex items-center justify-between"
                    >
                      <div className="text-right">
                        <div className="font-semibold text-slate-800">
                          {b.clientName || "לקוח ללא שם"}
                        </div>
                        {b.service && (
                          <div className="text-[11px] text-slate-500">
                            {b.service}
                          </div>
                        )}
                        {b.notes && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            הערות: {b.notes}
                          </div>
                        )}
                      </div>
                      <div className="text-left text-[11px] text-slate-600">
                        {b.startTime}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">
              בחר עובד מהרשימה כדי לראות את התורים שלו.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminColorsTab({
  siteConfig,
  onChange,
  onSave,
  isSaving,
}: {
  siteConfig: SiteConfig;
  onChange: (updates: Partial<SiteConfig>) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const currentTheme = siteConfig.themeColors || defaultThemeColors;
  const [themeColors, setThemeColors] = useState(currentTheme);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync with siteConfig changes
  useEffect(() => {
    setThemeColors(siteConfig.themeColors || defaultThemeColors);
  }, [siteConfig.themeColors]);

  // Validate hex color format
  const isValidHex = (color: string): boolean => {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  };

  const updateColor = (key: keyof typeof themeColors, value: string) => {
    const newColors = { ...themeColors, [key]: value };
    setThemeColors(newColors);
    
    // Validate
    if (!isValidHex(value)) {
      setErrors((prev) => ({ ...prev, [key]: "צבע לא תקין. השתמש בפורמט #RRGGBB" }));
    } else {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    
    // Update config immediately
    onChange({ themeColors: newColors });
  };

  const restoreDefaults = () => {
    setThemeColors(defaultThemeColors);
    setErrors({});
    onChange({ themeColors: defaultThemeColors });
  };

  const hasErrors = Object.keys(errors).length > 0;

  const colorFields: Array<{
    key: keyof typeof themeColors;
    label: string;
    description: string;
  }> = [
    { key: "background", label: "רקע כללי", description: "רקע העמוד הראשי" },
    { key: "surface", label: "רקע כרטיסים", description: "רקע של כרטיסים ותיבות" },
    { key: "text", label: "טקסט ראשי", description: "צבע הטקסט העיקרי" },
    { key: "mutedText", label: "טקסט משני", description: "צבע טקסט משני/מובלע" },
    { key: "primary", label: "צבע ראשי", description: "כפתורים והדגשות" },
    { key: "primaryText", label: "טקסט על ראשי", description: "טקסט על רקע ראשי" },
    { key: "accent", label: "צבע דגש", description: "דגשים קטנים, גבולות" },
    { key: "border", label: "צבע גבול", description: "גבולות של תיבות" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">צבעי האתר</h2>
          <p className="text-xs text-slate-500 mt-1">
            התאם את צבעי האתר לפי העדפותיך. השינויים יופיעו מיד לאחר השמירה.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={restoreDefaults}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-medium transition-colors"
          >
            שחזר ברירת מחדל
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || hasErrors}
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {isSaving ? "שומר…" : "שמור שינויים"}
          </button>
        </div>
      </div>

      {hasErrors && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
          <p className="text-xs text-red-700 font-medium mb-1">יש שגיאות בצבעים:</p>
          <ul className="text-xs text-red-600 space-y-1">
            {Object.entries(errors).map(([key, message]) => (
              <li key={key}>• {message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {colorFields.map((field) => {
          const value = themeColors[field.key];
          const hasError = !!errors[field.key];
          return (
            <div key={field.key} className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                {field.label}
              </label>
              <p className="text-xs text-slate-500">{field.description}</p>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={value}
                  onChange={(e) => updateColor(field.key, e.target.value)}
                  className="w-16 h-10 rounded-lg border border-slate-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateColor(field.key, e.target.value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-right text-sm font-mono focus:outline-none focus:ring-2 ${
                    hasError
                      ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                      : "border-slate-300 focus:ring-sky-500 focus:border-sky-500"
                  }`}
                  placeholder="#RRGGBB"
                />
              </div>
              {hasError && (
                <p className="text-xs text-red-600">{errors[field.key]}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Preview section */}
      <div className="mt-6 pt-6 border-t border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">תצוגה מקדימה</h3>
        <div
          className="rounded-2xl p-6 border-2"
          style={{
            backgroundColor: themeColors.background,
            borderColor: themeColors.border,
          }}
        >
          <div
            className="rounded-xl p-4 mb-4"
            style={{
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              borderWidth: "1px",
            }}
          >
            <h4
              className="text-lg font-semibold mb-2"
              style={{ color: themeColors.text }}
            >
              כותרת דוגמה
            </h4>
            <p
              className="text-sm mb-3"
              style={{ color: themeColors.mutedText }}
            >
              זהו טקסט משני לדוגמה
            </p>
            <button
              type="button"
              className="px-4 py-2 rounded-lg font-medium"
              style={{
                backgroundColor: themeColors.primary,
                color: themeColors.primaryText,
              }}
            >
              כפתור דוגמה
            </button>
          </div>
          <div
            className="inline-block px-3 py-1 rounded-full text-xs font-medium"
            style={{
              backgroundColor: themeColors.accent,
              color: themeColors.primaryText,
            }}
          >
            תג דגש
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminImagesTab({
  siteConfig,
  siteId,
  onChange,
}: {
  siteConfig: SiteConfig;
  siteId: string;
  onChange: (updates: Partial<SiteConfig>) => void;
}) {
  const [savingHero, setSavingHero] = useState(false);
  const [savingAbout, setSavingAbout] = useState(false);
  const [heroMessage, setHeroMessage] = useState("");
  const [aboutMessage, setAboutMessage] = useState("");

  const currentHero = siteConfig.heroImage || HAIR_HERO_IMAGES[0];
  const currentAbout = siteConfig.aboutImage || HAIR_ABOUT_IMAGES[0];

  const handleRegenerateHero = async () => {
    setSavingHero(true);
    setHeroMessage("");
    
    try {
      if (!db) {
        throw new Error("Firebase not initialized");
      }

      const newHero = pickNewImage(HAIR_HERO_IMAGES, currentHero);
      
      // Update Firestore
      const siteRef = doc(db, "sites", siteId);
      await setDoc(
        siteRef,
        { config: { heroImage: newHero } },
        { merge: true }
      );

      // Update local state
      onChange({ heroImage: newHero });
      
      // Also update localStorage
      if (typeof window !== "undefined") {
        const updatedConfig = { ...siteConfig, heroImage: newHero };
        window.localStorage.setItem(
          `siteConfig:${siteId}`,
          JSON.stringify(updatedConfig)
        );
      }

      setHeroMessage("נשמר בהצלחה");
      setTimeout(() => setHeroMessage(""), 3000);
    } catch (error) {
      console.error("Failed to regenerate hero image", error);
      setHeroMessage("אירעה שגיאה");
      setTimeout(() => setHeroMessage(""), 3000);
    } finally {
      setSavingHero(false);
    }
  };

  const handleRegenerateAbout = async () => {
    setSavingAbout(true);
    setAboutMessage("");
    
    try {
      if (!db) {
        throw new Error("Firebase not initialized");
      }

      const newAbout = pickNewImage(HAIR_ABOUT_IMAGES, currentAbout);
      
      // Update Firestore
      const siteRef = doc(db, "sites", siteId);
      await setDoc(
        siteRef,
        { config: { aboutImage: newAbout } },
        { merge: true }
      );

      // Update local state
      onChange({ aboutImage: newAbout });
      
      // Also update localStorage
      if (typeof window !== "undefined") {
        const updatedConfig = { ...siteConfig, aboutImage: newAbout };
        window.localStorage.setItem(
          `siteConfig:${siteId}`,
          JSON.stringify(updatedConfig)
        );
      }

      setAboutMessage("נשמר בהצלחה");
      setTimeout(() => setAboutMessage(""), 3000);
    } catch (error) {
      console.error("Failed to regenerate about image", error);
      setAboutMessage("אירעה שגיאה");
      setTimeout(() => setAboutMessage(""), 3000);
    } finally {
      setSavingAbout(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">תמונות האתר</h2>
        <p className="text-xs text-slate-500 mt-1">
          החלף את תמונות ההירו והאודות של האתר. השינויים יופיעו מיד לאחר השמירה.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Hero Image Card */}
        <div className="border border-slate-200 rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              תמונת הירו
            </h3>
            <p className="text-xs text-slate-500">
              התמונה הראשית המוצגת בחלק העליון של העמוד
            </p>
          </div>

          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
            <Image
              src={currentHero}
              alt="תמונת הירו נוכחית"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleRegenerateHero}
              disabled={savingHero}
              className="w-full px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {savingHero ? "שומר…" : "החלף תמונת הירו"}
            </button>
            {heroMessage && (
              <p
                className={`text-xs text-center ${
                  heroMessage.includes("שגיאה")
                    ? "text-red-600"
                    : "text-emerald-600"
                }`}
              >
                {heroMessage}
              </p>
            )}
          </div>
        </div>

        {/* About Image Card */}
        <div className="border border-slate-200 rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              תמונת אודות
            </h3>
            <p className="text-xs text-slate-500">
              התמונה המוצגת בקטע "על הסלון"
            </p>
          </div>

          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
            <Image
              src={currentAbout}
              alt="תמונת אודות נוכחית"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleRegenerateAbout}
              disabled={savingAbout}
              className="w-full px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {savingAbout ? "שומר…" : "החלף תמונת אודות"}
            </button>
            {aboutMessage && (
              <p
                className={`text-xs text-center ${
                  aboutMessage.includes("שגיאה")
                    ? "text-red-600"
                    : "text-emerald-600"
                }`}
              >
                {aboutMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminDividersTab({
  siteConfig,
  siteId,
  onChange,
  onSave,
  isSaving,
}: {
  siteConfig: SiteConfig;
  siteId: string;
  onChange: (updates: Partial<SiteConfig>) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const [dividerStyle, setDividerStyle] = useState<"none" | "wave" | "curve" | "angle">(
    siteConfig.dividerStyle ?? "wave"
  );
  const [dividerHeight, setDividerHeight] = useState<number>(
    siteConfig.dividerHeight ?? 48
  );

  // Sync with siteConfig changes
  useEffect(() => {
    setDividerStyle(siteConfig.dividerStyle ?? "wave");
    setDividerHeight(siteConfig.dividerHeight ?? 48);
  }, [siteConfig.dividerStyle, siteConfig.dividerHeight]);

  const handleStyleChange = (newStyle: "none" | "wave" | "curve" | "angle") => {
    setDividerStyle(newStyle);
    onChange({ dividerStyle: newStyle });
  };

  const handleHeightChange = (newHeight: number) => {
    const clamped = Math.max(24, Math.min(96, newHeight));
    setDividerHeight(clamped);
    onChange({ dividerHeight: clamped });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">מפרידי מקטעים</h2>
        <p className="text-xs text-slate-500 mt-1">
          בחרו את סגנון המפרידים בין המקטעים באתר. השינויים יופיעו מיד לאחר השמירה.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            סגנון מפריד
          </label>
          <select
            value={dividerStyle}
            onChange={(e) =>
              handleStyleChange(e.target.value as "none" | "wave" | "curve" | "angle")
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          >
            <option value="none">בלי</option>
            <option value="wave">גלים</option>
            <option value="curve">קימור</option>
            <option value="angle">אלכסון</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            גובה מפריד (פיקסלים)
          </label>
          <input
            type="number"
            min={24}
            max={96}
            value={dividerHeight}
            onChange={(e) => handleHeightChange(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />
          <p className="text-xs text-slate-500 mt-1">מינימום: 24, מקסימום: 96</p>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          {isSaving ? "שומר…" : "שמור שינויים"}
        </button>
      </div>
    </div>
  );
}

function AdminSalaryTab() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-4">
      <h2 className="text-xl font-bold text-slate-900">שכר ותשלומים</h2>
      <p className="text-xs text-slate-500">
        כאן תוכל בעתיד לראות סיכומי הכנסות, עמלות עובדים, ושכר חודשי לפי תורים
        שבוצעו. כרגע זה מסך דמה כדי להגדיר את המבנה.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <div className="border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">הכנסות החודש (סה״כ)</div>
          <div className="text-lg font-semibold text-slate-900">
            ₪ 0 (דוגמה)
          </div>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">שכר משוער לעובדים</div>
          <div className="text-lg font-semibold text-slate-900">
            ₪ 0 (דוגמה)
          </div>
        </div>
        <div className="border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">
            תורים שבוצעו החודש
          </div>
          <div className="text-lg font-semibold text-slate-900">
            0 (דוגמה)
          </div>
        </div>
      </div>
    </div>
  );
}

