"use client";

import { useState, useEffect } from "react";

export interface CancelBookingModalProps {
  open: boolean;
  bookingId: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  /** When true, confirm button is disabled and shows loading. */
  submitting?: boolean;
}

/**
 * Modal to collect cancellation reason before cancelling a booking.
 * Reason is optional; on confirm calls onConfirm(reason).
 */
export default function CancelBookingModal({
  open,
  bookingId,
  onConfirm,
  onClose,
  submitting = false,
}: CancelBookingModalProps) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm(reason.trim());
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[55]"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-[#E2E8F0] w-full max-w-md p-6 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-[#0F172A]">ביטול תור</h3>
        <p className="mt-2 text-sm text-[#64748B]">
          סיבת הביטול (אופציונלי). תישמר בתור ותוצג בדף התורים המבוטלים.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="הזן סיבת ביטול..."
          className="mt-3 w-full min-h-[80px] px-3 py-2 border border-[#E2E8F0] rounded-lg text-[#0F172A] placeholder:text-[#64748B] focus:outline-none focus:border-[#1E6F7C] focus:ring-[3px] focus:ring-[rgba(30,111,124,0.15)]"
          dir="rtl"
          disabled={submitting}
        />
        <div className="mt-6 flex gap-3 justify-start">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-[#E2E8F0] text-[#0F172A] hover:bg-[rgba(15,23,42,0.04)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "מבטל..." : "אשר ביטול"}
          </button>
        </div>
      </div>
    </div>
  );
}
