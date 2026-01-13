"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AccountPage() {
  const router = useRouter();
  const { user, logout, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-600">טוען...</p>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  const roleLabels: Record<string, string> = {
    owner: "בעל סלון",
    stylist: "עובדת",
    admin: "מנהל",
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 sm:p-8 text-right">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-6">
            חשבון המשתמש
          </h1>

          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                שלום, {user.name}
              </h2>
              <p className="text-slate-600">{user.email}</p>
              {user.role && (
                <p className="text-sm text-slate-500 mt-1">
                  {roleLabels[user.role] || user.role}
                </p>
              )}
            </div>

            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                אזור החשבון
              </h3>
              <p className="text-slate-600 text-sm mb-4">
                כאן תוכלו לראות את האתרים שיצרתם, הגדרות, חשבוניות ועוד.
                <br />
                (תכונות נוספות יגיעו בהמשך)
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                onClick={handleLogout}
                className="px-6 py-3 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium transition-colors"
              >
                התנתקות
              </button>
              <Link
                href="/"
                className="px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors"
              >
                חזרה לדף הבית
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

