"use client";

import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";

export default function CalendarPage() {
  return (
    <div dir="rtl" className="space-y-6">
      <AdminPageHero
        title="יומן"
        subtitle="עמוד יומן - כאן תוכל לראות את לוח הזמנים"
      />
      <AdminCard className="p-6">
        <p className="text-[#64748B]">בחר תאריך ביומן התורים כדי לצפות ביום ספציפי.</p>
      </AdminCard>
    </div>
  );
}
