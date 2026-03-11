/**
 * Utility functions for color calculations
 */

/**
 * Calculate the relative luminance of a color (0-1)
 * Based on WCAG 2.0 formula: https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function getLuminance(hex: string): number {
  // Remove # if present
  const cleanHex = hex.replace("#", "");
  
  // Parse RGB components
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  
  // Apply gamma correction
  const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  
  // Calculate relative luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Determine if text should be white or dark based on background color
 * Returns "white" for dark backgrounds, "dark" for light backgrounds
 */
export function getTextColorForBackground(backgroundColor: string): "white" | "dark" {
  // Default to blue if invalid color
  const color = backgroundColor || "#3B82F6";
  
  // Validate hex color format
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return "white"; // Default to white text for invalid colors
  }
  
  const luminance = getLuminance(color);
  
  // Use threshold of 0.5 (WCAG recommends 0.5 for contrast)
  // If luminance is low (dark background), use white text
  // If luminance is high (light background), use dark text
  return luminance < 0.5 ? "white" : "dark";
}

/**
 * Get the appropriate text color (hex) for a given background color
 */
export function getTextColorHex(backgroundColor: string): string {
  const textColor = getTextColorForBackground(backgroundColor);
  return textColor === "white" ? "#ffffff" : "#0f172a"; // white or dark slate
}

/** Soft background + dark text for calendar booking blocks (no saturated fills) */
const SERVICE_CALENDAR_PALETTE: { background: string; text: string }[] = [
  { background: "#DBEAFE", text: "#1E3A8A" },   // Blue
  { background: "#DCFCE7", text: "#166534" },   // Green
  { background: "#F3E8FF", text: "#6B21A8" },   // Purple
  { background: "#FED7AA", text: "#9A3412" },   // Orange
  { background: "#FCE7F3", text: "#9D174D" },   // Pink
  { background: "#CCFBF1", text: "#115E59" },   // Teal
];

const DEFAULT_SERVICE_CALENDAR = SERVICE_CALENDAR_PALETTE[0]!;

/** Map saturated/legacy hex → soft background for calendar display */
const LEGACY_TO_SOFT: Record<string, string> = {
  "#3B82F6": "#DBEAFE", "#2563EB": "#DBEAFE", "#60A5FA": "#DBEAFE",
  "#22C55E": "#DCFCE7", "#16A34A": "#DCFCE7", "#4ADE80": "#DCFCE7",
  "#A855F7": "#F3E8FF", "#9333EA": "#F3E8FF", "#C084FC": "#F3E8FF",
  "#F97316": "#FED7AA", "#EA580C": "#FED7AA", "#FB923C": "#FED7AA",
  "#EC4899": "#FCE7F3", "#DB2777": "#FCE7F3", "#F472B6": "#FCE7F3",
  "#14B8A6": "#CCFBF1", "#0D9488": "#CCFBF1", "#2DD4BF": "#CCFBF1",
};
const LEGACY_MAP = Object.fromEntries(
  Object.entries(LEGACY_TO_SOFT).map(([k, v]) => [k.toUpperCase(), v])
);

/**
 * Resolve a stored service color to background + text for calendar blocks.
 * Uses palette/legacy for known colors; for any other valid hex (e.g. custom #ff0a0a) uses that
 * as background and derives readable text so saved service colors always show correctly.
 */
export function getServiceCalendarColors(serviceColor: string | null | undefined): {
  background: string;
  text: string;
} {
  const raw = (serviceColor ?? "").trim();
  const normalized = raw.startsWith("#") ? raw.toUpperCase() : `#${raw.toUpperCase()}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) return DEFAULT_SERVICE_CALENDAR;
  const byBg = SERVICE_CALENDAR_PALETTE.find((e) => e.background.toUpperCase() === normalized);
  if (byBg) return byBg;
  const softBg = LEGACY_MAP[normalized];
  if (softBg) {
    const entry = SERVICE_CALENDAR_PALETTE.find((e) => e.background.toUpperCase() === softBg.toUpperCase());
    return entry ?? DEFAULT_SERVICE_CALENDAR;
  }
  // Custom/saved color: use as background and derive readable text (no fallback override)
  return { background: normalized, text: getTextColorHex(normalized) };
}
