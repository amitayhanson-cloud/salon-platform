"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DeleteAccountButton from "@/components/admin/DeleteAccountButton";
import SubdomainSettingsCard from "@/components/admin/SubdomainSettingsCard";
import CustomDomainSettingsCard from "@/components/admin/CustomDomainSettingsCard";
import ChangePasswordCard from "@/components/security/ChangePasswordCard";
import type { SiteConfig } from "@/types/siteConfig";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { useAuth } from "@/components/auth/AuthProvider";
import AdminTabs from "@/components/ui/AdminTabs";
import { deleteUserAccount } from "@/lib/deleteUserAccount";
import { clearStaleStorageOnLogout } from "@/lib/client/storageCleanup";
import type { SiteBranding } from "@/types/siteConfig";
import { validateLogoFile } from "@/lib/siteLogoStorage";
import { ImagePickerModal } from "@/components/editor/ImagePickerModal";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesContext";


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


const salonTypeLabels: Record<SiteConfig["salonType"], string> = {
  hair: "ספרות / עיצוב שיער",
  nails: "מניקור / פדיקור",
  barber: "ברברשופ",
  spa: "ספא / טיפולי גוף",
  mixed: "משולב",
  other: "אחר",
};

const SETTINGS_TABS = [
  { key: "basic", label: "מידע בסיסי" },
  { key: "contact", label: "פרטי יצירת קשר" },
  { key: "security", label: "אבטחה" },
] as const;

type SettingsTabType = (typeof SETTINGS_TABS)[number]["key"];

export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}



