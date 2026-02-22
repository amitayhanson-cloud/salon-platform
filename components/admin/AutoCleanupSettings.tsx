"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

interface AutoCleanupSettingsProps {
  siteId: string;
  onToast?: (message: string, isError?: boolean) => void;
}

const isDev = typeof process !== "undefined" && process.env.NODE_ENV === "development";

/**
 * Shows that automatic cleanup of past bookings runs daily. No frequency selector.
 * "Run cleanup now" button visible only in development or to admins.
 */
export default function AutoCleanupSettings({ siteId, onToast }: AutoCleanupSettingsProps) {
  const { firebaseUser } = useAuth();
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const handleRunCleanup = async () => {
    if (!siteId || !firebaseUser || cleanupLoading) return;
    setCleanupLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/admin/run-booking-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, dryRun: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error === "forbidden" ? "אין הרשאה" : data.error || "שגיאה";
        onToast?.(msg, true);
        return;
      }
      const { scanned, archived, skippedFollowups, errors, dryRun } = data;
      const msg = dryRun
        ? `סימולציה: נסרקו ${scanned}, ארכוב ${archived}, follow-ups ${skippedFollowups}`
        : `נוקה: נסרקו ${scanned}, ארכוב ${archived}, follow-ups ${skippedFollowups}${errors > 0 ? `, שגיאות: ${errors}` : ""}`;
      onToast?.(msg, false);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "שגיאה", true);
    } finally {
      setCleanupLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <h3 className="text-sm font-semibold text-slate-900">מחיקה אוטומטית של תורים שפג תוקפם</h3>
      <p className="text-xs text-slate-500">
        ניקוי תורים שפג תוקפם מתבצע אוטומטית פעם ביום בעת כניסת מנהל למערכת.
      </p>
      <p className="text-xs font-medium text-green-700">פעיל</p>
      {isDev && (
        <button
          type="button"
          onClick={handleRunCleanup}
          disabled={cleanupLoading || !firebaseUser}
          className="mt-2 px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cleanupLoading ? "מריץ..." : "הרץ ניקוי עכשיו"}
        </button>
      )}
    </div>
  );
}
