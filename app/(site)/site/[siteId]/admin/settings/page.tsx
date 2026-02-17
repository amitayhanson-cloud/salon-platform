"use client";

import { useEffect, useState, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DeleteAccountButton from "@/components/admin/DeleteAccountButton";
import SubdomainSettingsCard from "@/components/admin/SubdomainSettingsCard";
import CustomDomainSettingsCard from "@/components/admin/CustomDomainSettingsCard";
import type { SiteConfig } from "@/types/siteConfig";
import type { SalonBookingState } from "@/types/booking";
import { defaultBookingState } from "@/types/booking";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import { useAuth } from "@/components/auth/AuthProvider";
import AdminTabs from "@/components/ui/AdminTabs";
import { deleteUserAccount } from "@/lib/deleteUserAccount";
import { saveBookingSettings, convertSalonBookingStateToBookingSettings, subscribeBookingSettings } from "@/lib/firestoreBookingSettings";
import { subscribeClientTypes, saveClientTypes, seedDefaultClientTypes } from "@/lib/firestoreClientSettings";
import { REGULAR_CLIENT_TYPE_ID } from "@/types/bookingSettings";
import type { BookingSettings, ClientTypeEntry } from "@/types/bookingSettings";
import type { SiteBranding } from "@/types/siteConfig";
import { validateLogoFile } from "@/lib/siteLogoStorage";


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
            תמונת פרופיל (URL)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newReview.avatarUrl}
              onChange={(e) => setNewReview({ ...newReview, avatarUrl: e.target.value })}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500"
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
                      תמונת פרופיל (URL)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={editReview.avatarUrl}
                        onChange={(e) =>
                          setEditReview({ ...editReview, avatarUrl: e.target.value })
                        }
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500"
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
    </div>
  );
}

function slugFromLabel(label: string): string {
  const t = label.trim().toLowerCase();
  if (!t) return "custom";
  return t.replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "") || "custom";
}

