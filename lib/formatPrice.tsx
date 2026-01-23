import React from "react";

/**
 * Format a price for display, handling both single prices and ranges
 * Uses dir="ltr" for ranges to prevent RTL reversal issues
 * 
 * @param item - Object with price or priceRangeMin/priceRangeMax
 * @returns React element with properly formatted price
 */
export function formatPriceDisplay(item: {
  price?: number | null;
  priceRangeMin?: number | null;
  priceRangeMax?: number | null;
}): React.ReactNode {
  // Check for range first
  if (
    item.priceRangeMin !== undefined &&
    item.priceRangeMin !== null &&
    item.priceRangeMax !== undefined &&
    item.priceRangeMax !== null
  ) {
    // Ensure min <= max (handle any edge cases)
    const min = Math.min(item.priceRangeMin, item.priceRangeMax);
    const max = Math.max(item.priceRangeMin, item.priceRangeMax);
    
    // Format as ₪500–₪700 with dir="ltr" to prevent RTL reversal
    return (
      <span dir="ltr" className="inline-block">
        ₪{min}–₪{max}
      </span>
    );
  }
  
  // Single price
  if (item.price !== undefined && item.price !== null) {
    return `₪${item.price}`;
  }
  
  // No price
  return "-";
}

/**
 * Format a price as a string (for non-React contexts)
 * 
 * @param item - Object with price or priceRangeMin/priceRangeMax
 * @returns Formatted price string
 */
export function formatPriceString(item: {
  price?: number | null;
  priceRangeMin?: number | null;
  priceRangeMax?: number | null;
}): string {
  // Check for range first
  if (
    item.priceRangeMin !== undefined &&
    item.priceRangeMin !== null &&
    item.priceRangeMax !== undefined &&
    item.priceRangeMax !== null
  ) {
    // Ensure min <= max
    const min = Math.min(item.priceRangeMin, item.priceRangeMax);
    const max = Math.max(item.priceRangeMin, item.priceRangeMax);
    
    return `₪${min}–₪${max}`;
  }
  
  // Single price
  if (item.price !== undefined && item.price !== null) {
    return `₪${item.price}`;
  }
  
  // No price
  return "-";
}
