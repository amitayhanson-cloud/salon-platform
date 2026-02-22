"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import ConfirmModal from "@/components/ui/ConfirmModal";

interface CleanupCardProps {
  siteId: string;
  onToast?: (message: string, isError?: boolean) => void;
  onComplete?: () => void;
}

/**
 * Manual "Run Cleanup Now" card for the main admin panel.
 * Calls POST /api/admin/run-booking-cleanup with siteId and optional dryRun.
 */
export default function CleanupCard({ siteId, onToast, onComplete }: CleanupCardProps) {
  const { firebaseUser } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDryRun, setPendingDryRun] = useState(false);
  const [loading, setLoading] = useState(false);

  const runCleanup = async (dryRun: boolean) => {
    if (!siteId || !firebaseUser || loading) return;
    setLoading(true);
    setConfirmOpen(false);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/admin/run-booking-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, dryRun }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = data?.error;
        if (typeof errMsg === "string" && /quota|RESOURCE_EXHAUSTED|exhausted/i.test(errMsg)) {
          onToast?.("עומס על המערכת. נסה שוב בעוד רגע.", true);
        } else if (data?.error === "forbidden") {
          onToast?.("אין הרשאה", true);
        } else {
          onToast?.(errMsg || "שגיאה", true);
        }
        return;
      }

      const { scanned = 0, archived = 0, skippedFollowups = 0, deletedActive, dryRun: wasDryRun } = data;
      const removed = deletedActive ?? archived + skippedFollowups;
      const msg = wasDryRun
        ? `בדיקה: נסרקו ${scanned} תורים • הועברו לארכיון ${archived} • נמחקו ${skippedFollowups}`
        : `נסרקו ${scanned} תורים • הועברו לארכיון ${archived} • נמחקו ${removed}`;
      onToast?.(msg, false);
      onComplete?.();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "שגיאה", true);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    runCleanup(pendingDryRun);
  };

  const openConfirm = (dryRun: boolean) => {
    setPendingDryRun(dryRun);
    setConfirmOpen(true);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5" dir="rtl">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">ניקוי תורים שפג תוקפם</h3>
      <p className="text-xs text-slate-500 mb-4">
        מוחק תורים שעברו מהיומן ושומר אותם בארכיון לפי הכללים.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openConfirm(false)}
          disabled={loading || !firebaseUser}
          className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "מריץ…" : "הרץ ניקוי עכשיו"}
        </button>
        <button
          type="button"
          onClick={() => openConfirm(true)}
          disabled={loading || !firebaseUser}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          הרץ בדיקה (ללא מחיקה)
        </button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        onConfirm={handleConfirm}
        onClose={() => !loading && setConfirmOpen(false)}
        title="הרצת ניקוי תורים"
        message={
          pendingDryRun
            ? "זהו מצב בדיקה – לא יבוצעו שינויים. להמשיך?"
            : "הפעולה תסיר מהיומן את כל התורים מהעבר ותעביר אותם לארכיון. להמשיך?"
        }
        confirmLabel={pendingDryRun ? "הרץ בדיקה" : "הרץ ניקוי"}
        cancelLabel="ביטול"
        submitting={loading}
        submittingLabel="מריץ…"
      />
    </div>
  );
}
