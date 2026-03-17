"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { subscribeClientTypes, saveClientTypes, seedDefaultClientTypes } from "@/lib/firestoreClientSettings";
import { REGULAR_CLIENT_TYPE_ID, DEFAULT_CLIENT_TYPE_ENTRIES } from "@/types/bookingSettings";
import type { ClientTypeEntry } from "@/types/bookingSettings";

const DEFAULT_TYPE_LABELS = DEFAULT_CLIENT_TYPE_ENTRIES.map((e) => e.labelHe).join(", ");

function slugFromLabel(label: string): string {
  const t = label.trim().toLowerCase();
  if (!t) return "custom";
  return t.replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "") || "custom";
}

export default function AdminClientsTab({ siteId }: { siteId: string }) {
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
        <p className="text-sm text-caleno-deep" role="status">{deleteToast}</p>
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep"
            placeholder="למשל: VIP"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          className="rounded-lg bg-caleno-ink px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md disabled:opacity-50"
        >
          הוסף
        </button>
        <span className="text-sm text-slate-600 py-2">
          אלו סוגי ברירת המחדל שיש לך כרגע: ({DEFAULT_TYPE_LABELS})
        </span>
      </div>
      {addError && <p className="text-xs text-red-600">{addError}</p>}
      <ul className="space-y-2">
        {clientTypes
          .map((entry, i) => ({ entry, originalIndex: i }))
          .filter(({ entry }) => !entry.isSystemDefault)
          .map(({ entry, originalIndex }) => (
          <li key={entry.id} className="flex items-center gap-2 py-2 border-b border-slate-100">
            {editingIndex === originalIndex ? (
              <>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleSaveEdit())}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-caleno-deep"
                  dir="rtl"
                />
                <button type="button" onClick={handleSaveEdit} className="rounded bg-caleno-ink px-3 py-1 text-sm text-white shadow-sm hover:bg-[#1E293B]">שמור</button>
                <button type="button" onClick={() => { setEditingIndex(null); setEditValue(""); setAddError(null); }} className="px-3 py-1 bg-slate-200 text-slate-700 rounded text-sm">ביטול</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-slate-800">{entry.labelHe}</span>
                <button type="button" onClick={() => handleStartEdit(originalIndex)} className="rounded p-1.5 text-[#64748B] hover:bg-[rgba(15,23,42,0.04)] hover:text-[#1E6F7C]" aria-label="ערוך">✎</button>
                <button
                  type="button"
                  onClick={() => handleDelete(originalIndex)}
                  className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                  aria-label="מחק"
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