export function AdminReviewsEditor({
  siteId,
  reviews,
  onChange,
}: {
  siteId: string;
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
  /** "new" = add form; string = review id (edit form). null = closed. */
  const [avatarPickerFor, setAvatarPickerFor] = useState<"new" | string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = () => {
    if (!newReview.name.trim() || !newReview.text.trim()) return;
    const avatarUrl = (newReview.avatarUrl ?? "").trim() || null;
    onChange([
      ...reviews,
      {
        id: generateId(),
        name: newReview.name.trim(),
        rating: newReview.rating,
        text: newReview.text.trim(),
        avatarUrl,
      },
    ]);
    setNewReview({ name: "", rating: 5, text: "", avatarUrl: "" });
    setShowAddForm(false);
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
    const avatarUrl = (editReview.avatarUrl ?? "").trim() || null;
    onChange(
      reviews.map((r) =>
        r.id === editingId
          ? {
              id: r.id,
              name: editReview.name.trim(),
              rating: editReview.rating,
              text: editReview.text.trim(),
              avatarUrl,
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

  const handleAvatarSelect = (url: string) => {
    if (avatarPickerFor === "new") {
      setNewReview((prev) => ({ ...prev, avatarUrl: url }));
    } else if (avatarPickerFor && editingId === avatarPickerFor) {
      setEditReview((prev) => ({ ...prev, avatarUrl: url }));
    }
    setAvatarPickerFor(null);
  };

  return (
    <div className="space-y-4">
      {/* Existing reviews list */}
      {reviews.length === 0 && !showAddForm ? (
        <p className="text-xs text-slate-500 text-center py-4">
          אין ביקורות עדיין. לחץ על הוסף ביקורת למטה.
        </p>
      ) : reviews.length === 0 ? null : (
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                    placeholder="שם הלקוח"
                  />
                  <select
                    value={editReview.rating}
                    onChange={(e) =>
                      setEditReview({ ...editReview, rating: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep bg-white"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep resize-none"
                    placeholder="טקסט הביקורת"
                  />
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      תמונת פרופיל
                    </label>
                    <div className="flex items-center gap-3 flex-wrap">
                      {(editReview.avatarUrl ?? "").trim() ? (
                        <img
                          src={(editReview.avatarUrl ?? "").trim()}
                          alt=""
                          className="w-12 h-12 rounded-full object-cover border border-slate-300 flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            if (editingId) setAvatarPickerFor(editingId);
                          }}
                          className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium"
                        >
                          בחר תמונת פרופיל
                        </button>
                        {(editReview.avatarUrl ?? "").trim() ? (
                          <button
                            type="button"
                            onClick={() =>
                              setEditReview({ ...editReview, avatarUrl: "" })
                            }
                            className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-sm"
                          >
                            הסר תמונה
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="px-3 py-1 bg-caleno-ink hover:bg-[#1E293B] text-white rounded text-sm"
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

      {/* Add review button or form (below list) */}
      {!showAddForm ? (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="w-full py-3 px-4 rounded-lg border-2 border-dashed border-slate-300 text-slate-600 hover:border-caleno-deep/50 hover:text-caleno-deep hover:bg-caleno-50/50 text-sm font-medium transition-colors"
        >
          הוסף ביקורת
        </button>
      ) : (
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep bg-white"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep resize-none"
              placeholder="הזן את טקסט הביקורת"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              תמונת פרופיל
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {(newReview.avatarUrl ?? "").trim() ? (
                <img
                  src={(newReview.avatarUrl ?? "").trim()}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover border border-slate-300 flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setAvatarPickerFor("new");
                  }}
                  className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium"
                >
                  בחר תמונת פרופיל
                </button>
                {(newReview.avatarUrl ?? "").trim() ? (
                  <button
                    type="button"
                    onClick={() => setNewReview({ ...newReview, avatarUrl: "" })}
                    className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-sm"
                  >
                    הסר תמונה
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="px-4 py-2 bg-caleno-ink hover:bg-[#1E293B] text-white rounded-lg text-sm font-medium"
            >
              הוסף ביקורת
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewReview({ name: "", rating: 5, text: "", avatarUrl: "" });
              }}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      <ImagePickerModal
        isOpen={avatarPickerFor !== null}
        onClose={() => setAvatarPickerFor(null)}
        siteId={siteId}
        targetPath="reviewAvatar"
        targetReviewId={avatarPickerFor && avatarPickerFor !== "new" ? avatarPickerFor : undefined}
        uploadOnly
        onSelect={handleAvatarSelect}
      />
    </div>
  );
}

export function AdminFaqEditor({
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
  const [showAddForm, setShowAddForm] = useState(false);

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
    setShowAddForm(false);
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
      {/* Existing FAQ list */}
      {faqs.length === 0 && !showAddForm ? (
        <p className="text-xs text-slate-500 text-center py-4">
          אין שאלות עדיין. לחץ על הוסף שאלה למטה.
        </p>
      ) : faqs.length === 0 ? null : (
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                    placeholder="שאלה"
                  />
                  <textarea
                    value={editFaq.answer}
                    onChange={(e) =>
                      setEditFaq({ ...editFaq, answer: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep resize-none"
                    placeholder="תשובה"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="px-3 py-1 bg-caleno-ink hover:bg-[#1E293B] text-white rounded text-sm"
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

      {/* Add FAQ button or form (below list) */}
      {!showAddForm ? (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="w-full py-3 px-4 rounded-lg border-2 border-dashed border-slate-300 text-slate-600 hover:border-caleno-deep/50 hover:text-caleno-deep hover:bg-caleno-50/50 text-sm font-medium transition-colors"
        >
          הוסף שאלה
        </button>
      ) : (
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep resize-none"
              placeholder="הזן תשובה"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="px-4 py-2 bg-caleno-ink hover:bg-[#1E293B] text-white rounded-lg text-sm font-medium"
            >
              הוסף שאלה
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setNewFaq({ question: "", answer: "" });
              }}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-sm font-medium"
            >
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function AdminSiteTab({
  siteConfig,
  onChange,
  renderSections,
}: {
  siteConfig: SiteConfig;
  onChange: (updates: Partial<SiteConfig>) => void;
  renderSections?: string[];
}) {


  // If renderSections is provided, only render those sections
  const shouldRender = (section: string) => !renderSections || renderSections.includes(section);

  return (
    <div className="space-y-6 text-right">

      {/* Basic Details */}
      {shouldRender("basic") && (
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">פרטים בסיסיים</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              שם הסלון *
            </label>
            <input
              type="text"
              value={siteConfig.salonName}
              onChange={(e) => onChange({ salonName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-2 focus:ring-caleno-deep focus:border-caleno-deep"
              placeholder="הקלד את שם הסלון"
            />
          </div>
        </div>
      </div>
      )}

      {/* Location */}
      {shouldRender("location") && (
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">מיקום</h2>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            כתובת מלאה (להצגה במפה)
          </label>
          <input
            type="text"
            value={siteConfig.address || ""}
            onChange={(e) => onChange({ address: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-2 focus:ring-caleno-deep focus:border-caleno-deep"
            placeholder="למשל: רחוב בן יהודה 10, תל אביב"
          />
          <p className="text-xs text-slate-500 mt-1 text-right">
            הכתובת הזו תשמש למפה ולכפתור Waze.
          </p>
        </div>
      </div>
      )}



      {/* Contact Details */}
      {shouldRender("contact") && (
      <div className="space-y-4">
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-2 focus:ring-caleno-deep focus:border-caleno-deep"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-2 focus:ring-caleno-deep focus:border-caleno-deep"
              placeholder="למשל: 050-1234567"
            />
          </div>

          <div>
            <label
              htmlFor="adminWhatsappDraftMessage"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              טופס הודעה לוואטסאפ (אופציונלי)
            </label>
            <textarea
              id="adminWhatsappDraftMessage"
              rows={3}
              value={siteConfig.whatsappDraftMessage ?? ""}
              onChange={(e) => onChange({ whatsappDraftMessage: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep focus:border-caleno-deep resize-none"
              placeholder="טקסט שיופיע מראש כשהלקוח לוחץ על קישור וואטסאפ (ריק = בלי טופס)"
            />
            <p className="text-xs text-[#64748B] mt-1">
              כשמישהו לוחץ על קישור וואטסאפ באתר, האפליקציה תיפתח עם ההודעה הזו מוכנה לשליחה.
            </p>
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-2 focus:ring-caleno-deep focus:border-caleno-deep"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-2 focus:ring-caleno-deep focus:border-caleno-deep"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-2 focus:ring-caleno-deep focus:border-caleno-deep"
              placeholder="name@example.com"
            />
          </div>
        </div>
      </div>
      )}

      {/* Special Note */}
      {shouldRender("specialNote") && (
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">הערה מיוחדת</h2>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            הטקסט יוצג במקטע <span className="font-medium text-slate-600">אודות</span> בדף הנחיתה הציבורי של האתר — כך שהמבקרים יבינו את מה שחשוב לך להדגיש על הסלון.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            משהו מיוחד שחשוב שיכתבו על הסלון?
          </label>
          <textarea
            value={siteConfig.specialNote || ""}
            onChange={(e) => onChange({ specialNote: e.target.value })}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-2 focus:ring-caleno-deep focus:border-caleno-deep resize-none"
            placeholder="כתוב כאן הערות או פרטים מיוחדים..."
          />
        </div>
      </div>
      )}

    </div>
  );
}

export function BrandingLogoEditor({
  siteId,
  siteConfig,
  onChange,
  onSave,
  isSaving,
  getToken,
}: {
  siteId: string;
  siteConfig: SiteConfig;
  onChange: (updates: Partial<SiteConfig>) => void;
  onSave: (updates?: Partial<SiteConfig>) => Promise<void>;
  isSaving: boolean;
  getToken: () => Promise<string | null>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branding = siteConfig.branding ?? {};

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setError(null);
    if (!file) return;
    const err = validateLogoFile(file);
    if (err) {
      setError(err);
      return;
    }
    setUploading(true);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי להעלות לוגו");
        return;
      }
      const signRes = await fetch("/api/cloudinary/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId }),
      });
      const signData = await signRes.json().catch(() => ({}));
      if (!signRes.ok) {
        setError(signData.error || "קבלת חתימה נכשלה");
        return;
      }
      const { timestamp, signature, apiKey, cloudName, folder, publicId } = signData;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", apiKey);
      formData.append("timestamp", String(timestamp));
      formData.append("signature", signature);
      formData.append("folder", folder);
      formData.append("public_id", publicId);
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || uploadData.error) {
        setError(uploadData.error?.message || "העלאת הלוגו ל-Cloudinary נכשלה");
        return;
      }
      const secureUrl = uploadData.secure_url as string;
      const logoPublicId = uploadData.public_id as string | undefined;
      const saveRes = await fetch("/api/admin/site-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          siteId,
          logoUrl: secureUrl,
          logoPublicId: logoPublicId ?? null,
        }),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        setError(saveData.error || "שמירת הלוגו נכשלה");
        return;
      }
      const nextBranding: SiteBranding = { ...branding, logoUrl: secureUrl, logoPublicId: logoPublicId ?? undefined };
      onChange({ branding: nextBranding });
      await onSave({ branding: nextBranding });
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאת הלוגו נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("יש להתחבר כדי להסיר לוגו");
        return;
      }
      const saveRes = await fetch("/api/admin/site-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, logoUrl: null }),
      });
      const saveData = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        setError(saveData.error || "הסרת הלוגו נכשלה");
        return;
      }
      const nextBranding: SiteBranding = { ...branding, logoUrl: null };
      onChange({ branding: nextBranding });
      await onSave({ branding: nextBranding });
    } catch (err) {
      setError(err instanceof Error ? err.message : "הסרת הלוגו נכשלה");
    }
  };

  return (
    <div className="space-y-6 text-right">
      <h2 className="text-sm font-semibold text-slate-900">לוגו ומיתוג</h2>
      <p className="text-xs text-slate-500">
        הלוגו יוצג בראש האתר הציבורי ליד כפתור &quot;קביעת תור&quot;. מומלץ: PNG, JPG, SVG או WEBP, עד 2MB.
      </p>

      <div className="flex flex-wrap items-start gap-4">
        {branding.logoUrl ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-24 h-24 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0"
              style={{ minHeight: 96 }}
            >
              <img
                src={branding.logoUrl}
                alt={branding.logoAlt || siteConfig.salonName || "לוגו"}
                className="max-w-full max-h-full object-contain"
              />
            </div>
            <div className="flex gap-2">
              <label className="cursor-pointer px-3 py-1.5 text-sm font-medium text-caleno-deep hover:text-caleno-ink border border-[#E2E8F0] hover:border-caleno-deep/40 rounded-lg">
                החלף
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                  className="sr-only"
                  onChange={handleFileChange}
                  disabled={uploading || isSaving}
                />
              </label>
              <button
                type="button"
                onClick={handleRemove}
                disabled={isSaving}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-700 border border-slate-300 rounded-lg disabled:opacity-50"
              >
                הסר
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-caleno-ink hover:bg-[#1E293B] text-white text-sm font-medium rounded-lg w-fit disabled:opacity-50">
              {uploading ? "מעלה…" : "העלה לוגו"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                className="sr-only"
                onChange={handleFileChange}
                disabled={uploading || isSaving}
              />
            </label>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Reviews Editor Component


export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string;
  const { siteConfig, isSaving, saveMessage, hasUnsavedChanges, handleConfigChange, handleSaveConfig } =
    useSiteConfig(siteId);
  const unsavedCtx = useUnsavedChanges();
  const { user, firebaseUser, logout } = useAuth();
  // Tab state for settings sections - MUST be declared before any early returns
  const [activeTab, setActiveTab] = useState<SettingsTabType>("basic");
  // Delete account state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Security section toast
  const [securityToast, setSecurityToast] = useState<{ message: string; isError?: boolean } | null>(null);

  useEffect(() => {
    if (!securityToast) return;
    const t = setTimeout(() => setSecurityToast(null), 4000);
    return () => clearTimeout(t);
  }, [securityToast]);

  const handleSaveAll = useCallback(async () => {
    await handleSaveConfig();
  }, [handleSaveConfig]);

  const anyUnsaved = hasUnsavedChanges;

  useEffect(() => {
    unsavedCtx?.setUnsaved(anyUnsaved, handleSaveAll);
    return () => {
      unsavedCtx?.setUnsaved(false, () => {});
    };
  }, [unsavedCtx, anyUnsaved, handleSaveAll]);

  useEffect(() => {
    if (!anyUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyUnsaved]);

  // Enter key saves (except when focus is in a textarea)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;
      if (target.closest("[role=dialog]")) return;
      handleSaveConfig();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSaveConfig]);

  const logSecurityEvent = async (type: string, tenantId?: string) => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      await fetch("/api/security-events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type, tenantId: tenantId ?? siteId ?? undefined }),
      });
    } catch {
      // Non-blocking; audit log failure should not affect UX
    }
  };

  // Delete account handler
  const handleDeleteAccount = async () => {
    if (!firebaseUser) {
      setDeleteError("לא נמצא משתמש מחובר");
      throw new Error("לא נמצא משתמש מחובר");
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      // Delete account (Firestore + Auth)
      await deleteUserAccount(firebaseUser);

      // Clear all tenant storage (siteConfig:*, bookingState:*, latestSiteConfig:*, auth redirect keys)
      // Uses siteId-based and prefix-based cleanup to prevent stale tenant state for next user
      if (typeof window !== "undefined") {
        clearStaleStorageOnLogout();
      }

      // Sign out first (clears auth state)
      await logout();
      
      // Small delay to ensure auth state is cleared before redirect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Redirect to landing page (public route, no guards)
      // Use window.location for a hard redirect to prevent any route guard interference
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (error: any) {
      console.error("[SettingsPage] Failed to delete account:", error);
      setDeleteError(
        error.message || "שגיאה במחיקת החשבון. אנא נסה שוב או פנה לתמיכה."
      );
      setIsDeleting(false);
    }
  };

  // Early return AFTER all hooks are declared
  if (!siteConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600 text-sm">טוען את נתוני הסלון…</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <AdminPageHero
          title="הגדרות"
          subtitle="כאן תוכל לעדכן את כל הפרטים וההגדרות של האתר"
        />
      </div>

      <AdminCard className="overflow-hidden">
      <div className="shrink-0 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3 sm:gap-4 px-4 sm:px-6 py-3 border-b border-[#E2E8F0] bg-white/80">
        <AdminTabs
          tabs={SETTINGS_TABS}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key)}
          className="flex-1 min-w-0 w-full sm:w-auto"
        />
        <div className="flex items-center gap-3 sm:gap-4 shrink-0 flex-wrap">
          {saveMessage && hasUnsavedChanges && (
            <span className="text-xs text-emerald-600">{saveMessage}</span>
          )}
          {hasUnsavedChanges && (
            <button
              onClick={() => { void handleSaveConfig(); }}
              disabled={isSaving}
              className="min-h-[44px] rounded-full bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1E293B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
            >
              {isSaving ? "שומר…" : "שמור שינויים"}
            </button>
          )}
        </div>
      </div>
      <div className="p-4 sm:p-6">


        {/* Tab Content */}
        <div>
          {activeTab === "basic" && (
            <>
              <AdminSiteTab
                siteConfig={siteConfig}
                onChange={handleConfigChange}
                renderSections={["basic", "location", "specialNote"]}
              />
              <SubdomainSettingsCard firebaseUser={firebaseUser} />
              <div className="mt-6">
                <CustomDomainSettingsCard siteId={siteId} firebaseUser={firebaseUser} />
              </div>
              <div className="mt-10">
                <DeleteAccountButton
                  onDelete={handleDeleteAccount}
                  isDeleting={isDeleting}
                  deleteError={deleteError}
                />
              </div>
            </>
          )}
          {activeTab === "contact" && (
            <AdminSiteTab
              siteConfig={siteConfig}
              onChange={handleConfigChange}
              renderSections={["contact"]}
            />
          )}
          {activeTab === "security" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#0F172A] mb-1">אבטחה</h2>
                {firebaseUser?.providerData?.some((p) => p.providerId === "password") ? (
                  <>
                    <p className="text-sm text-slate-500 mb-4">
                      שנה את הסיסמה של החשבון שלך.
                    </p>
                    <ChangePasswordCard
                      firebaseUser={firebaseUser}
                      onToast={(msg, isError) => setSecurityToast({ message: msg, isError })}
                      logSecurityEvent={logSecurityEvent}
                      tenantId={siteId ?? undefined}
                    />
                  </>
                ) : (
                  <p className="text-sm text-slate-500 mb-4">
                    החשבון שלך מקושר ל-Google או לטלפון (קוד SMS) — אין סיסמה לשנות כאן.
                  </p>
                )}
              </div>
              {securityToast && (
                <div
                  role="alert"
                  className={`rounded-lg px-4 py-2 text-sm ${
                    securityToast.isError ? "bg-red-50 text-red-800 border border-red-200" : "bg-slate-100 text-slate-800 border border-slate-200"
                  }`}
                >
                  {securityToast.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </AdminCard>
    </div>
  );
}
