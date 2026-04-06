"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
export type LivePreviewModalProps = {
  open: boolean;
  title: string;
  titleId?: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Full-screen overlay for template live preview: static shell + toolbar above the device,
 * scroll only inside {@link PhoneMockupFrame}.
 */
export function LivePreviewModal({
  open,
  title,
  titleId = "builder-live-preview-title",
  onClose,
  children,
}: LivePreviewModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/65 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:max-w-xl sm:px-5 sm:pb-5 sm:pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar outside the phone — high contrast, never overlaps the mockup */}
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3 sm:mb-4">
          <h2
            id={titleId}
            className="min-w-0 flex-1 text-right text-sm font-bold leading-snug text-white drop-shadow-sm sm:text-base"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white bg-zinc-900 text-white shadow-[0_4px_20px_rgba(0,0,0,0.45)] transition-colors hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="סגור תצוגה"
          >
            <X className="h-5 w-5 stroke-[2.5]" aria-hidden />
          </button>
        </div>

        {/* Fills remaining space; phone scales inside — no outer scroll */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
