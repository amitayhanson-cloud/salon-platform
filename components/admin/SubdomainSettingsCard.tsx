"use client";

import { useState, useEffect, useCallback } from "react";
import type { User as FirebaseUser } from "firebase/auth";

const ROOT_HOST = "caleno.co";

function normalizeSlugInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

type SubdomainSettingsCardProps = {
  firebaseUser: FirebaseUser | null;
};

export default function SubdomainSettingsCard({ firebaseUser }: SubdomainSettingsCardProps) {
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [newSlug, setNewSlug] = useState("");
  const [checkLoading, setCheckLoading] = useState(false);
  const [changeLoading, setChangeLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<{ available: boolean; reason?: string } | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);

  const fetchCurrentSlug = useCallback(async () => {
    if (!firebaseUser) {
      setLoadingMe(false);
      return;
    }
    setLoadingMe(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/tenants/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { slug?: string | null };
        setCurrentSlug(typeof data.slug === "string" && data.slug ? data.slug : null);
      } else {
        setCurrentSlug(null);
      }
    } catch {
      setCurrentSlug(null);
    } finally {
      setLoadingMe(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    fetchCurrentSlug();
  }, [fetchCurrentSlug]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewSlug(normalizeSlugInput(e.target.value));
    setCheckResult(null);
    setChangeError(null);
  };

  const handleCheck = async () => {
    const slug = newSlug.trim();
    if (!slug) {
      setCheckResult({ available: false, reason: "נא להזין תת-דומיין." });
      return;
    }
    setCheckLoading(true);
    setCheckResult(null);
    try {
      const res = await fetch(`/api/tenants/check?slug=${encodeURIComponent(slug)}`);
      const data = (await res.json().catch(() => ({}))) as { available: boolean; reason?: string };
      setCheckResult({ available: data.available, reason: data.reason });
    } catch {
      setCheckResult({ available: false, reason: "שגיאת רשת." });
    } finally {
      setCheckLoading(false);
    }
  };

  const handleChange = async () => {
    const slug = newSlug.trim();
    if (!slug || !firebaseUser) return;
    if (checkResult?.available !== true) return;
    setChangeLoading(true);
    setChangeError(null);
    setSuccessUrl(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/tenants/change", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newSlug: slug }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        url?: string;
      };
      if (res.ok && data.success) {
        setCurrentSlug(slug);
        setNewSlug("");
        setCheckResult(null);
        setSuccessUrl(data.url ?? `https://${slug}.${ROOT_HOST}`);
      } else {
        setChangeError(data.error ?? "שגיאה בהחלפת התת-דומיין.");
      }
    } catch {
      setChangeError("שגיאת רשת.");
    } finally {
      setChangeLoading(false);
    }
  };

  const canChange = checkResult?.available === true && newSlug.trim().length > 0 && !changeLoading;

  if (!firebaseUser) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right">
      <h2 className="text-lg font-bold text-slate-900 mb-4">תת-דומיין</h2>

      {/* Current subdomain */}
      <div className="mb-4">
        <p className="text-sm font-medium text-slate-700 mb-1">תת-דומיין נוכחי</p>
        {loadingMe ? (
          <p className="text-slate-500 text-sm">טוען…</p>
        ) : currentSlug ? (
          <p className="text-slate-800 text-sm font-mono" dir="ltr">
            https://{currentSlug}.{ROOT_HOST}
          </p>
        ) : (
          <p className="text-slate-500 text-sm">לא הוגדר עדיין</p>
        )}
      </div>

      {/* New subdomain input */}
      <div className="mb-4">
        <label htmlFor="subdomain-new" className="block text-sm font-medium text-slate-700 mb-2">
          תת-דומיין חדש
        </label>
        <input
          id="subdomain-new"
          type="text"
          value={newSlug}
          onChange={handleInputChange}
          placeholder="example"
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500 font-mono"
          dir="ltr"
          maxLength={30}
        />
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={handleCheck}
          disabled={checkLoading || !newSlug.trim()}
          className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-sm font-medium transition-colors"
        >
          {checkLoading ? "בודק…" : "בדוק זמינות"}
        </button>
        <button
          type="button"
          onClick={handleChange}
          disabled={!canChange}
          className="px-4 py-2 rounded-lg bg-caleno-500 hover:bg-caleno-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          {changeLoading ? "מחליף…" : "החלף תת-דומיין"}
        </button>
      </div>

      {/* Check result */}
      {checkResult !== null && (
        <p
          className={`text-sm mb-2 ${
            checkResult.available ? "text-green-600" : "text-amber-600"
          }`}
        >
          {checkResult.available ? (
            <>✅ זמין</>
          ) : checkResult.reason === "תת-דומיין זה תפוס." ? (
            <>❌ תפוס</>
          ) : (
            <>❌ שגוי ({checkResult.reason ?? "לא תקין"})</>
          )}
        </p>
      )}

      {/* Change error */}
      {changeError && (
        <p className="text-sm text-red-600 mb-2">{changeError}</p>
      )}

      {/* Success + link */}
      {successUrl && (
        <div className="p-3 bg-caleno-50 border border-caleno-200 rounded-lg text-sm">
          <p className="font-medium text-slate-800 mb-1">התת-דומיין עודכן בהצלחה</p>
          <a
            href={`${successUrl.replace(/\/$/, "")}/admin`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-caleno-600 hover:underline break-all"
            dir="ltr"
          >
            {successUrl}/admin
          </a>
        </div>
      )}
    </div>
  );
}
