"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { getClientAuth } from "@/lib/firebaseClient";
import { RecaptchaVerifier } from "firebase/auth";

export default function SignupPage() {
  const router = useRouter();
  const {
    signup,
    signupWithGoogle,
    signupWithPhoneNumberSend,
    signupWithPhoneNumberConfirm,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [phoneStep, setPhoneStep] = useState<"enter" | "otp">("enter");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationResultRef = useRef<import("firebase/auth").ConfirmationResult | null>(null);

  useEffect(() => {
    return () => {
      recaptchaVerifierRef.current?.clear?.();
      recaptchaVerifierRef.current = null;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      return;
    }
    if (password.length < 6) {
      setError("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }

    setLoading(true);
    try {
      const result = await signup(email, password, name);
      if (result.success) {
        router.replace("/signup/complete-profile");
      } else {
        setError(result.error || "שגיאה ביצירת חשבון");
      }
    } catch (err: unknown) {
      console.error("Signup error:", err);
      setError("אירעה שגיאה בלתי צפויה. נסה שוב מאוחר יותר.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await signupWithGoogle();
      if (result.success) {
        router.replace(result.needsProfile ? "/signup/complete-profile" : "/builder");
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

  const normalizePhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 9 && digits.startsWith("0")) {
      return "+972" + digits.slice(1);
    }
    if (digits.length === 9 && !raw.includes("+")) {
      return "+972" + digits;
    }
    if (digits.length >= 10 && digits.startsWith("972")) {
      return "+" + digits;
    }
    if (raw.trim().startsWith("+")) return raw.trim();
    return "+972" + digits;
  };

  const handleSendPhoneCode = async () => {
    setPhoneError(null);
    const normalized = normalizePhone(phoneNumber);
    if (normalized.length < 10) {
      setPhoneError("נא להזין מספר טלפון תקין (כולל קידומת מדינה, למשל +972501234567)");
      return;
    }
    setPhoneLoading(true);
    try {
      const auth = getClientAuth();
      const container = document.getElementById("signup-phone-recaptcha");
      if (!container) {
        setPhoneError("שגיאה בהכנת אימות. רענן את הדף ונסה שוב.");
        setPhoneLoading(false);
        return;
      }
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(
          auth,
          "signup-phone-recaptcha",
          { size: "invisible", callback: () => {} }
        );
      }
      const result = await signupWithPhoneNumberSend(
        normalized,
        recaptchaVerifierRef.current
      );
      if (result.success && result.confirmationResult) {
        confirmationResultRef.current = result.confirmationResult;
        setPhoneStep("otp");
        setPhoneError(null);
      } else {
        setPhoneError(result.error || "שליחת הקוד נכשלה");
      }
    } catch (err: unknown) {
      console.error("Send phone code error:", err);
      setPhoneError("שגיאה בשליחת קוד. נסה שוב.");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleConfirmOtp = async () => {
    const conf = confirmationResultRef.current;
    if (!conf || !otpCode.trim()) {
      setPhoneError("נא להזין את הקוד שנשלח");
      return;
    }
    setPhoneError(null);
    setPhoneLoading(true);
    try {
      const result = await signupWithPhoneNumberConfirm(conf, otpCode.trim());
      if (result.success) {
        router.replace("/signup/complete-profile");
      } else {
        setPhoneError(result.error || "אימות הקוד נכשל");
      }
    } catch (err: unknown) {
      console.error("Confirm OTP error:", err);
      setPhoneError("שגיאה באימות. נסה שוב.");
    } finally {
      setPhoneLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8FAFC] py-12">
      <div className="container mx-auto px-4 max-w-md">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-lg sm:p-8 text-right">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] mb-2">
            הרשמה לפלטפורמה
          </h1>
          <p className="text-[#64748B] mb-6">
            צור חשבון וקבל אתר מקצועי לסלון שלך
          </p>

          <div className="space-y-4 mb-6">
            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 font-medium text-[#0F172A] shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              הרשמה עם Google
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E2E8F0]" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-[#64748B]">או הרשמה עם טלפון</span>
              </div>
            </div>

            <div id="signup-phone-recaptcha" className="hidden" aria-hidden="true" />

            {phoneStep === "enter" ? (
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+972501234567"
                  className="flex-1 rounded-lg border border-[#E2E8F0] px-4 py-3 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={handleSendPhoneCode}
                  disabled={phoneLoading}
                  className="rounded-lg bg-caleno-deep px-4 py-3 font-medium text-white whitespace-nowrap disabled:opacity-50"
                >
                  {phoneLoading ? "שולח…" : "שלח קוד"}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="קוד אימות (6 ספרות)"
                  className="w-full rounded-lg border border-[#E2E8F0] px-4 py-3 text-center focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                  dir="ltr"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setPhoneStep("enter"); setOtpCode(""); setPhoneError(null); }}
                    className="flex-1 rounded-lg border border-[#E2E8F0] px-4 py-3 font-medium text-[#0F172A]"
                  >
                    חזרה
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmOtp}
                    disabled={phoneLoading || otpCode.length < 4}
                    className="flex-1 rounded-lg bg-caleno-ink px-4 py-3 font-medium text-white disabled:opacity-50"
                  >
                    {phoneLoading ? "מאמת…" : "אימות"}
                  </button>
                </div>
              </div>
            )}
            {phoneError && (
              <p className="text-sm text-red-600 text-right">{phoneError}</p>
            )}
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#E2E8F0]" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-[#64748B]">או הרשמה עם אימייל</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[#0F172A] mb-2">
                שם מלא / שם הסלון
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-4 py-3 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                placeholder="הזן את שמך או שם הסלון"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#0F172A] mb-2">
                אימייל
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-4 py-3 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                placeholder="example@email.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#0F172A] mb-2">
                סיסמה
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-4 py-3 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                placeholder="לפחות 6 תווים"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#0F172A] mb-2">
                אימות סיסמה
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-4 py-3 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                placeholder="הזן שוב את הסיסמה"
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
              className="w-full rounded-lg bg-caleno-ink px-6 py-3 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "יוצר חשבון..." : "הרשמה עם אימייל"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#E2E8F0] text-center">
            <p className="text-sm text-[#64748B]">
              כבר יש לך חשבון?{" "}
              <Link href="/login" className="font-medium text-caleno-deep transition-colors hover:text-caleno-ink">
                התחבר כאן
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-caleno-deep hover:text-caleno-ink">
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
