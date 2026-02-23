"use client";

import { useEffect, useState, Fragment } from "react";
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
import type { SalonBookingState } from "@/types/booking";
import { validateLogoFile } from "@/lib/siteLogoStorage";
import { ImagePickerModal } from "@/components/editor/ImagePickerModal";


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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 bg-white"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 resize-none"
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
        <button
          type="button"
          onClick={handleAdd}
          className="px-4 py-2 bg-caleno-500 hover:bg-caleno-600 text-white rounded-lg text-sm font-medium"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500"
                    placeholder="שם הלקוח"
                  />
                  <select
                    value={editReview.rating}
                    onChange={(e) =>
                      setEditReview({ ...editReview, rating: Number(e.target.value) })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 bg-white"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 resize-none"
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
                      className="px-3 py-1 bg-caleno-500 hover:bg-caleno-600 text-white rounded text-sm"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 resize-none"
            placeholder="הזן תשובה"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="px-4 py-2 bg-caleno-500 hover:bg-caleno-600 text-white rounded-lg text-sm font-medium"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500"
                    placeholder="שאלה"
                  />
                  <textarea
                    value={editFaq.answer}
                    onChange={(e) =>
                      setEditFaq({ ...editFaq, answer: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 resize-none"
                    placeholder="תשובה"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="px-3 py-1 bg-caleno-500 hover:bg-caleno-600 text-white rounded text-sm"
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


export function AdminBookingTab({
  state,
  onChange,
  onSaveRequest,
}: {
  state: SalonBookingState;
  onChange: (next: SalonBookingState) => void;
  onSaveRequest?: () => void;
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
      day.open = "09:00";
      day.close = "18:00";
    } else {
      day.open = null;
      day.close = null;
      day.breaks = undefined;
    }
    updated.openingHours = [
      ...updated.openingHours.slice(0, dayIndex),
      day,
      ...updated.openingHours.slice(dayIndex + 1),
    ];
    onChange(updated);
  };

  const updateDayBreaks = (dayIndex: number, breaks: { start: string; end: string }[]) => {
    const updated = { ...state };
    const day = { ...updated.openingHours[dayIndex], breaks };
    updated.openingHours = [
      ...updated.openingHours.slice(0, dayIndex),
      day,
      ...updated.openingHours.slice(dayIndex + 1),
    ];
    onChange(updated);
  };

  const addBreak = (dayIndex: number) => {
    const day = state.openingHours[dayIndex];
    const open = day?.open ?? "09:00";
    const close = day?.close ?? "18:00";
    const existing = day?.breaks ?? [];
    const [oh, om] = open.split(":").map(Number);
    const defaultStart = `${String(oh + 1).padStart(2, "0")}:00`;
    const [ch, cm] = close.split(":").map(Number);
    const defaultEnd = `${String(ch - 1).padStart(2, "0")}:${String(cm || 0).padStart(2, "0")}`;
    updateDayBreaks(dayIndex, [...existing, { start: defaultStart, end: defaultEnd }]);
  };

  const removeBreak = (dayIndex: number, breakIndex: number) => {
    const existing = state.openingHours[dayIndex]?.breaks ?? [];
    updateDayBreaks(dayIndex, existing.filter((_, i) => i !== breakIndex));
  };

  const updateBreak = (dayIndex: number, breakIndex: number, field: "start" | "end", value: string) => {
    const existing = [...(state.openingHours[dayIndex]?.breaks ?? [])];
    if (!existing[breakIndex]) return;
    existing[breakIndex] = { ...existing[breakIndex]!, [field]: value };
    updateDayBreaks(dayIndex, existing);
  };

  const getBreaksError = (dayIndex: number): string | null => {
    const day = state.openingHours[dayIndex];
    if (!day?.open || !day?.close) return null;
    const breaks = day.breaks ?? [];
    const openMin = day.open.split(":").reduce((a, b, i) => a + (i === 0 ? parseInt(b, 10) * 60 : parseInt(b, 10)), 0);
    const closeMin = day.close.split(":").reduce((a, b, i) => a + (i === 0 ? parseInt(b, 10) * 60 : parseInt(b, 10)), 0);
    for (let i = 0; i < breaks.length; i++) {
      const b = breaks[i]!;
      const [sH, sM] = b.start.split(":").map(Number);
      const [eH, eM] = b.end.split(":").map(Number);
      const sMin = (sH ?? 0) * 60 + (sM ?? 0);
      const eMin = (eH ?? 0) * 60 + (eM ?? 0);
      if (sMin >= eMin) return `הפסקה ${i + 1}: שעת התחלה חייבת להיות לפני שעת סיום`;
      if (sMin < openMin || eMin > closeMin) return `הפסקה ${i + 1}: חייבת להיות בתוך שעות הפתיחה`;
      for (let j = i + 1; j < breaks.length; j++) {
        const o = breaks[j]!;
        const oS = (parseInt(o.start.split(":")[0], 10) || 0) * 60 + (parseInt(o.start.split(":")[1], 10) || 0);
        const oE = (parseInt(o.end.split(":")[0], 10) || 0) * 60 + (parseInt(o.end.split(":")[1], 10) || 0);
        if (sMin < oE && eMin > oS) return "הפסקות לא יכולות לחפוף";
      }
    }
    return null;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-6">
      <h2 className="text-xl font-bold text-slate-900">ניהול תורים ושעות פתיחה</h2>
      <p className="text-xs text-slate-500">
        כאן תוכל להגדיר באילו ימים ושעות הסלון פתוח לקבלת לקוחות. הזמנות חדשות
        ייבנו על בסיס שעות הפתיחה האלו.
      </p>

      {onSaveRequest && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSaveRequest}
            className="px-4 py-2 rounded-lg bg-caleno-500 hover:bg-caleno-600 text-white text-sm font-semibold transition-colors"
          >
            שמור שעות פעילות
          </button>
        </div>
      )}

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
              const breaks = day.breaks ?? [];
              const breaksError = getBreaksError(index);
              return (
                <Fragment key={day.day}>
                  <tr className="border-t border-slate-100">
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
                  {!closed && (
                    <tr className="border-t border-slate-100 bg-slate-50/50">
                      <td colSpan={4} className="py-2 px-3">
                        <div className="text-xs">
                          <span className="font-medium text-slate-600">הפסקות</span>
                          {breaks.map((b, bi) => (
                            <div key={bi} className="flex flex-wrap items-center gap-2 mt-1">
                              <input
                                type="time"
                                value={b.start}
                                onChange={(e) => updateBreak(index, bi, "start", e.target.value)}
                                className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-right"
                              />
                              <span className="text-slate-400">–</span>
                              <input
                                type="time"
                                value={b.end}
                                onChange={(e) => updateBreak(index, bi, "end", e.target.value)}
                                className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-right"
                              />
                              <button
                                type="button"
                                onClick={() => removeBreak(index, bi)}
                                className="text-red-600 hover:underline flex items-center gap-1"
                                title="מחק הפסקה"
                              >
                                <span aria-hidden>🗑</span>
                                מחק הפסקה
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addBreak(index)}
                            className="mt-1 text-caleno-600 hover:underline"
                          >
                            הוסף הפסקה
                          </button>
                          {breaksError && (
                            <p className="text-red-600 mt-0.5">{breaksError}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Closed dates (holidays) */}
      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">תאריכים סגורים (חגים)</h3>
        <p className="text-xs text-slate-500 mb-3">
          בימים אלו העסק סגור. לא יוצגו שעות זמינות לאף עובד.
        </p>
        <ClosedDatesEditor
          closedDates={state.closedDates ?? []}
          onChange={(closedDates) => onChange({ ...state, closedDates })}
        />
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


function ClosedDatesEditor({
  closedDates,
  onChange,
}: {
  closedDates: Array<{ date: string; label?: string }>;
  onChange: (closedDates: Array<{ date: string; label?: string }>) => void;
}) {
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addDate = () => {
    setError(null);
    const raw = newDate.trim();
    if (!raw) {
      setError("נא לבחור תאריך");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      setError("תאריך לא תקין (נדרש YYYY-MM-DD)");
      return;
    }
    const existing = closedDates.map((e) => e.date);
    if (existing.includes(raw)) {
      setError("התאריך כבר ברשימה");
      return;
    }
    const next = [...closedDates, { date: raw, label: newLabel.trim() || undefined }].sort(
      (a, b) => a.date.localeCompare(b.date)
    );
    onChange(next);
    setNewDate("");
    setNewLabel("");
  };

  const removeDate = (date: string) => {
    onChange(closedDates.filter((e) => e.date !== date));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-600 mb-0.5">תאריך</label>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-xs text-right"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-0.5">תיאור (אופציונלי)</label>
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="למשל: ערב פסח"
            className="rounded border border-slate-300 px-2 py-1.5 text-xs text-right w-32"
          />
        </div>
        <button
          type="button"
          onClick={addDate}
          className="px-3 py-1.5 rounded-lg bg-caleno-600 text-white text-xs hover:bg-caleno-700"
        >
          הוסף תאריך
        </button>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      {closedDates.length > 0 && (
        <ul className="space-y-1">
          {closedDates.map((e) => (
            <li key={e.date} className="flex items-center gap-2 text-xs">
              <span className="text-slate-700">{e.date}</span>
              {e.label && <span className="text-slate-500">— {e.label}</span>}
              <button
                type="button"
                onClick={() => removeDate(e.date)}
                className="text-red-600 hover:underline"
                aria-label="הסר"
              >
                הסר
              </button>
            </li>
          ))}
        </ul>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              שם הסלון *
            </label>
            <input
              type="text"
              value={siteConfig.salonName}
              onChange={(e) => onChange({ salonName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500 bg-white"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500"
              placeholder="name@example.com"
            />
          </div>
        </div>
      </div>
      )}

      {/* Special Note */}
      {shouldRender("specialNote") && (
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500 resize-none"
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
              <label className="cursor-pointer px-3 py-1.5 text-sm font-medium text-caleno-600 hover:text-caleno-700 border border-caleno-300 rounded-lg">
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
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-caleno-500 hover:bg-caleno-600 text-white text-sm font-medium rounded-lg w-fit disabled:opacity-50">
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
  const { siteConfig, isSaving, saveMessage, handleConfigChange, handleSaveConfig } = useSiteConfig(siteId);
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

  // Build tabs list - single source of truth for tab keys
  const settingsTabs = [
    { key: "basic", label: "מידע בסיסי" },
    { key: "contact", label: "פרטי יצירת קשר" },
    { key: "security", label: "אבטחה" },
  ] as const;

  // Derive type from tabs config to ensure type safety
  type SettingsTabType = typeof settingsTabs[number]["key"];


  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">הגדרות</h1>
          <p className="text-sm text-slate-500 mt-1">
            כאן תוכל לעדכן את כל הפרטים וההגדרות של האתר
          </p>
        </div>
        <div className="flex items-center gap-4">
          {saveMessage && (
            <span className="text-xs text-emerald-600">{saveMessage}</span>
          )}
          <button
            onClick={() => { void handleSaveConfig(); }}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg bg-caleno-500 hover:bg-caleno-600 disabled:bg-caleno-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {isSaving ? "שומר…" : "שמור שינויים"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <AdminTabs
  tabs={settingsTabs}
  activeKey={activeTab}
  onChange={(key) => setActiveTab(key)}
/>


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
                <h2 className="text-lg font-bold text-slate-900 mb-1">אבטחה</h2>
                <p className="text-sm text-slate-500 mb-4">
                  שנה את הסיסמה של החשבון שלך.
                </p>
                <ChangePasswordCard
                  firebaseUser={firebaseUser}
                  onToast={(msg, isError) => setSecurityToast({ message: msg, isError })}
                  logSecurityEvent={logSecurityEvent}
                  tenantId={siteId ?? undefined}
                />
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
    </div>
  );
}
