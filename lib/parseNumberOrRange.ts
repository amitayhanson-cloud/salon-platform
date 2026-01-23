/**
 * Parse a string input that can be either a single number or a range (e.g., "30" or "30-60")
 * 
 * @param input - The input string to parse
 * @returns Parsed result with kind: "single" | "range" | "invalid"
 */
export function parseNumberOrRange(input: string): 
  | { kind: "single"; value: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "invalid"; error?: string } {
  
  const trimmed = input.trim();
  
  if (!trimmed) {
    return { kind: "invalid", error: "ערך ריק" };
  }
  
  // Try to match range format: "30-60" or "30 - 60" (with optional spaces)
  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    
    if (isNaN(min) || isNaN(max)) {
      return { kind: "invalid", error: "ערכים לא תקינים בטווח" };
    }
    
    if (min < 0 || max < 0) {
      return { kind: "invalid", error: "ערכים חייבים להיות גדולים או שווים ל-0" };
    }
    
    if (max <= min) {
      return { kind: "invalid", error: "הערך המקסימלי חייב להיות גדול מהמינימלי" };
    }
    
    return { kind: "range", min, max };
  }
  
  // Try to match single number format: "30" or "30.5"
  const singleMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]);
    
    if (isNaN(value)) {
      return { kind: "invalid", error: "ערך לא תקין" };
    }
    
    if (value < 0) {
      return { kind: "invalid", error: "ערך חייב להיות גדול או שווה ל-0" };
    }
    
    return { kind: "single", value };
  }
  
  // Invalid format
  return { kind: "invalid", error: "פורמט לא תקין: השתמש במספר (למשל: 30) או טווח (למשל: 30-60)" };
}

/**
 * Format a number or range for display
 * 
 * @param min - Minimum value
 * @param max - Maximum value (optional, if same as min, displays as single)
 * @returns Formatted string like "30" or "30-60"
 */
export function formatNumberOrRange(min: number | undefined | null, max?: number | undefined | null): string {
  if (min === undefined || min === null) {
    return "";
  }
  
  if (max === undefined || max === null || max === min) {
    return `${min}`;
  }
  
  return `${min}-${max}`;
}
