"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DeleteAccountButton from "@/components/admin/DeleteAccountButton";
import type { SiteConfig } from "@/types/siteConfig";
import type { SalonBookingState } from "@/types/booking";
import { defaultBookingState } from "@/types/booking";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { useAuth } from "@/components/auth/AuthProvider";
import AdminTabs from "@/components/ui/AdminTabs";
import { deleteUserAccount } from "@/lib/deleteUserAccount";


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


const bookingOptionLabels: Record<SiteConfig["bookingOption"], string> = {
  simple_form: "כן, אני רוצה הזמנות אונליין",
  none: "לא, בלי הזמנות אונליין כרגע",
  booking_system: "יש לי כבר מערכת הזמנות ואני רוצה לחבר אותה",
};


const salonTypeLabels: Record<SiteConfig["salonType"], string> = {
  hair: "ספרות / עיצוב שיער",
  nails: "מניקור / פדיקור",
  barber: "ברברשופ",
  spa: "ספא / טיפולי גוף",
  mixed: "משולב",
  other: "אחר",
};



function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}



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
      )}

      {/* Location */}
      {shouldRender("location") && (
      <div className="space-y-4">
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
      )}

      {/* Booking Option */}
      {shouldRender("booking") && (
      <div className="space-y-4">
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
            placeholder="כתוב כאן הערות או פרטים מיוחדים..."
          />
        </div>
      </div>
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
  const [bookingState, setBookingState] = useState<SalonBookingState | null>(null);
  
  // Tab state for settings sections - MUST be declared before any early returns
  const [activeTab, setActiveTab] = useState<SettingsTabType>("basic");
  
  // Delete account state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);


  // Load booking state
  useEffect(() => {
    if (typeof window === "undefined" || !siteId) return;
    try {
      const bookingRaw = window.localStorage.getItem(`bookingState:${siteId}`);
      if (bookingRaw) {
        setBookingState(JSON.parse(bookingRaw));
      } else {
        setBookingState(defaultBookingState);
      }
    } catch (e) {
      console.error("Failed to parse booking state", e);
      setBookingState(defaultBookingState);
    }
  }, [siteId]);

  const saveBookingState = (next: SalonBookingState) => {
    setBookingState(next);
    if (typeof window !== "undefined" && siteId) {
      window.localStorage.setItem(`bookingState:${siteId}`, JSON.stringify(next));
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
      
      // Clear localStorage
      if (typeof window !== "undefined") {
        // Clear all user-related localStorage items
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && (key.startsWith(`siteConfig:${firebaseUser.uid}`) || 
                      key.startsWith(`bookingState:${firebaseUser.uid}`))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => window.localStorage.removeItem(key));
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
  if (!siteConfig || !bookingState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600 text-sm">טוען את נתוני הסלון…</p>
      </div>
    );
  }

  // Build tabs list (conditionally include reviews/faq)
  type SettingsTabType =
  | "basic"
  | "contact"
  | "booking"
  | "reviews"
  | "faq"
  | "hours";

const settingsTabs: { key: SettingsTabType; label: string }[] = [
  { key: "basic", label: "מידע בסיסי" },
  { key: "contact", label: "פרטי יצירת קשר" },
  { key: "booking", label: "הזמנה אונליין" },
  { key: "reviews", label: "ביקורות" },
  { key: "faq", label: "FAQ" },
  { key: "hours", label: "שעות פעילות" },
];


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
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
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
            <AdminSiteTab
              siteConfig={siteConfig}
              onChange={handleConfigChange}
              renderSections={["basic", "location", "specialNote"]}
            />
          )}
          {activeTab === "style" && (
            <AdminSiteTab
              siteConfig={siteConfig}
              onChange={handleConfigChange}
              renderSections={["style"]}
            />
          )}
          {activeTab === "contact" && (
            <AdminSiteTab
              siteConfig={siteConfig}
              onChange={handleConfigChange}
              renderSections={["contact"]}
            />
          )}
          {activeTab === "booking" && (
            <AdminSiteTab
              siteConfig={siteConfig}
              onChange={handleConfigChange}
              renderSections={["booking"]}
            />
          )}
          {activeTab === "reviews" && (
            <AdminReviewsEditor
              reviews={siteConfig.reviews || []}
              onChange={(reviews) => handleConfigChange({ reviews })}
            />
          )}
          {activeTab === "faq" && (
            <AdminFaqEditor
              faqs={siteConfig.faqs || []}
              onChange={(faqs) => handleConfigChange({ faqs })}
            />
          )}
          {activeTab === "hours" && (
            <AdminBookingTab
              state={bookingState}
              onChange={saveBookingState}
            />
          )}
        </div>
      </div>

      {/* Delete Account Section - Only button by default */}
      <DeleteAccountButton
        onDelete={handleDeleteAccount}
        isDeleting={isDeleting}
        deleteError={deleteError}
      />
    </div>
  );
}
