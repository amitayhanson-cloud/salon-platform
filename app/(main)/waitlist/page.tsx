"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PartyPopper } from "lucide-react";
import { getMarketingSocialUrls } from "@/lib/marketingSocialUrls";

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

function sanitizePhone(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  const trimmed = raw.replace(/\s+/g, "").replace(/-/g, "");
  return trimmed.startsWith("+") ? "+" + trimmed.slice(1).replace(/\+/g, "") : trimmed.replace(/\+/g, "");
}

const waitlistCardClassName =
  "mx-auto max-w-xl overflow-hidden rounded-3xl border border-caleno-200/90 bg-gradient-to-b from-caleno-50/95 via-white to-caleno-100/80 p-6 shadow-[0_20px_50px_-24px_rgba(15,69,80,0.35)] ring-2 ring-caleno-200/70 ring-offset-2 ring-offset-[#f0f9fa] sm:p-8";

export default function WaitlistPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });

  const { instagram, tiktok } = useMemo(() => getMarketingSocialUrls(), []);

  const canSubmit = useMemo(() => {
    const n = name.trim();
    const p = sanitizePhone(phone);
    return n.length >= 2 && p.replace(/\D/g, "").length >= 9 && !!businessType;
  }, [businessType, name, phone]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || submitState.status === "loading") return;
    setSubmitState({ status: "loading" });

    const payload = {
      name: name.trim(),
      phone: sanitizePhone(phone),
      businessType,
    };

    try {
      const res = await fetch("/api/waitlist/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setSubmitState({ status: "error", message: data?.error || "שגיאה בשליחה. נסו שוב." });
        return;
      }
      setSubmitState({ status: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitState({ status: "error", message: msg || "שגיאה בשליחה. נסו שוב." });
    }
  }

  const isSuccess = submitState.status === "success";

  useEffect(() => {
    if (isSuccess) {
      document.documentElement.setAttribute("data-waitlist-success", "true");
    } else {
      document.documentElement.removeAttribute("data-waitlist-success");
    }
    return () => {
      document.documentElement.removeAttribute("data-waitlist-success");
    };
  }, [isSuccess]);

  return (
    <div className="relative pb-16 text-caleno-ink antialiased" dir="rtl">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 lg:px-8">
        <div className={waitlistCardClassName}>
          {isSuccess ? (
            <div className="text-center">
              <div className="mx-auto flex justify-center pb-3">
                <div
                  className="flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center rounded-full bg-caleno-deep/[0.05]"
                  aria-hidden
                >
                  <PartyPopper className="h-10 w-10 text-caleno-deep" strokeWidth={1.65} />
                </div>
              </div>
              <h1 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-caleno-ink sm:text-4xl">
                <span className="bg-gradient-to-l from-caleno-deep via-caleno-500 to-caleno-brand bg-clip-text text-transparent">
                  איזה כיף, אתה בפנים!
                </span>{" "}
                <span aria-hidden>🚀</span>
              </h1>
              <p className="mx-auto mt-4 max-w-[42ch] text-center text-[18px] font-medium leading-relaxed text-slate-700 sm:text-[20px]">
                נעדכן וניצור איתך קשר מיד עם ההשקה.
              </p>

              <div className="mt-8 rounded-2xl border border-caleno-200/80 bg-gradient-to-br from-white/95 to-caleno-50/90 p-5 text-center shadow-inner shadow-caleno-900/5 sm:p-6">
                <p className="mx-auto max-w-[42ch] text-sm font-medium leading-relaxed text-[#475569] sm:text-base">
                  בינתיים, בואו לעקוב אחרינו לעדכונים חיים, טיפים והצצות למערכת:
                </p>
                <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
                  <a
                    href={instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background:
                        "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
                    }}
                    className="inline-flex min-h-[52px] w-full flex-1 origin-center items-center justify-center rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md transition duration-200 ease-out hover:scale-105 hover:shadow-lg active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 sm:min-w-[160px] sm:w-auto"
                  >
                    Instagram
                  </a>
                  <a
                    href={tiktok}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[52px] w-full flex-1 origin-center items-center justify-center rounded-xl bg-[#000000] px-6 py-3 text-sm font-bold text-white shadow-md transition duration-200 ease-out hover:scale-105 hover:shadow-lg active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#000000] sm:min-w-[160px] sm:w-auto"
                  >
                    TikTok
                  </a>
                </div>
                <p className="mx-auto mt-5 max-w-[42ch] text-center text-base font-bold leading-relaxed text-caleno-deep sm:text-lg">
                  ההטבה שלך שמורה ליום ההשקה! 🎁
                </p>
              </div>

              <p className="mt-6">
                <Link
                  href="/"
                  className="text-sm font-semibold text-caleno-deep underline-offset-4 transition hover:underline"
                >
                  חזרה לדף הבית
                </Link>
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-center text-3xl font-extrabold tracking-tight text-caleno-ink sm:text-4xl">
                הצטרפו לרשימת ההמתנה
              </h1>
              <p className="mx-auto mt-3 max-w-[45ch] text-center text-base font-medium leading-relaxed text-slate-700 sm:text-lg">
                נרשמים עכשיו ומקבלים חודש ראשון ב-1₪ בלבד ביום ההשקה! 🚀
              </p>

              <form onSubmit={onSubmit} className="mt-8 space-y-4">
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#0F172A]">שם</label>
                    <input
                      value={name}
                      onChange={(ev) => setName(ev.target.value)}
                      type="text"
                      autoComplete="name"
                      required
                      placeholder="איך נקרא לך?"
                      className="w-full rounded-xl border border-caleno-200/90 bg-white/95 px-4 py-3 text-sm outline-none focus:border-caleno-deep focus:ring-2 focus:ring-caleno-deep/20"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#0F172A]">טלפון</label>
                    <input
                      value={phone}
                      onChange={(ev) => setPhone(ev.target.value)}
                      type="tel"
                      autoComplete="tel"
                      required
                      placeholder="05X-XXXXXXX"
                      className="w-full rounded-xl border border-caleno-200/90 bg-white/95 px-4 py-3 text-sm outline-none focus:border-caleno-deep focus:ring-2 focus:ring-caleno-deep/20"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[#0F172A]">מה סוג העסק שלך?</label>
                    <select
                      value={businessType}
                      onChange={(ev) => setBusinessType(ev.target.value)}
                      required
                      className="w-full rounded-xl border border-caleno-200/90 bg-white/95 px-4 py-3 text-sm outline-none focus:border-caleno-deep focus:ring-2 focus:ring-caleno-deep/20"
                    >
                      <option value="" disabled>
                        בחרו סוג עסק
                      </option>
                      <option value="מספרה">מספרה / סטודיו</option>
                      <option value="קוסמטיקה">מכון יופי / קוסמטיקה</option>
                      <option value="קליניקה">קליניקה / טיפולים</option>
                      <option value="אחר">אחר</option>
                    </select>
                  </div>
                </div>

                {submitState.status === "error" ? (
                  <p className="text-center text-sm font-semibold text-red-600">{submitState.message}</p>
                ) : null}

                <button
                  type="submit"
                  disabled={!canSubmit || submitState.status === "loading"}
                  className="flex w-full items-center justify-center rounded-full bg-caleno-deep px-6 py-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-caleno-ink disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitState.status === "loading" ? "שולח..." : "שלחו אותי לרשימת ההמתנה"}
                </button>

                <p className="text-center text-xs leading-relaxed text-[#64748B]">
                  אנחנו משתמשים בנתונים רק כדי ליצור איתכם קשר לקראת ההשקה.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
