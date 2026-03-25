"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/auth/AuthProvider";

type Step = "choose" | "otp";

export default function SignupPage() {
  const router = useRouter();
  const { signupWithGoogle, sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignup = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signupWithGoogle();
      if (result.success) {
        router.replace("/builder");
      } else {
        setError(result.error || "שגיאה בהרשמה עם Google");
      }
    } catch (err: unknown) {
      console.error("Google signup error:", err);
      setError("אירעה שגיאה. נסה שוב.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("נא להזין שם מלא");
      return;
    }
    if (!phone.trim()) {
      setError("נא להזין מספר טלפון");
      return;
    }
    setLoading(true);
    try {
      const result = await sendPhoneOtp(phone);
      if (result.success) {
        setStep("otp");
        setOtpCode("");
      } else {
        setError(result.error || "שליחת הקוד נכשלה");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const digits = otpCode.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("נא להזין קוד בן 6 ספרות");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyPhoneOtp({
        rawPhone: phone,
        code: digits,
        intent: "signup",
        fullName: name.trim(),
      });
      if (result.success) {
        router.replace("/builder");
      } else {
        setError(result.error || "אימות נכשל");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="relative min-h-screen w-full overflow-x-hidden">
      <div
        aria-hidden
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 100% 100% at 50% 50%, #cceef1 0%, #e6f5f7 25%, #f0f9fa 50%, #f8fcfd 75%, #ffffff 100%)",
        }}
      />
      <div
        aria-hidden
        className="fixed -top-24 -left-24 h-80 w-80 rounded-full bg-caleno-200/35 blur-3xl -z-10 pointer-events-none"
      />
      <div
        aria-hidden
        className="fixed -bottom-32 -right-20 h-72 w-72 rounded-full bg-caleno-brand/20 blur-3xl -z-10 pointer-events-none"
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10 sm:py-14">
        <div className="relative overflow-hidden rounded-2xl border border-caleno-deep/20 bg-white/90 shadow-[0_8px_40px_-8px_rgba(30,111,124,0.22)] backdrop-blur-sm sm:p-8 p-6 text-right">
          <div
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-caleno-deep via-caleno-500 to-caleno-brand"
            aria-hidden
          />
          <div className="mb-5 pt-1">
            <div dir="ltr" className="mb-4 flex justify-start">
              <Link
                href="/"
                className="relative flex shrink-0 items-center rounded py-1 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2"
                aria-label="Caleno – דף הבית"
              >
                <span className="relative block h-9 w-[140px] shrink-0 sm:h-10 sm:w-[168px]">
                  <Image
                    src="/brand/caleno logo/caleno_logo_new.png"
                    alt="Caleno"
                    fill
                    className="object-contain object-left"
                    priority
                    sizes="(max-width: 640px) 140px, 168px"
                  />
                </span>
              </Link>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-caleno-ink">
              הרשמה לפלטפורמה
            </h1>
            <p className="mt-2 text-sm sm:text-base leading-relaxed text-caleno-700/90">
              צור חשבון וקבל אתר מקצועי, מערכת הזמנות מקוונת ומערכת ניהול עסק לסלון שלך — הכל במקום אחד.
            </p>
          </div>

          <div className="space-y-5">
            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-caleno-deep/30 bg-white/90 px-4 py-3 font-semibold text-caleno-ink shadow-sm hover:border-caleno-deep/45 hover:bg-caleno-50/80 transition disabled:opacity-50"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              הרשמה עם Google
            </button>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-caleno-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white/90 px-3 text-caleno-700">או עם מספר טלפון</span>
              </div>
            </div>

            {step === "choose" ? (
              <form onSubmit={handleSendOtp} className="space-y-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-caleno-ink mb-2">
                    שם מלא
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                    className="w-full rounded-lg border border-caleno-border bg-white/80 px-4 py-3 text-right transition-colors focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)] hover:border-caleno-deep/25"
                    placeholder="הזן את שמך המלא"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-caleno-ink mb-2">
                    מספר טלפון
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    autoComplete="tel"
                    className="w-full rounded-lg border border-caleno-border bg-white/80 px-4 py-3 text-right transition-colors focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)] hover:border-caleno-deep/25"
                    placeholder="050-1234567"
                    dir="ltr"
                  />
                  <p className="mt-1.5 text-xs text-caleno-700/80">
                    נשלח אליך קוד חד-פעמי בן 6 ספרות ב-SMS.
                  </p>
                </div>
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-gradient-to-l from-caleno-ink to-caleno-700 px-6 py-3 font-semibold text-white shadow-md shadow-caleno-deep/15 transition-all duration-200 hover:from-[#1E293B] hover:to-caleno-800 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "שולח..." : "שלח קוד אימות"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <p className="text-sm text-caleno-700">
                  הזן את הקוד שנשלח לטלפון <span dir="ltr" className="font-medium">{phone}</span>
                </p>
                <div>
                  <label htmlFor="otp" className="block text-sm font-medium text-caleno-ink mb-2">
                    קוד אימות (6 ספרות)
                  </label>
                  <input
                    type="text"
                    id="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={8}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                    className="w-full rounded-lg border border-caleno-border bg-white/80 px-4 py-3 text-center text-2xl tracking-[0.35em] font-mono"
                    placeholder="●●●●●●"
                    dir="ltr"
                  />
                </div>
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-gradient-to-l from-caleno-ink to-caleno-700 px-6 py-3 font-semibold text-white shadow-md shadow-caleno-deep/15 transition-all duration-200 hover:from-[#1E293B] hover:to-caleno-800 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "מאמת..." : "אמת והמשך"}
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setStep("choose");
                    setOtpCode("");
                    setError(null);
                  }}
                  className="w-full text-sm font-medium text-caleno-deep hover:text-caleno-ink"
                >
                  שנה מספר טלפון
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-caleno-border/80 text-center">
            <p className="text-sm text-caleno-700/85">
              כבר יש לך חשבון?{" "}
              <Link href="/login" className="font-medium text-caleno-deep transition-colors hover:text-caleno-ink">
                התחבר כאן
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="text-sm font-medium text-caleno-deep hover:text-caleno-600 transition-colors">
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
