"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      // Redirect logic is handled by login function's redirectPath
      // This effect will be triggered after login completes
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        // Defensively read returnTo parameter with error handling
        let returnTo: string | null = null;
        try {
          returnTo = searchParams?.get("returnTo") || null;
        } catch (err) {
          console.warn("[LoginForm] Failed to read returnTo param:", err);
          // Continue without returnTo - use default redirect
        }

        if (returnTo) {
          // Verify the returnTo is a valid admin path before redirecting
          // This prevents open redirect vulnerabilities
          try {
            if (returnTo.startsWith("/site/") && returnTo.includes("/admin")) {
              // Redirect to the intended admin URL
              router.replace(returnTo);
              return;
            }
          } catch (redirectErr) {
            console.warn("[LoginForm] Invalid returnTo, using default:", redirectErr);
            // Fall through to default redirect
          }
        }

        // Use the default redirect path from login function
        // This will be /site/{siteId}/admin if user has siteId, or /builder if not
        if (result.redirectPath) {
          try {
            router.replace(result.redirectPath);
          } catch (redirectErr) {
            console.error("[LoginForm] Redirect failed:", redirectErr);
            // Fallback to builder
            router.replace("/builder");
          }
        } else {
          router.replace("/builder");
        }
      } else if (!result.success) {
        setError(result.error || "פרטי ההתחברות אינם נכונים");
      }
    } catch (err) {
      console.error("[LoginForm] Login error:", err);
      setError("אירעה שגיאה. נסה שוב מאוחר יותר.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 sm:p-8 text-right">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">
            התחברות לחשבון
          </h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                אימייל
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="הזן את האימייל שלך"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                סיסמה
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-right focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="הזן את הסיסמה שלך"
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
              className="w-full px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "מתחבר..." : "התחברות"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 text-center">
            <p className="text-sm text-slate-600">
              אין לך חשבון?{" "}
              <Link
                href="/signup"
                className="text-sky-600 hover:text-sky-700 font-medium transition-colors"
              >
                הירשם כאן
              </Link>
            </p>
          </div>

          <div className="mt-4 text-center">
            <Link
              href="/"
              className="text-sm text-sky-600 hover:text-sky-700 transition-colors"
            >
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={
      <div dir="rtl" className="min-h-screen bg-slate-50 py-12 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p className="text-slate-600">טוען...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
