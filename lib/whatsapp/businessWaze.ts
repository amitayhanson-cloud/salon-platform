/**
 * Build Waze navigation URLs from site config (same pattern as ContactIconsBar).
 * No address / empty → no URL (template engine strips empty {waze_link}).
 */

export function buildWazeUrlFromAddress(address: string | null | undefined): string {
  const t = typeof address === "string" ? address.trim() : "";
  if (!t) return "";
  return `https://waze.com/ul?q=${encodeURIComponent(t)}&navigate=yes`;
}
