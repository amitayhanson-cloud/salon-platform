"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import CalenoLoading from "@/components/CalenoLoading";

export default function AdminHomePage() {
  const { user, loading } = useAuth();

  const welcomeMessage = user?.name
    ? `ברוך שובך – ${user.name}`
    : "ברוך שובך";

  return (
    <div dir="rtl" className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 md:p-12">
          {loading ? (
            <div
              className="min-h-[200px] flex items-center justify-center w-full"
              style={{
                background: "linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)",
              }}
            >
              <CalenoLoading />
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-slate-900 mb-4">
                {welcomeMessage}
              </h1>
              <p className="text-lg text-slate-600">
                מה תרצה לעשות היום?
              </p>
              <p className="text-sm text-slate-500 mt-2">
                בחר מהתפריט למעלה כדי להתחיל לנהל את האתר שלך
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
