"use client";

export interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** Optional title above the message */
  title?: string;
  /** Primary message (e.g. Hebrew) */
  message: string;
  /** Secondary message (e.g. English), optional */
  messageSecondary?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, confirm button shows loading state */
  submitting?: boolean;
  /** Label when submitting (default: "שומר…") */
  submittingLabel?: string;
}

/**
 * Lightweight confirmation modal with Cancel and Confirm buttons.
 */
export default function ConfirmModal({
  open,
  onConfirm,
  onClose,
  title,
  message,
  messageSecondary,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  submitting = false,
  submittingLabel = "שומר…",
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[55]"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h3 className="text-lg font-semibold text-slate-900 mb-3">{title}</h3>
        )}
        <p className="text-base text-slate-900">{message}</p>
        {messageSecondary && (
          <p className="mt-2 text-sm text-slate-600">{messageSecondary}</p>
        )}
        <div className="mt-6 flex gap-3 justify-start">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-caleno-500 text-white hover:bg-caleno-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? submittingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
