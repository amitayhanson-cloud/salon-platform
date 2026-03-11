"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("הסיסמאות אינן תואמות");
      return;
    }

    // Validate password length
    if (password.length < 6) {
      setError("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }

    setLoading(true);

    try {
      const result = await signup(email, password, name);
      if (result.success) {
        // User created with siteId=null - redirect to wizard
        // Site will be created ONLY after wizard completion
        router.replace("/builder");
      } else {
        // Show the normalized error message from signup
        setError(result.error || "שגיאה ביצירת חשבון");
      }
    } catch (err: unknown) {
      // This catch block should rarely be hit since signup() handles errors internally
      // But if it does, log and show a generic error
      console.error("Signup error (unexpected catch):", err);
      setError("אירעה שגיאה בלתי צפויה. נסה שוב מאוחר יותר.");
    } finally {
      setLoading(false);
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

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-[#0F172A] mb-2"
              >
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
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#0F172A] mb-2"
              >
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
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[#0F172A] mb-2"
              >
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
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-[#0F172A] mb-2"
              >
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
              {loading ? "יוצר חשבון..." : "הרשמה ויצירת אתר"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#E2E8F0] text-center">
            <p className="text-sm text-[#64748B]">
              כבר יש לך חשבון?{" "}
              <Link
                href="/login"
                className="font-medium text-caleno-deep transition-colors hover:text-caleno-ink"
              >
                התחבר כאן
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link
              href="/"
              className="text-sm text-caleno-deep transition-colors hover:text-caleno-ink"
            >
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
