/**
 * Build Waze navigation URLs from site config (same pattern as ContactIconsBar).
 * No address / empty → no URL (callers omit Waze lines from WhatsApp).
 */

export function buildWazeUrlFromAddress(address: string | null | undefined): string {
  const t = typeof address === "string" ? address.trim() : "";
  if (!t) return "";
  return `https://waze.com/ul?q=${encodeURIComponent(t)}&navigate=yes`;
}

/** Extra lines for booking confirmation WhatsApp (empty if no URL). */
export function confirmationWazeBlockFromUrl(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  return `\n\n${u}`;
}

/** Extra lines for reminder WhatsApp after initial booking confirmation. */
export function reminderWazeBlockFromUrl(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return "";
  return `\n\nמחכים לראותך\n${u}`;
}
