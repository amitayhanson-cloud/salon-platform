"use client";

import { useState, useEffect, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  AuthOrDivider,
  V0AuthShell,
  WhatsAppGlyph,
  liquidGlassPrimaryBrandClass,
  liquidGlassSocialButtonClass,
  v0GlassCardClassName,
  v0GlassCardStyle,
  v0InputGlassClass,
} from "@/components/auth/V0AuthShell";
import { clearStaleRedirectStorage } from "@/lib/clearStaleRedirectStorage";
import { auth } from "@/lib/firebaseClient";
import { isTenantSubdomainHost } from "@/lib/tenant";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sendPhoneOtp, verifyPhoneOtp, loginWithGoogle, firebaseUser, logout, loading: authLoading } = useAuth();
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"phone" | "code">("phone");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const focusPhoneForWhatsApp = () => {
    if (otpStep === "code") {
      setOtpStep("phone");
      setOtpCode("");
      setError(null);
      requestAnimationFrame(() => document.getElementById("login-phone")?.focus());
    } else {
      document.getElementById("login-phone")?.focus();
    }
  };

  const [isTenantLogin, setIsTenantLogin] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsTenantLogin(isTenantSubdomainHost(window.location.hostname));
    }
  }, []);

  useEffect(() => {
    clearStaleRedirectStorage();
  }, []);

  useEffect(() => {
    if (searchParams?.get("error") === "no_tenant") {
      setError("אין חשבון אתר משויך. נא לפנות לתמיכה.");
      router.replace("/login", { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) return;
    if (process.env.NODE_ENV === "development") {
      console.log("[CLIENT AUTH] login page - already logged in, redirecting");
    }
    let cancelled = false;
    handleRedirectAfterLogin().catch(() => {
      if (cancelled) return;
      const returnTo = searchParams?.get("returnTo");
      const safeReturnTo =
        typeof returnTo === "string" &&
        returnTo.startsWith("/") &&
        !returnTo.startsWith("//") &&
        !returnTo.includes(":")
          ? returnTo
          : "/login?returnTo=admin";
      router.replace(safeReturnTo);
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, authLoading]);

  const handleRedirectAfterLogin = async () => {
    try {
      const currentUser = auth?.currentUser ?? null;
      if (!currentUser) {
        router.replace("/login?returnTo=admin");
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
          console.log(
            "[LoginForm] currentHost=%s targetUrl=%s (same-origin=no double login)",
            typeof window !== "undefined" ? window.location.origin : "ssr",
            data.url,
          );
        }
        window.location.assign(data.url);
        return;
      }
    } catch (e) {
      console.error("[LoginForm] Redirect fetch failed:", e);
    }
    router.replace("/login?returnTo=admin");
  };

  const handleSendOtp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) {
      setError("נא להזין מספר טלפון");
      return;
    }
    setLoading(true);
    try {
      const result = await sendPhoneOtp(phone);
      if (result.success) {
        setOtpStep("code");
        setOtpCode("");
      } else {
        setError(result.error || "שליחת הקוד נכשלה");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent<HTMLFormElement>) => {
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
        intent: "login",
      });
      if (result.success) {
        await handleRedirectAfterLogin();
      } else {
        setError(result.error || "הקוד שגוי");
      }
    } catch (err) {
      console.error("[LoginForm] Phone login error:", err);
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

  if (!authLoading && firebaseUser) {
    return (
      <div dir="rtl" lang="he" className="min-h-screen">
        <V0AuthShell>
          <Card className={v0GlassCardClassName()} style={v0GlassCardStyle()}>
            <CardContent className="flex min-h-[200px] items-center justify-center px-8 pb-10 pt-10">
              <div className="text-center font-sans">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#7ac7d4]/35 border-t-[#4e979f]" />
                <p className="text-sm text-[#417374]">מעבירים…</p>
              </div>
            </CardContent>
          </Card>
        </V0AuthShell>
      </div>
    );
  }

  return (
    <div dir="rtl" lang="he" className="min-h-screen">
      <V0AuthShell>
        <Card className={v0GlassCardClassName()} style={v0GlassCardStyle()}>
          <CardHeader className="space-y-2 px-8 pb-1 pt-10 text-center">
            <CardTitle className="font-sans text-3xl font-bold tracking-tight text-[#071219]">
              {isTenantLogin ? "אימות זהות" : "ברוכים השבים"}
            </CardTitle>
            <CardDescription className="font-sans text-base text-[#417374]">
              {isTenantLogin
                ? "התחברו כדי להמשיך ללוח הניהול"
                : otpStep === "code"
                  ? "הזינו את הקוד שנשלח לטלפון"
                  : "התחברו לחשבון כדי להמשיך"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 px-8 pb-10 pt-5">
          {otpStep === "code" ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4 text-right">
              <p className="text-center font-sans text-sm text-[#417374]">
                הקוד נשלח ל־<span dir="ltr" className="font-medium text-[#071219]">{phone}</span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="login-otp" className="font-sans text-sm font-medium text-[#071219]">
                  קוד אימות
                </Label>
                <Input
                  id="login-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                  className={v0InputGlassClass}
                  placeholder="●●●●●●"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-phone-readonly" className="font-sans text-sm font-medium text-[#071219]">
                  מספר טלפון
                </Label>
                <Input
                  id="login-phone-readonly"
                  readOnly
                  value={phone}
                  className={v0InputGlassClass}
                  dir="ltr"
                />
              </div>
              {error ? <p className="text-center font-sans text-sm text-red-600">{error}</p> : null}
              <Button
                type="submit"
                className={liquidGlassPrimaryBrandClass}
                disabled={loading || googleLoading}
              >
                {loading ? "מתחברים…" : "התחברות"}
              </Button>
              <button
                type="button"
                className="w-full text-center font-sans text-sm text-[#417374] underline-offset-2 transition-colors hover:text-[#3c7a8d] hover:underline"
                onClick={() => {
                  setOtpStep("phone");
                  setOtpCode("");
                  setError(null);
                }}
                disabled={loading}
              >
                שנה מספר טלפון
              </button>
            </form>
          ) : (
            <form onSubmit={handleSendOtp} className="space-y-4 text-right">
              <div className="space-y-2">
                <Label htmlFor="login-phone" className="font-sans text-sm font-medium text-[#071219]">
                  מספר טלפון
                </Label>
                <Input
                  id="login-phone"
                  type="tel"
                  placeholder="050-1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={v0InputGlassClass}
                  required
                  autoComplete="tel"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-delivery-note" className="font-sans text-sm font-medium text-[#071219]">
                  קבלת הקוד
                </Label>
                <Input
                  id="login-delivery-note"
                  readOnly
                  tabIndex={-1}
                  value=""
                  placeholder="קוד בן 6 ספרות בוואטסאפ או SMS"
                  className={`${v0InputGlassClass} pointer-events-none opacity-90`}
                />
              </div>
              {error ? <p className="text-center font-sans text-sm text-red-600">{error}</p> : null}
              <Button
                type="submit"
                className={liquidGlassPrimaryBrandClass}
                disabled={loading || googleLoading}
              >
                {loading ? "שולחים…" : "שלח קוד"}
              </Button>
            </form>
          )}

          <AuthOrDivider />

          <div className="space-y-3">
            <Button
              variant="outline"
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              className={liquidGlassSocialButtonClass}
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
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
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 2.43-4.53 6.16-4.53z"
                />
              </svg>
              {googleLoading ? "מתחברים…" : "המשך עם Google"}
            </Button>

            <Button variant="outline" type="button" disabled className={`${liquidGlassSocialButtonClass} opacity-50`}>
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 384 512" fill="currentColor" aria-hidden>
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              </svg>
              המשך עם Apple
            </Button>

            <Button
              variant="outline"
              type="button"
              onClick={focusPhoneForWhatsApp}
              disabled={loading || googleLoading}
              className={liquidGlassSocialButtonClass}
            >
              <WhatsAppGlyph className="h-5 w-5 shrink-0" />
              המשך עם וואטסאפ
            </Button>
          </div>

          <div className="space-y-3 pt-1 text-center">
            <a
              href="#"
              className="font-sans text-sm text-[#417374] transition-colors hover:text-[#3c7a8d]"
              onClick={(e) => e.preventDefault()}
            >
              שכחת סיסמה?
            </a>
            <div>
              <Link href="/signup" className="font-sans text-sm text-[#417374] transition-colors hover:text-[#3c7a8d]">
                אין לך חשבון? הירשם
              </Link>
            </div>
            <div>
              <Link href="/" className="font-sans text-sm text-[#4e979f] transition-colors hover:text-[#3c7a8d]">
                חזרה לדף הבית
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </V0AuthShell>
    </div>
  );
}

export default function LoginClient() {
  return (
    <Suspense
      fallback={
        <div dir="rtl" lang="he" className="min-h-screen">
          <V0AuthShell>
            <Card className={v0GlassCardClassName()} style={v0GlassCardStyle()}>
              <CardContent className="flex min-h-[200px] items-center justify-center px-8 pb-10 pt-10">
                <div className="text-center font-sans">
                  <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#7ac7d4]/35 border-t-[#4e979f]" />
                  <p className="text-sm text-[#417374]">טוען…</p>
                </div>
              </CardContent>
            </Card>
          </V0AuthShell>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