function AdminClientsTab({ siteId }: { siteId: string }) {
  const { firebaseUser } = useAuth();
  const [clientTypes, setClientTypes] = useState<ClientTypeEntry[]>([]);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteToast, setDeleteToast] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (!siteId) return;
    const unsub = subscribeClientTypes(siteId, (list) => {
      setClientTypes(list);
    });
    return () => unsub();
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    seedDefaultClientTypes(siteId).catch(() => {});
  }, [siteId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleAdd = async () => {
    setAddError(null);
    const trimmed = newName.trim();
    if (!trimmed) {
      setAddError("נא להזין שם");
      return;
    }
    const lower = trimmed.toLowerCase();
    if (clientTypes.some((t) => t.labelHe.trim().toLowerCase() === lower)) {
      setAddError("סוג כזה כבר קיים");
      return;
    }
    const maxOrder = clientTypes.length ? Math.max(...clientTypes.map((e) => e.sortOrder), 0) + 1 : 0;
    const next = [...clientTypes, { id: slugFromLabel(trimmed), labelHe: trimmed, isSystem: false, sortOrder: maxOrder }];
    setClientTypes(next);
    setNewName("");
    setSaving(true);
    setSaveError(null);
    try {
      await saveClientTypes(siteId, next);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "שגיאה בשמירה");
      setClientTypes(clientTypes);
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (index: number) => {
    const entry = clientTypes[index];
    if (entry?.isSystemDefault) {
      setToast({ message: "לא ניתן לשנות שם של סוג לקוח ברירת מחדל", error: true });
      return;
    }
    setEditingIndex(index);
    setEditValue(entry?.labelHe ?? "");
  };

  const handleSaveEdit = async () => {
    if (editingIndex === null) return;
    setAddError(null);
    const trimmed = editValue.trim();
    if (!trimmed) {
      setAddError("שם לא יכול להיות ריק");
      return;
    }
    const lower = trimmed.toLowerCase();
    const others = clientTypes.filter((_, i) => i !== editingIndex);
    if (others.some((t) => t.labelHe.trim().toLowerCase() === lower)) {
      setAddError("סוג כזה כבר קיים");
      return;
    }
    const next = clientTypes.map((e, i) => (i === editingIndex ? { ...e, labelHe: trimmed } : e));
    setClientTypes(next);
    setEditingIndex(null);
    setEditValue("");
    setSaving(true);
    setSaveError(null);
    try {
      await saveClientTypes(siteId, next);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "שגיאה בשמירה");
      setClientTypes(clientTypes);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (index: number) => {
    const entry = clientTypes[index];
    if (!entry) return;
    if (entry.isSystemDefault) {
      setToast({ message: "סוג לקוח ברירת מחדל לא ניתן למחיקה", error: true });
      return;
    }
    setSaveError(null);
    setDeleteToast(null);
    setToast(null);
    if (!firebaseUser) {
      setSaveError("נדרשת התחברות");
      return;
    }
    setSaving(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/settings/client-types/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, typeId: entry.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const userMessage =
          typeof data.message === "string" && data.message.trim()
            ? data.message
            : "שגיאה במחיקה.";
        setToast({ message: userMessage, error: true });
        return;
      }
      const count = data.reassignedCount ?? 0;
      setClientTypes(clientTypes.filter((_, i) => i !== index));
      setEditingIndex(null);
      if (count > 0) {
        setDeleteToast(`${count} לקוחות עודכנו לרגיל.`);
      }
    } catch (e) {
      setToast({ message: "שגיאה במחיקה.", error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-6">
      <h2 className="text-xl font-bold text-slate-900">סוגי לקוחות</h2>
      <p className="text-xs text-slate-500">
        הוסף, ערוך או מחק סוגי לקוחות. יופיעו בתפריט &quot;סוג לקוח&quot; בכרטיס הלקוח. סוגי ברירת מחדל (רגיל, VIP, פעיל, חדש, רדום) לא ניתנים למחיקה או לשינוי שם. מחיקת סוג מותאם מעבירה את הלקוחות שהיו משויכים אליו לרגיל.
      </p>
      {saveError && (
        <p className="text-sm text-red-600" role="alert">{saveError}</p>
      )}
      {deleteToast && (
        <p className="text-sm text-caleno-600" role="status">{deleteToast}</p>
      )}
      {toast && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-lg shadow-lg text-sm font-medium max-w-md text-center ${
            toast.error ? "bg-red-600 text-white" : "bg-slate-800 text-white"
          }`}
          role="alert"
        >
          {toast.message}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px]">
          <label className="block text-xs font-medium text-slate-700 mb-1">סוג חדש</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setAddError(null); }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500"
            placeholder="למשל: VIP"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="px-4 py-2 bg-caleno-500 hover:bg-caleno-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          הוסף
        </button>
      </div>
      {addError && <p className="text-xs text-red-600">{addError}</p>}
      <ul className="space-y-2">
        {clientTypes.map((entry, index) => (
          <li key={entry.id} className="flex items-center gap-2 py-2 border-b border-slate-100">
            {editingIndex === index ? (
              <>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSaveEdit())}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500"
                  dir="rtl"
                />
                <button type="button" onClick={handleSaveEdit} className="px-3 py-1 bg-caleno-500 hover:bg-caleno-600 text-white rounded text-sm">שמור</button>
                <button type="button" onClick={() => { setEditingIndex(null); setEditValue(""); setAddError(null); }} className="px-3 py-1 bg-slate-200 text-slate-700 rounded text-sm">ביטול</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-slate-800">
                  {entry.labelHe}
                  {entry.isSystemDefault && <span className="text-slate-500 text-xs mr-1">(ברירת מחדל)</span>}
                </span>
                <button type="button" onClick={() => handleStartEdit(index)} disabled={!!entry.isSystemDefault} className="p-1.5 text-slate-500 hover:text-caleno-600 hover:bg-caleno-50 rounded disabled:opacity-50 disabled:cursor-not-allowed" aria-label="ערוך">✎</button>
                <button
                  type="button"
                  onClick={() => handleDelete(index)}
                  disabled={!!entry.isSystemDefault}
                  className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="מחק"
                  title={entry.id === REGULAR_CLIENT_TYPE_ID ? "לא ניתן למחוק" : undefined}
                >
                  🗑
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
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
    const day = { ...updated.openingHours[dayIndex], breaks: breaks.length > 0 ? breaks : undefined };
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
                                className="text-red-600 hover:underline"
                              >
                                הסר
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
              className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:border-caleno-300 hover:bg-caleno-50 transition-colors"
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
                className="w-4 h-4 text-caleno-500 focus:ring-caleno-500"
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500 resize-none"
            placeholder="כתוב כאן הערות או פרטים מיוחדים..."
          />
        </div>
      </div>
      )}

    </div>
  );
}

function BrandingLogoEditor({
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
  const [bookingState, setBookingState] = useState<SalonBookingState | null>(null);
  const [bookingSaveError, setBookingSaveError] = useState<string | null>(null);

  // Tab state for settings sections - MUST be declared before any early returns
  const [activeTab, setActiveTab] = useState<SettingsTabType>("basic");
  
  // Delete account state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);


  // Load booking state from Firestore (source of truth) and sync with localStorage
  useEffect(() => {
    if (typeof window === "undefined" || !siteId) return;
    
    // Subscribe to Firestore booking settings (source of truth)
    const unsubscribe = subscribeBookingSettings(
      siteId,
      (firestoreSettings) => {
        // Convert Firestore BookingSettings to SalonBookingState for admin UI
        const dayLabels = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;
        const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
        const openingHours = (["0", "1", "2", "3", "4", "5", "6"] as const).map((key, i) => {
          const d = firestoreSettings.days[key];
          const enabled = d?.enabled ?? false;
          const breaks = (d as { breaks?: { start: string; end: string }[] })?.breaks;
          return {
            day: dayKeys[i],
            label: dayLabels[i],
            open: enabled ? (d?.start ?? null) : null,
            close: enabled ? (d?.end ?? null) : null,
            breaks: breaks && breaks.length > 0 ? breaks : undefined,
          };
        });
        const closedDates = (firestoreSettings as { closedDates?: Array<{ date: string; label?: string }> }).closedDates;
        const convertedState: SalonBookingState = {
          defaultSlotMinutes: firestoreSettings.slotMinutes,
          openingHours,
          workers: [],
          bookings: [],
          closedDates: Array.isArray(closedDates) && closedDates.length > 0 ? closedDates : [],
        };
        
        setBookingState(convertedState);
        
        // Sync to localStorage for offline access
        if (typeof window !== "undefined") {
          window.localStorage.setItem(`bookingState:${siteId}`, JSON.stringify(convertedState));
        }
        
        if (process.env.NODE_ENV !== "production") {
          console.log(`[Admin] Loaded booking settings from Firestore for site ${siteId}:`, firestoreSettings);
        }
      },
      (err) => {
        console.error("[Admin] Failed to load booking settings from Firestore, falling back to localStorage", err);
        // Fallback to localStorage if Firestore fails
        try {
          const bookingRaw = window.localStorage.getItem(`bookingState:${siteId}`);
          if (bookingRaw) {
            setBookingState(JSON.parse(bookingRaw));
          } else {
            setBookingState(defaultBookingState);
          }
        } catch (e) {
          console.error("Failed to parse booking state from localStorage", e);
          setBookingState(defaultBookingState);
        }
      }
    );
    
    return () => {
      unsubscribe();
    };
  }, [siteId]);

  const validateBreaks = (s: SalonBookingState): string | null => {
    for (let i = 0; i < s.openingHours.length; i++) {
      const day = s.openingHours[i];
      if (!day?.open || !day?.close) continue;
      const breaks = day.breaks ?? [];
      const openMin = day.open.split(":").reduce((a, b, idx) => a + (idx === 0 ? parseInt(b, 10) * 60 : parseInt(b, 10)), 0);
      const closeMin = day.close.split(":").reduce((a, b, idx) => a + (idx === 0 ? parseInt(b, 10) * 60 : parseInt(b, 10)), 0);
      for (let bi = 0; bi < breaks.length; bi++) {
        const b = breaks[bi]!;
        const [sH, sM] = b.start.split(":").map(Number);
        const [eH, eM] = b.end.split(":").map(Number);
        const sMin = (sH ?? 0) * 60 + (sM ?? 0);
        const eMin = (eH ?? 0) * 60 + (eM ?? 0);
        if (sMin >= eMin) return `${day.label}: הפסקה ${bi + 1} – שעת התחלה חייבת להיות לפני שעת סיום`;
        if (sMin < openMin || eMin > closeMin) return `${day.label}: הפסקה ${bi + 1} – חייבת להיות בתוך שעות הפתיחה`;
        for (let j = bi + 1; j < breaks.length; j++) {
          const o = breaks[j]!;
          const oS = (parseInt(o.start.split(":")[0], 10) || 0) * 60 + (parseInt(o.start.split(":")[1], 10) || 0);
          const oE = (parseInt(o.end.split(":")[0], 10) || 0) * 60 + (parseInt(o.end.split(":")[1], 10) || 0);
          if (sMin < oE && eMin > oS) return `${day.label}: הפסקות לא יכולות לחפוף`;
        }
      }
    }
    return null;
  };

  const saveBookingState = async (next: SalonBookingState) => {
    setBookingState(next);
    const err = validateBreaks(next);
    if (err) {
      setBookingSaveError(err);
      return;
    }
    setBookingSaveError(null);
    if (typeof window !== "undefined" && siteId) {
      window.localStorage.setItem(`bookingState:${siteId}`, JSON.stringify(next));
      try {
        const bookingSettings = convertSalonBookingStateToBookingSettings(next);
        await saveBookingSettings(siteId, bookingSettings);
        if (process.env.NODE_ENV !== "production") {
          console.log("[Admin] Saved booking settings to Firestore for site", siteId, bookingSettings);
        }
      } catch (error) {
        console.error("[Admin] Failed to save booking settings to Firestore:", error);
      }
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
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600 text-sm">טוען את נתוני הסלון…</p>
      </div>
    );
  }

  // Build tabs list - single source of truth for tab keys
  const settingsTabs = [
    { key: "basic", label: "מידע בסיסי" },
    { key: "contact", label: "פרטי יצירת קשר" },
    { key: "booking", label: "הזמנה אונליין" },
    { key: "branding", label: "לוגו ומיתוג" },
    { key: "reviews", label: "ביקורות" },
    { key: "faq", label: "FAQ" },
    { key: "hours", label: "שעות פעילות" },
    { key: "clients", label: "לקוחות" },
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
            <AdminSiteTab
              siteConfig={siteConfig}
              onChange={handleConfigChange}
              renderSections={["basic", "location", "specialNote"]}
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
          {activeTab === "branding" && (
            <BrandingLogoEditor
              siteId={siteId}
              siteConfig={siteConfig}
              onChange={handleConfigChange}
              onSave={handleSaveConfig}
              isSaving={isSaving}
              getToken={async () => (firebaseUser ? await firebaseUser.getIdToken() : null)}
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
            <>
              {bookingSaveError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 text-right">
                  {bookingSaveError}
                </div>
              )}
              <AdminBookingTab
                state={bookingState}
                onChange={saveBookingState}
              />
            </>
          )}
          {activeTab === "clients" && <AdminClientsTab siteId={siteId} />}
        </div>
      </div>

      {/* Subdomain section */}
      <SubdomainSettingsCard firebaseUser={firebaseUser} />

      {/* Custom Domain section */}
      <div className="mt-6">
        <CustomDomainSettingsCard siteId={siteId} firebaseUser={firebaseUser} />
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
