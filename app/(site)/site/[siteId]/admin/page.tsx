"use client";

import { useParams } from "next/navigation";
import AIFloatingWidget from "@/components/admin/AIFloatingWidget";

export default function AdminHomePage() {
  const params = useParams();
  const siteId = params?.siteId as string;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">
          ברוך שובך, מה תרצה לעשות היום?
        </h1>
        <p className="text-lg text-slate-600">
          בחר מהתפריט למעלה כדי להתחיל לנהל את האתר שלך
        </p>
      </div>

      {/* AI Floating Widget */}
      <AIFloatingWidget siteId={siteId} />
    </div>
  );
}
