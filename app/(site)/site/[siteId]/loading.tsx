/**
 * Fallback while a new segment under /site/[siteId]/… loads (e.g. / → /book).
 * Logo-specific feedback is handled by NavigationLoadingLayer on link clicks.
 */
export default function SiteIdSegmentLoading() {
  return (
    <div
      className="flex min-h-[45vh] w-full flex-col items-center justify-center gap-4 px-4"
      dir="rtl"
      aria-busy="true"
      aria-label="טוען"
    >
      <div
        className="h-11 w-11 rounded-full border-2 border-[#1e6f7c] border-t-transparent animate-spin"
        aria-hidden
      />
      <p className="text-sm text-slate-500">טוען…</p>
    </div>
  );
}
