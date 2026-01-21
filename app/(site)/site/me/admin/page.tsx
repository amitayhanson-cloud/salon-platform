"use client";

import AIFloatingWidget from "@/components/admin/AIFloatingWidget";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AdminHomePage() {
  const { user, loading } = useAuth();

  // Build personalized welcome message
  const welcomeMessage = user?.name 
    ? `ברוך שובך – ${user.name}`
    : "ברוך שובך";

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        {loading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
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

      {/* AI Floating Widget */}
      {user && <AIFloatingWidget siteId={user.id} />}
    </div>
  );
}
