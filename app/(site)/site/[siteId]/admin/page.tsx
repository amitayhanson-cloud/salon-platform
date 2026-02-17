"use client";

import AIFloatingWidget from "@/components/admin/AIFloatingWidget";
import { useAdminSiteId } from "@/hooks/useAdminSiteId";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AdminHomePage() {
  const userId = useAdminSiteId();
  const { user, loading } = useAuth();

  // Build personalized welcome message
  const welcomeMessage = user?.name 
    ? `ברוך שובך – ${user.name}`
    : "ברוך שובך";

  return (
    <div dir="rtl" className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 md:p-12">
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-caleno-500"></div>
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

      {/* AI Floating Widget */}
      {userId && <AIFloatingWidget siteId={userId} />}
    </div>
  );
}
