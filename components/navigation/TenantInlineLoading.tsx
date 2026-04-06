"use client";

/**
 * Neutral route-segment loading (no Caleno branding).
 * Used under /site/[siteId]/… so the visual site editor preview never shows the platform logo.
 */
export function TenantInlineLoading() {
  return (
    <div
      className="flex min-h-[40vh] w-full items-center justify-center bg-[#F8FAFC]"
      dir="rtl"
      aria-busy="true"
      aria-label="טוען"
    >
      <div
        className="h-9 w-9 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin"
        aria-hidden
      />
    </div>
  );
}
