"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";

type DeleteAccountButtonProps = {
  onDelete: () => Promise<void>;
  isDeleting?: boolean;
  deleteError?: string | null;
};

export default function DeleteAccountButton({
  onDelete,
  isDeleting = false,
  deleteError: externalDeleteError = null,
}: DeleteAccountButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleOpen = () => {
    setIsOpen(true);
    setDeleteConfirmText("");
    setDeleteError(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    setDeleteConfirmText("");
    setDeleteError(null);
  };

  const handleDelete = async () => {
    // Validate confirmation text
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setDeleteError('יש להקליד "DELETE" לאישור');
      return;
    }

    setDeleteError(null);
    try {
      await onDelete();
      // If deletion succeeds, the component will unmount (user will be redirected)
      // The onDelete handler handles signout and redirect, so we don't need to do anything here
      // Don't close modal or reset state - let the redirect happen
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "שגיאה במחיקת החשבון";
      setDeleteError(errorMessage);
      // Re-throw so parent can handle isDeleting state
      throw error;
    }
  };

  const displayError = deleteError || externalDeleteError;
  const canDelete = deleteConfirmText.trim().toUpperCase() === "DELETE" && !isDeleting;

  return (
    <>
      {/* Default state: Only button */}
      <div className="mt-8 pt-6 border-t border-slate-200">
        <p className="text-sm text-slate-500 mb-3 text-right">
          פעולה זו היא לצמיתות
        </p>
        <button
          onClick={handleOpen}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
        >
          מחיקת חשבון
        </button>
      </div>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            // Close modal when clicking outside
            if (e.target === e.currentTarget && !isDeleting) {
              handleClose();
            }
          }}
          dir="rtl"
        >
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center rounded-t-2xl">
              <h3 className="text-lg font-bold text-slate-900">מחיקת חשבון</h3>
              <button
                onClick={handleClose}
                className="p-1 hover:bg-slate-100 rounded"
                disabled={isDeleting}
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              {/* Warning content */}
              <div>
                <p className="text-sm text-slate-600 mb-4">
                  מחיקת החשבון תמחק לצמיתות את כל הנתונים שלך, כולל:
                </p>
                <ul className="text-sm text-slate-600 space-y-1 mb-4 list-disc list-inside">
                  <li>חשבון המשתמש שלך</li>
                  <li>כל נתוני האתר וההגדרות</li>
                  <li>כל ההזמנות והלקוחות</li>
                  <li>כל הנתונים הקשורים לחשבון שלך</li>
                </ul>
              </div>

              {/* Red warning */}
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-900 mb-2">
                    אזהרה: פעולה זו אינה ניתנת לביטול!
                  </p>
                  <p className="text-sm text-red-800">
                    כל הנתונים שלך יימחקו לצמיתות ולא ניתן לשחזר אותם.
                  </p>
                </div>
              </div>

              {/* Confirmation input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  הקלד "DELETE" לאישור מחיקת החשבון:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  disabled={isDeleting}
                  autoFocus
                />
              </div>

              {/* Error message */}
              {displayError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{displayError}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
              <button
                onClick={handleClose}
                disabled={isDeleting}
                className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleDelete}
                disabled={!canDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {isDeleting ? "מוחק..." : "מחק חשבון לצמיתות"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
