"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import Image from "next/image";
import type { SiteConfig } from "@/types/siteConfig";
import { HAIR_HERO_IMAGES, HAIR_ABOUT_IMAGES } from "@/lib/hairImages";
import { pickNewImage } from "@/lib/pickNewImage";
import { useSiteConfig } from "@/hooks/useSiteConfig";

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


// vibeLabels and photosOptionLabels kept for backwards compatibility but no longer used in UI
const vibeLabels: Record<NonNullable<SiteConfig["vibe"]>, string> = {
  luxury: "סגנון יוקרתי",
  clean: "סגנון נקי ורך",
  colorful: "סגנון צבעוני וכיפי",
  spa: "לא בשימוש כרגע",
  surprise: "לא בשימוש כרגע",
};

const photosOptionLabels: Record<NonNullable<SiteConfig["photosOption"]>, string> = {
  own: "אני מעלה תמונות שלי",
  ai: "AI ייצור תמונות בשבילי",
  mixed: "שילוב של שניהם",
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
              className="w-full px-4 py-2 rounded-lg bg-caleno-500 hover:bg-caleno-600 disabled:bg-caleno-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
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
              className="w-full px-4 py-2 rounded-lg bg-caleno-500 hover:bg-caleno-600 disabled:bg-caleno-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
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


export default function PicturesPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const { siteConfig, handleConfigChange } = useSiteConfig(siteId);

  if (!siteConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600 text-sm">טוען את נתוני הסלון…</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">תמונות</h1>
        <p className="text-sm text-slate-500 mt-1">
          החלף את תמונות ההירו והאודות של האתר
        </p>
      </div>

      <AdminImagesTab
        siteConfig={siteConfig}
        siteId={siteId}
        onChange={handleConfigChange}
      />
    </div>
  );
}
