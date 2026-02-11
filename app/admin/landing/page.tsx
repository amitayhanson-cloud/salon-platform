"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { getLandingContent, saveLandingContent } from "@/lib/firestoreLanding";
import { DEFAULT_LANDING_CONTENT } from "@/lib/landingContentDefaults";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import type { LandingContent, LandingFaqItem } from "@/types/landingContent";

export default function AdminLandingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState<LandingContent>(DEFAULT_LANDING_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (!isPlatformAdmin(user.email)) {
      return;
    }
    getLandingContent()
      .then(setContent)
      .catch(() => setContent(DEFAULT_LANDING_CONTENT))
      .finally(() => setLoading(false));
  }, [user, authLoading, router]);

  const showToast = (type: "success" | "error") => {
    setToast(type);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    if (!user || !isPlatformAdmin(user.email)) return;
    if (!content.hero.headline?.trim()) {
      showToast("error");
      return;
    }
    if (!content.hero.primaryCtaLabel?.trim()) {
      showToast("error");
      return;
    }
    setSaving(true);
    try {
      await saveLandingContent({
        hero: content.hero,
        about: content.about,
        how: content.how,
        faq: content.faq,
      });
      showToast("success");
    } catch {
      showToast("error");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-slate-600">טוען...</p>
      </div>
    );
  }

  if (!isPlatformAdmin(user.email)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="text-center text-slate-700">
          <p className="font-semibold">אין הרשאה</p>
          <p className="text-sm mt-2">אין לך גישה לעריכת דף הנחיתה.</p>
          <Link href="/" className="text-[#2EC4C6] hover:underline mt-4 inline-block">
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <p className="text-slate-600">טוען תוכן...</p>
      </div>
    );
  }

  const updateHero = (patch: Partial<LandingContent["hero"]>) =>
    setContent((c) => ({ ...c, hero: { ...c.hero, ...patch } }));
  const updateAbout = (patch: Partial<LandingContent["about"]>) =>
    setContent((c) => ({ ...c, about: { ...c.about, ...patch } }));
  const updateHow = (index: number, patch: Partial<LandingContent["how"][0]>) =>
    setContent((c) => ({
      ...c,
      how: c.how.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    }));
  const setFaq = (faq: LandingFaqItem[]) => setContent((c) => ({ ...c, faq }));
  const addFaq = () => setFaq([...content.faq, { question: "", answer: "" }]);
  const removeFaq = (i: number) => setFaq(content.faq.filter((_, j) => j !== i));
  const updateFaq = (i: number, patch: Partial<LandingFaqItem>) =>
    setFaq(
      content.faq.map((item, j) => (j === i ? { ...item, ...patch } : item))
    );

  return (
    <div className="min-h-screen bg-slate-50 py-8" dir="rtl">
      <div className="max-w-3xl mx-auto px-4">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-slate-900">עריכת דף נחיתה</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-[#2EC4C6] hover:underline"
            >
              חזרה לדף הבית
            </Link>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? "שומר..." : "שמירה"}
            </button>
          </div>
        </header>

        {toast === "success" && (
          <div className="mb-4 p-3 bg-green-100 border border-green-300 text-green-800 rounded-lg text-sm">
            נשמר בהצלחה.
          </div>
        )}
        {toast === "error" && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-lg text-sm">
            נכשל. וודא שכותרת ה-Hero ותגית הכפתור הראשי מלאים.
          </div>
        )}

        <div className="space-y-8">
          {/* Hero */}
          <section className="bg-white rounded-xl p-6 border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Hero</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">כותרת ראשית</label>
                <input
                  type="text"
                  value={content.hero.headline}
                  onChange={(e) => updateHero({ headline: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">תת-כותרת</label>
                <textarea
                  value={content.hero.subheadline}
                  onChange={(e) => updateHero({ subheadline: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">תגית כפתור ראשי</label>
                <input
                  type="text"
                  value={content.hero.primaryCtaLabel}
                  onChange={(e) => updateHero({ primaryCtaLabel: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">תגית כפתור משני</label>
                <input
                  type="text"
                  value={content.hero.secondaryCtaLabel}
                  onChange={(e) => updateHero({ secondaryCtaLabel: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                />
              </div>
            </div>
          </section>

          {/* About */}
          <section className="bg-white rounded-xl p-6 border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">מי אנחנו</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">כותרת</label>
                <input
                  type="text"
                  value={content.about.title}
                  onChange={(e) => updateAbout({ title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">טקסט</label>
                <textarea
                  value={content.about.body}
                  onChange={(e) => updateAbout({ body: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">שורת בעלות (igani.co)</label>
                <input
                  type="text"
                  value={content.about.ownershipLine}
                  onChange={(e) => updateAbout({ ownershipLine: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                />
              </div>
            </div>
          </section>

          {/* How it works */}
          <section className="bg-white rounded-xl p-6 border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">איך זה עובד (3 שלבים)</h2>
            <div className="space-y-4">
              {content.how.slice(0, 3).map((step, i) => (
                <div key={i} className="border border-slate-100 rounded-lg p-4 bg-slate-50/50">
                  <label className="block text-sm font-medium text-slate-600 mb-1">שלב {i + 1} — כותרת</label>
                  <input
                    type="text"
                    value={step.title}
                    onChange={(e) => updateHow(i, { title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right mb-2"
                  />
                  <label className="block text-sm font-medium text-slate-600 mb-1">תיאור</label>
                  <textarea
                    value={step.description}
                    onChange={(e) => updateHow(i, { description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section className="bg-white rounded-xl p-6 border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">שאלות נפוצות</h2>
              <button
                type="button"
                onClick={addFaq}
                className="text-sm text-[#2EC4C6] hover:underline"
              >
                + הוספת שאלה
              </button>
            </div>
            <div className="space-y-4">
              {content.faq.map((item, i) => (
                <div key={i} className="border border-slate-100 rounded-lg p-4 bg-slate-50/50">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-xs text-slate-500">שאלה {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeFaq(i)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      הסר
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="שאלה"
                    value={item.question}
                    onChange={(e) => updateFaq(i, { question: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right mt-1 mb-2"
                  />
                  <textarea
                    placeholder="תשובה"
                    value={item.answer}
                    onChange={(e) => updateFaq(i, { answer: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
