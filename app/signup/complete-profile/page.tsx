"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { updateUserProfile } from "@/lib/firestoreUsers";
import { isUserProfileComplete } from "@/types/user";

export default function CompleteProfilePage() {
  const router = useRouter();
  const { user, authReady, loading: authLoading, refreshUser } = useAuth();
  const [businessName, setBusinessName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setBusinessName(user.name ?? "");
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
  }, [user]);

  useEffect(() => {
    if (!authReady || authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (isUserProfileComplete(user)) {
      router.replace("/builder");
    }
  }, [user, authReady, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const name = businessName.trim();
    const emailVal = email.trim();
    const phoneVal = phone.trim();
    if (!name) {
      setError("נא להזין שם עסק / שם מלא");
      return;
    }
    if (!emailVal) {
      setError("נא להזין כתובת אימייל");
      return;
    }
    if (!phoneVal) {
      setError("נא להזין מספר טלפון");
      return;
    }
    if (!user?.id) return;
    setSaving(true);
    try {
      await updateUserProfile(user.id, { name, email: emailVal, phone: phoneVal });
      await refreshUser();
      router.replace("/builder");
    } catch (err) {
      console.error("Complete profile error:", err);
      setError("שגיאה בשמירה. נסה שוב.");
    } finally {
      setSaving(false);
    }
  };

  if (!authReady || authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center" dir="rtl">
        <p className="text-[#64748B]">טוען…</p>
      </div>
    );
  }

  if (isUserProfileComplete(user)) {
    return null;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#F8FAFC] py-12">
      <div className="container mx-auto px-4 max-w-md">
        <div className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-lg sm:p-8 text-right">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F172A] mb-2">
            השלם את הפרטים
          </h1>
          <p className="text-[#64748B] mb-6">
            נדרשים שם העסק, אימייל ומספר טלפון כדי להמשיך ליצירת האתר.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="businessName" className="block text-sm font-medium text-[#0F172A] mb-2">
                שם העסק / שם מלא
              </label>
              <input
                type="text"
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-4 py-3 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                placeholder="שם הסלון או שמך"
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
              <label htmlFor="phone" className="block text-sm font-medium text-[#0F172A] mb-2">
                מספר טלפון
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full rounded-lg border border-[#E2E8F0] px-4 py-3 text-right focus:outline-none focus:border-caleno-deep focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
                placeholder="050-0000000"
              />
              <p className="text-xs text-[#64748B] mt-1">פורמט בינלאומי (כולל קידומת מדינה) מומלץ</p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-right">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-caleno-ink px-6 py-3 font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "שומר…" : "המשך ליצירת האתר"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#E2E8F0] text-center">
            <Link href="/" className="text-sm text-caleno-deep hover:text-caleno-ink">
              חזרה לדף הבית
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
