"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type PendingLeaveIntent =
  | { type: "navigate"; href: string }
  | { type: "callback"; fn: () => void };

type UnsavedContextValue = {
  setUnsaved: (hasUnsaved: boolean, onSave: () => Promise<void> | void) => void;
  checkAndNavigate: (href: string) => boolean;
  /** If there are unsaved changes, opens the same confirmation modal; otherwise runs `fn` immediately. */
  checkAndProceed: (fn: () => void) => void;
};

const UnsavedChangesContext = createContext<UnsavedContextValue | null>(null);

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  return ctx;
}

type ProviderProps = { children: ReactNode };

export function UnsavedChangesProvider({ children }: ProviderProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasUnsavedRef = useRef(false);
  const onSaveRef = useRef<() => Promise<void> | void>(() => {});
  const pendingIntentRef = useRef<PendingLeaveIntent | null>(null);

  const setUnsaved = useCallback((hasUnsaved: boolean, onSave: () => Promise<void> | void) => {
    hasUnsavedRef.current = hasUnsaved;
    onSaveRef.current = onSave;
  }, []);

  const flushIntent = useCallback(() => {
    const intent = pendingIntentRef.current;
    pendingIntentRef.current = null;
    setShowModal(false);
    if (!intent) return;
    if (intent.type === "navigate") router.push(intent.href);
    else intent.fn();
  }, [router]);

  const handleLeaveWithoutSaving = useCallback(() => {
    flushIntent();
  }, [flushIntent]);

  const handleSaveAndLeave = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.resolve(onSaveRef.current());
      flushIntent();
    } finally {
      setSaving(false);
    }
  }, [flushIntent]);

  const handleCancel = useCallback(() => {
    pendingIntentRef.current = null;
    setShowModal(false);
  }, []);

  const checkAndNavigate = useCallback((href: string) => {
    if (!hasUnsavedRef.current || !href) return false;
    pendingIntentRef.current = { type: "navigate", href };
    setShowModal(true);
    return true;
  }, []);

  const checkAndProceed = useCallback((fn: () => void) => {
    if (!hasUnsavedRef.current) {
      fn();
      return;
    }
    pendingIntentRef.current = { type: "callback", fn };
    setShowModal(true);
  }, []);

  const value: UnsavedContextValue = { setUnsaved, checkAndNavigate, checkAndProceed };

  return (
    <UnsavedChangesContext.Provider value={value}>
      <UnsavedChangesLinkListener checkAndNavigate={checkAndNavigate} />
      {children}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]"
          data-admin-modal-overlay=""
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-modal-title"
        >
          <div
            className="bg-white rounded-3xl shadow-xl border border-[#E2E8F0] w-full max-w-md p-6 text-right"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="unsaved-modal-title" className="text-lg font-semibold text-slate-900 mb-2">
              שינויים שלא נשמרו
            </h2>
            <p className="text-slate-600 text-sm mb-6">
              יש לך שינויים שלא נשמרו. האם לשמור לפני יציאה מהדף?
            </p>
            <div className="flex flex-wrap gap-3 justify-start">
              <button
                type="button"
                onClick={handleSaveAndLeave}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-[#0F172A] text-white text-sm font-semibold hover:bg-[#1E293B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "שומר…" : "שמור ויצא"}
              </button>
              <button
                type="button"
                onClick={handleLeaveWithoutSaving}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                יציאה בלי לשמור
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </UnsavedChangesContext.Provider>
  );
}

function UnsavedChangesLinkListener({
  checkAndNavigate,
}: {
  checkAndNavigate: (href: string) => boolean;
}) {
  const handleClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || !anchor.href) return;
      try {
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return;
        const href = url.pathname + url.search;
        if (checkAndNavigate(href)) {
          e.preventDefault();
          e.stopPropagation();
        }
      } catch {
        // ignore
      }
    },
    [checkAndNavigate]
  );

  useEffect(() => {
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [handleClick]);

  return null;
}
