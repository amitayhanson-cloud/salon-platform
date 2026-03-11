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
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 shadow-sm md:p-12">
          {loading ? (
            <div className="flex min-h-[200px] w-full items-center justify-center bg-[#F8FAFC]">
              <CalenoLoading />
            </div>
          ) : (
            <>
              <h1 className="mb-4 text-3xl font-bold text-[#0F172A]">
                {welcomeMessage}
              </h1>
              <p className="text-lg text-[#64748B]">
                מה תרצה לעשות היום?
              </p>
              <p className="mt-2 text-sm text-[#64748B]">
                בחר מהתפריט למעלה כדי להתחיל לנהל את האתר שלך
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
