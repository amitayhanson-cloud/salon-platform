"use client";

import { useEffect, useState } from "react";
import {
  subscribeCleanupSettings,
  saveCleanupSettings,
  type CleanupSettings,
  type ExpiredAutoDelete,
} from "@/lib/firestoreCleanupSettings";

interface AutoCleanupSettingsProps {
  siteId: string;
}

/**
 * Reusable UI for expired-bookings auto-delete frequency.
 * Subscribes to and saves cleanup settings for the given site.
 */
export default function AutoCleanupSettings({ siteId }: AutoCleanupSettingsProps) {
  const [cleanupSettings, setCleanupSettings] = useState<CleanupSettings>({ expiredAutoDelete: "off" });
  const [cleanupSaving, setCleanupSaving] = useState(false);

  useEffect(() => {
    if (!siteId) return;
    const unsubscribe = subscribeCleanupSettings(
      siteId,
      (s) => setCleanupSettings(s),
      (e) => console.error("[AutoCleanupSettings] cleanup settings error", e)
    );
    return () => unsubscribe();
  }, [siteId]);

  const onExpiredAutoDeleteChange = async (value: ExpiredAutoDelete) => {
    if (!siteId) return;
    setCleanupSaving(true);
    try {
      await saveCleanupSettings(siteId, { expiredAutoDelete: value });
      setCleanupSettings((prev) => ({ ...prev, expiredAutoDelete: value }));
    } catch (e) {
      console.error("[AutoCleanupSettings] save cleanup settings", e);
    } finally {
      setCleanupSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" dir="rtl">
      <h3 className="text-sm font-semibold text-slate-900">מחיקה אוטומטית של תורים שפג תוקפם</h3>
      <p className="text-xs text-slate-500">
        תורים שפג תוקפם = תורים שהתאריך שלהם עבר
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="expired-auto-delete" className="text-sm font-medium text-slate-700">
          תדירות
        </label>
        <select
          id="expired-auto-delete"
          value={cleanupSettings.expiredAutoDelete}
          onChange={(e) => onExpiredAutoDeleteChange(e.target.value as ExpiredAutoDelete)}
          disabled={cleanupSaving}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 disabled:opacity-50"
        >
          <option value="off">כבוי</option>
          <option value="daily">כל יום</option>
          <option value="weekly">כל שבוע</option>
          <option value="monthly">כל חודש</option>
          <option value="quarterly">כל 3 חודשים</option>
        </select>
      </div>
    </div>
  );
}
