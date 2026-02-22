"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth";
import {
  validatePasswordPolicy,
  getPasswordStrength,
  type StrengthLevel,
} from "@/lib/password/passwordPolicy";
import { Eye, EyeOff, AlertTriangle } from "lucide-react";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

function mapFirebaseError(code: string): string {
  switch (code) {
    case "auth/wrong-password":
      return "הסיסמה הנוכחית שגויה.";
    case "auth/too-many-requests":
      return "יותר מדי ניסיונות. נסה שוב מאוחר יותר.";
    case "auth/requires-recent-login":
      return "נדרשת התחברות מחדש. התנתק והתחבר שוב, ואז נסה שנית.";
    case "auth/weak-password":
      return "הסיסמה חלשה מדי. השתמש לפחות ב־10 תווים ובשילוב אותיות, מספרים וסימנים.";
    case "auth/network-request-failed":
      return "שגיאת רשת. בדוק את החיבור ונסה שוב.";
    default:
      return "שגיאה. נסה שוב.";
  }
}

function strengthColor(level: StrengthLevel): string {
  switch (level) {
    case "weak":
      return "bg-red-400";
    case "fair":
      return "bg-amber-400";
    case "good":
      return "bg-lime-400";
    case "strong":
      return "bg-emerald-500";
    default:
      return "bg-slate-300";
  }
}

interface ChangePasswordCardProps {
  firebaseUser: User | null;
  onSuccess?: () => void;
  onToast?: (message: string, isError?: boolean) => void;
  logSecurityEvent?: (type: string, tenantId?: string) => Promise<void>;
  tenantId?: string;
}

export default function ChangePasswordCard({
  firebaseUser,
  onSuccess,
  onToast,
  logSecurityEvent,
  tenantId,
}: ChangePasswordCardProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const strength = getPasswordStrength(newPassword);
  const policy = validatePasswordPolicy(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const newSameAsCurrent = newPassword.length > 0 && newPassword === currentPassword;

  const canSubmit =
    !loading &&
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    policy.valid &&
    passwordsMatch &&
    !newSameAsCurrent &&
    (lockoutUntil === null || Date.now() > lockoutUntil);

  const handleCapsLock = useCallback((e: React.KeyboardEvent) => {
    setCapsLockOn(e.getModifierState("CapsLock"));
  }, []);

  useEffect(() => {
    if (lockoutUntil === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      if (remaining <= 0) {
        setLockoutUntil(null);
        if (lockoutTimerRef.current) {
          clearInterval(lockoutTimerRef.current);
          lockoutTimerRef.current = null;
        }
      }
    };
    lockoutTimerRef.current = setInterval(tick, 500);
    return () => {
      if (lockoutTimerRef.current) clearInterval(lockoutTimerRef.current);
    };
  }, [lockoutUntil]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !firebaseUser || !firebaseUser.email) return;

    setError(null);
    setLoading(true);

    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email,
        currentPassword
      );
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);

      await logSecurityEvent?.("PASSWORD_CHANGED", tenantId);

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFailedAttempts(0);
      onSuccess?.();
      onToast?.("הסיסמה עודכנה בהצלחה");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/wrong-password") {
        const next = failedAttempts + 1;
        setFailedAttempts(next);
        if (next >= MAX_FAILED_ATTEMPTS) {
          setLockoutUntil(Date.now() + LOCKOUT_SECONDS * 1000);
        }
      }
      setError(mapFirebaseError(code ?? ""));
      onToast?.(mapFirebaseError(code ?? ""), true);
    } finally {
      setLoading(false);
    }
  };

  if (!firebaseUser) return null;

  const lockoutSeconds =
    lockoutUntil !== null ? Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000)) : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6" dir="rtl">
      <h2 className="text-lg font-semibold text-slate-900 mb-1">שינוי סיסמה</h2>
      <p className="text-sm text-slate-500 mb-6">
        הזן את הסיסמה הנוכחית ואת הסיסמה החדשה. מומלץ לפחות 10 תווים ושילוב אותיות, מספרים וסימנים.
      </p>

      {success && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800"
        >
          הסיסמה עודכנה בהצלחה.
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {lockoutUntil !== null && lockoutSeconds > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          יותר מדי ניסיונות. נסה שוב בעוד {lockoutSeconds} שניות.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="current-password" className="block text-sm font-medium text-slate-700 mb-1">
            סיסמה נוכחית
          </label>
          <div className="relative">
            <input
              id="current-password"
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              onKeyDown={handleCapsLock}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm"
              disabled={loading || (lockoutUntil !== null && lockoutSeconds > 0)}
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700"
              aria-label={showCurrent ? "הסתר סיסמה" : "הצג סיסמה"}
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1">
            סיסמה חדשה
          </label>
          <div className="relative">
            <input
              id="new-password"
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setSuccess(false);
              }}
              onKeyDown={handleCapsLock}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm"
              disabled={loading || (lockoutUntil !== null && lockoutSeconds > 0)}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700"
              aria-label={showNew ? "הסתר סיסמה" : "הצג סיסמה"}
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {newPassword.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-1 h-1.5 rounded-full overflow-hidden">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-full transition-colors ${
                      i <= strength.score ? strengthColor(strength.level) : "bg-slate-200"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs mt-1 text-slate-600">
                חוזק: {strength.label}
                {strength.suggestions.length > 0 && " — " + strength.suggestions.join(" ")}
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1">
            אימות סיסמה חדשה
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={handleCapsLock}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm"
              disabled={loading || (lockoutUntil !== null && lockoutSeconds > 0)}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700"
              aria-label={showConfirm ? "הסתר סיסמה" : "הצג סיסמה"}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-xs mt-1 text-red-600">הסיסמאות אינן תואמות</p>
          )}
          {newSameAsCurrent && (
            <p className="text-xs mt-1 text-amber-600">הסיסמה החדשה חייבת להיות שונה מהנוכחית</p>
          )}
        </div>

        {capsLockOn && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" />
            Caps Lock מופעל
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="px-4 py-2 rounded-lg bg-caleno-500 hover:bg-caleno-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {loading ? "מעדכן…" : "עדכן סיסמה"}
        </button>
      </form>
    </div>
  );
}
