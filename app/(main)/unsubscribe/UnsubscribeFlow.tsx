"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useMemo, useState } from "react";

type Phase = "confirm" | "loading" | "success" | "error";

function sanitizePhoneInput(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  const trimmed = raw.replace(/\s+/g, "").replace(/-/g, "");
  return trimmed.startsWith("+") ? "+" + trimmed.slice(1).replace(/\+/g, "") : trimmed.replace(/\+/g, "");
}

function safeDecodePhoneParam(raw: string): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function UnsubscribeFlow() {
  const searchParams = useSearchParams();
  const phoneFromUrl = useMemo(() => {
    const p = searchParams.get("phone");
    return p ? safeDecodePhoneParam(p.trim()) : "";
  }, [searchParams]);

  const [manualPhone, setManualPhone] = useState("");
  const [phase, setPhase] = useState<Phase>("confirm");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const effectivePhone = useMemo(() => {
    const fromUrl = sanitizePhoneInput(phoneFromUrl);
    if (fromUrl) return fromUrl;
    return sanitizePhoneInput(manualPhone);
  }, [phoneFromUrl, manualPhone]);

  const canSubmit = useMemo(() => {
    const digits = effectivePhone.replace(/\D/g, "");
    return digits.length >= 9;
  }, [effectivePhone]);

  const submit = useCallback(async () => {
    if (!canSubmit || phase === "loading") return;
    setPhase("loading");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/waitlist/opt-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: effectivePhone }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setPhase("error");
        setErrorMessage(data?.error || "משהו השתבש. נסו שוב.");
        return;
      }
      setPhase("success");
    } catch {
      setPhase("error");
      setErrorMessage("שגיאת רשת. נסו שוב.");
    }
  }, [canSubmit, effectivePhone, phase]);

  function onSubmitForm(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  if (phase === "success") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center sm:py-24" dir="rtl">
        <div className="rounded-3xl border border-caleno-200/80 bg-white/90 p-8 shadow-[0_20px_50px_-24px_rgba(15,69,80,0.25)] ring-1 ring-caleno-100/80">
          <h1 className="text-2xl font-semibold tracking-tight text-caleno-ink">הוסרתם מהרשימה</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            לא יישלחו אליכם עוד הודעות שיווק או שידורים מקלינו למספר הזה. אם אתם לקוחות עסק דרך קלינו, בית העסק
            עדיין יכול ליצור עמכם קשר בנוגע לתורים.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex min-h-[44px] min-w-[160px] items-center justify-center rounded-full bg-caleno-deep px-6 text-sm font-medium text-white transition hover:bg-caleno-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caleno-deep"
          >
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center sm:py-24" dir="rtl">
      <div className="rounded-3xl border border-caleno-200/80 bg-white/90 p-8 shadow-[0_20px_50px_-24px_rgba(15,69,80,0.25)] ring-1 ring-caleno-100/80">
        <h1 className="text-2xl font-semibold tracking-tight text-caleno-ink">העדפות דיוור</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          להפסיק לקבל הודעות שיווק ושידור ב-WhatsApp מקלינו. פעולה זו אינה מבטלת תורים קיימים אצל בית העסק.
        </p>

        {!phoneFromUrl ? (
          <div className="mt-6 text-right">
            <label htmlFor="unsub-phone" className="block text-right text-sm font-medium text-caleno-ink">
              מספר טלפון
            </label>
            <input
              id="unsub-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="לדוגמה: 050-1234567"
              value={manualPhone}
              onChange={(e) => setManualPhone(e.target.value)}
              className="mt-2 w-full rounded-xl border border-caleno-200 bg-white px-4 py-3 text-right text-base text-caleno-ink outline-none ring-caleno-200 transition placeholder:text-gray-400 focus:border-caleno-deep focus:ring-2 focus:ring-caleno-deep/20"
            />
            <p className="mt-2 text-xs text-gray-500">
              או השתמשו בקישור האישי מהודעת ה-WhatsApp (אם קיבלתם).
            </p>
          </div>
        ) : (
          <p className="mt-4 text-xs text-gray-500">נשתמש במספר מהקישור שקיבלתם.</p>
        )}

        {phase === "error" && errorMessage ? (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <form onSubmit={onSubmitForm} className="mt-8">
          <button
            type="submit"
            disabled={!canSubmit || phase === "loading"}
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-caleno-deep px-6 text-sm font-semibold text-white transition hover:bg-caleno-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caleno-deep"
          >
            {phase === "loading" ? "מעבדים…" : "לחצו להסרה מהרשימה"}
          </button>
        </form>

        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-caleno-deep underline-offset-4 hover:underline"
        >
          ביטול · חזרה לדף הבית
        </Link>
      </div>
    </div>
  );
}
