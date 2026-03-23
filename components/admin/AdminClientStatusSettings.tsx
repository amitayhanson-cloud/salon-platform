"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  seedDefaultClientStatusSettings,
  subscribeClientStatusSettings,
} from "@/lib/firestoreClientSettings";
import type { ClientStatusSettings, ManualClientTag } from "@/types/clientStatus";
import { DEFAULT_CLIENT_STATUS_SETTINGS } from "@/types/clientStatus";
import { automatedStatusBadgeClass } from "@/lib/clientStatusBadgeStyles";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesContext";
import { triggerClientStatusRecomputeOncePerSession } from "@/lib/triggerClientStatusRecompute";

/** Stable JSON for dirty comparison (tag order normalized). */
function canonicalSettingsJson(s: ClientStatusSettings): string {
  const tags = [...s.manualTags].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
  );
  return JSON.stringify({
    statusRules: { ...s.statusRules },
    manualTags: tags,
  });
}

function slugFromLabel(label: string): string {
  const t = label.trim().toLowerCase();
  if (!t) return "tag";
  return t.replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "") || "tag";
}

export default function AdminClientStatusSettings({ siteId }: { siteId: string }) {
  const { firebaseUser } = useAuth();
  const unsavedCtx = useUnsavedChanges();
  const baselineRef = useRef<string | null>(null);
  const [syncTick, setSyncTick] = useState(0);

  const [settings, setSettings] = useState<ClientStatusSettings>(DEFAULT_CLIENT_STATUS_SETTINGS);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId) return;
    baselineRef.current = null;
    setSettings(DEFAULT_CLIENT_STATUS_SETTINGS);
    let cancelled = false;
    (async () => {
      try {
        await seedDefaultClientStatusSettings(siteId);
      } catch {
        /* ignore */
      }
      if (cancelled || !firebaseUser) return;
      await triggerClientStatusRecomputeOncePerSession(siteId, () => firebaseUser.getIdToken());
    })();
    const unsub = subscribeClientStatusSettings(siteId, (incoming) => {
      const canon = canonicalSettingsJson(incoming);
      setSettings((prev) => {
        const prevCanon = canonicalSettingsJson(prev);
        if (baselineRef.current === null) {
          baselineRef.current = canon;
          return incoming;
        }
        if (prevCanon !== baselineRef.current) {
          return prev;
        }
        baselineRef.current = canon;
        return incoming;
      });
    });
    return () => {
      cancelled = true;
      unsub();
      baselineRef.current = null;
    };
  }, [siteId, firebaseUser]);

  const tags = useMemo(
    () => [...settings.manualTags].sort((a, b) => a.sortOrder - b.sortOrder),
    [settings.manualTags]
  );

  const hasDirty = useMemo(() => {
    void syncTick;
    return (
      baselineRef.current !== null &&
      canonicalSettingsJson(settings) !== baselineRef.current
    );
  }, [settings, syncTick]);

  const performSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("נדרשת התחברות מחדש");
      const res = await fetch("/api/settings/client-status/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, settings }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "שמירה נכשלה");
      setMessage(`נשמר בהצלחה. עודכנו ${data.updatedClients ?? 0} לקוחות.`);
      baselineRef.current = canonicalSettingsJson(settings);
      setSyncTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }, [firebaseUser, siteId, settings]);

  useEffect(() => {
    if (!unsavedCtx) return;
    unsavedCtx.setUnsaved(hasDirty, () => performSave());
    return () => {
      unsavedCtx.setUnsaved(false, () => {});
    };
  }, [unsavedCtx, hasDirty, performSave]);

  useEffect(() => {
    if (!hasDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasDirty]);

  const addTag = () => {
    const label = newTag.trim();
    if (!label) return;
    if (tags.some((t) => t.label.toLowerCase() === label.toLowerCase())) return;
    const idBase = slugFromLabel(label);
    let id = idBase;
    let suffix = 2;
    while (tags.some((t) => t.id === id)) {
      id = `${idBase}-${suffix}`;
      suffix += 1;
    }
    const next: ManualClientTag[] = [...tags, { id, label, sortOrder: tags.length }];
    setSettings((prev) => ({ ...prev, manualTags: next }));
    setNewTag("");
  };

  const removeTag = (id: string) => {
    const next = tags.filter((t) => t.id !== id).map((t, i) => ({ ...t, sortOrder: i }));
    setSettings((prev) => ({ ...prev, manualTags: next }));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right space-y-8" dir="rtl">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-slate-900">חוקי סטטוס אוטומטיים</h2>
        <p className="text-sm text-slate-600">
          כאן מגדירים את סוגי הלקוחות האוטומטיים במערכת:{" "}
          <span className={automatedStatusBadgeClass("new")}>חדש</span>
          {", "}
          <span className={automatedStatusBadgeClass("active")}>פעיל</span>
          {", "}
          <span className={automatedStatusBadgeClass("normal")}>רגיל</span>
          {", "}
          <span className={automatedStatusBadgeClass("sleeping")}>רדום</span>
          .
        </p>
        <p className="text-sm text-slate-600">
          הסטטוס מחושב לפי היסטוריית תורים (כולל תורים שהוסרו מהיומן), ללא ביטולים.{" "}
          <span className={automatedStatusBadgeClass("sleeping")}>רדום</span> — בלי תורים רלוונטיים בכלל, או בלי תור
          שכבר התקיים בחלון שמוגדר למטה. <span className={automatedStatusBadgeClass("active")}>פעיל</span> — רק תורים
          שכבר עברו (לא עתידיים) נספרים בחלון הימים האחרונים.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="rounded-xl border border-slate-200 p-4 bg-slate-50/70 space-y-2">
          <span className="text-sm text-slate-700">
            לקוח ייחשב <span className={automatedStatusBadgeClass("new")}>חדש</span> אם יש לו היסטוריה, אבל פחות מ־
          </span>
          <input
            type="number"
            min={1}
            value={settings.statusRules.newMaxTotalBookings}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                statusRules: { ...p.statusRules, newMaxTotalBookings: Number(e.target.value) || 1 },
              }))
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <span className="text-sm text-slate-600">תורים בסך הכול (לקוח בלי היסטוריה רלוונטית יסומן רדום).</span>
        </label>

        <label className="rounded-xl border border-slate-200 p-4 bg-slate-50/70 space-y-2">
          <span className="text-sm text-slate-700">
            לקוח ייחשב <span className={automatedStatusBadgeClass("active")}>פעיל</span> אם יש לו לפחות
          </span>
          <input
            type="number"
            min={1}
            value={settings.statusRules.activeMinBookings}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                statusRules: { ...p.statusRules, activeMinBookings: Number(e.target.value) || 1 },
              }))
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <span className="text-sm text-slate-600">תורים שכבר התקיימו ב־</span>
          <input
            type="number"
            min={1}
            value={settings.statusRules.activeWindowDays}
            onChange={(e) =>
              setSettings((p) => ({
                ...p,
                statusRules: { ...p.statusRules, activeWindowDays: Number(e.target.value) || 1 },
              }))
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <span className="text-sm text-slate-600">הימים האחרונים.</span>
        </label>

        <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/70 space-y-2 md:col-span-2">
          <span className="text-sm text-slate-700">
            לקוח ייחשב <span className={automatedStatusBadgeClass("sleeping")}>רדום</span> אם לא היה לו תור שכבר התקיים
            ב־
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-[180px_160px] gap-3">
            <input
              type="number"
              min={1}
              value={settings.statusRules.sleepingNoBookingsFor}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  statusRules: { ...p.statusRules, sleepingNoBookingsFor: Number(e.target.value) || 1 },
                }))
              }
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
            <select
              value={settings.statusRules.sleepingWindowUnit}
              onChange={(e) =>
                setSettings((p) => ({
                  ...p,
                  statusRules: {
                    ...p.statusRules,
                    sleepingWindowUnit: e.target.value === "months" ? "months" : "days",
                  },
                }))
              }
              className="rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="days">ימים</option>
              <option value="months">חודשים</option>
            </select>
          </div>
          <p className="text-sm text-slate-600">
            כל היתר יסומנו כ־<span className={automatedStatusBadgeClass("normal")}>רגיל</span>.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900">תגיות ידניות</h3>
        <p className="text-sm text-slate-600">
          למשל: VIP, משפחה, קשה. תגיות אלה ניתנות להצמדה ידנית בכרטיס לקוח.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="תגית חדשה"
            className="rounded-lg border border-slate-300 px-3 py-2 min-w-[220px]"
          />
          <button
            type="button"
            onClick={addTag}
            className="rounded-lg bg-caleno-deep px-4 py-2 text-white text-sm font-medium shadow-sm transition-all hover:opacity-90"
          >
            הוסף תגית
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm"
            >
              {t.label}
              <button
                type="button"
                onClick={() => removeTag(t.id)}
                className="text-slate-500 hover:text-red-600"
                aria-label={`מחק ${t.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {hasDirty && (
        <div>
          <button
            type="button"
            onClick={() => void performSave()}
            disabled={saving}
            className="rounded-lg bg-caleno-ink px-5 py-2 text-white text-sm font-medium shadow-sm transition-all hover:bg-[#1E293B] disabled:opacity-50"
          >
            {saving ? "שומר..." : "שמור ועדכן סטטוסים לכל הלקוחות"}
          </button>
        </div>
      )}
    </div>
  );
}
