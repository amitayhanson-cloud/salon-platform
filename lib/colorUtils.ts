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
