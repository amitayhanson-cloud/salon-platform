"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function WaitlistEntryDeleteButton({ siteId, entryId }: { siteId: string; entryId: string }) {
  const { firebaseUser } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!firebaseUser) {
      window.alert("יש להתחבר מחדש.");
      return;
    }
    if (!window.confirm("להסיר את הרשומה מרשימת ההמתנה?")) return;
    setBusy(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/booking-waitlist/delete-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, entryId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        window.alert(
          data.error === "forbidden"
            ? "אין הרשאה"
            : typeof data.error === "string"
              ? data.error
              : "שגיאה במחיקה"
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      disabled={busy || !firebaseUser}
      className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
      title="הסרה מרשימת ההמתנה"
      aria-label="הסרה מרשימת ההמתנה"
    >
      <Trash2 className="w-4 h-4" strokeWidth={2} />
    </button>
  );
}
