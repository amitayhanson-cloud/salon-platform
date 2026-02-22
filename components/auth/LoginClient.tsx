"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { clearStaleRedirectStorage } from "@/lib/clearStaleRedirectStorage";
import { auth } from "@/lib/firebaseClient";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithGoogle, user, firebaseUser, logout, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    clearStaleRedirectStorage();
  }, []);

  useEffect(() => {
    if (searchParams?.get("error") === "no_tenant") {
      setError("אין חשבון אתר משויך. נא לפנות לתמיכה.");
      router.replace("/login", { scroll: false });
    }
  }, [searchParams, router]);

  // Redirect if already logged in (firebaseUser is source of truth)
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) return;
    let cancelled = false;
    handleRedirectAfterLogin()
      .catch(() => {
        if (cancelled) return;
        const returnTo = searchParams?.get("returnTo");
        const safeReturnTo =
          typeof returnTo === "string" &&
          returnTo.startsWith("/") &&
          !returnTo.startsWith("//") &&
          !returnTo.includes(":")
            ? returnTo
            : "/dashboard";
        router.replace(safeReturnTo);
      });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, authLoading]);

  const handleRedirectAfterLogin = async () => {
    // Single source of truth: fetch user's tenant URL from API (never localStorage or host).
    // Hard navigation ensures we land on correct tenant host/subdomain.
    try {
      const currentUser = auth?.currentUser ?? null;
      if (!currentUser) {
        router.replace("/dashboard");
        return;
      }
      const token = await currentUser.getIdToken(true);
      const res = await fetch("/api/dashboard-redirect", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.status === 403 && data.error === "no_tenant") {
        setError("אין חשבון אתר משויך. נא לפנות לתמיכה.");
        await logout();
        return;
      }
      if (res.ok && typeof data.url === "string" && data.url) {
        if (process.env.NODE_ENV === "development") {
          console.log("[LoginForm] currentHost=%s targetUrl=%s (same-origin=no double login)", typeof window !== "undefined" ? window.location.origin : "ssr", data.url);
        }
        window.location.assign(data.url);
        return;
      }
    } catch (e) {
      console.error("[LoginForm] Redirect fetch failed:", e);
    }
    router.replace("/dashboard");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        await handleRedirectAfterLogin();
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

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);

    try {
      const result = await loginWithGoogle();
      if (result.success) {
        await handleRedirectAfterLogin();
      } else if (!result.success) {
        setError(result.error || "התחברות עם Google נכשלה");
      }
    } catch (err) {
      console.error("[LoginForm] Google login error:", err);
      setError("אירעה שגיאה בהתחברות עם Google. נסה שוב מאוחר יותר.");
    } finally {
      setGoogleLoading(false);
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
              disabled={loading || googleLoading}
              className="w-full px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "מתחבר..." : "התחברות"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-slate-500">או</span>
            </div>
          </div>

          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
            className="w-full px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-slate-300 flex items-center justify-center gap-3"
          >
            {googleLoading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-600"></div>
                <span>מתחבר...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>התחברות עם Google</span>
              </>
            )}
          </button>

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
