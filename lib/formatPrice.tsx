import React from "react";

/** Format a numeric amount as ILS for Hebrew locale (plain string). */
export function formatIlsPrice(amount: number): string {
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `₪${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

/**
 * Format a price for display, handling both single prices and ranges
 * Uses dir="ltr" for ranges to prevent RTL reversal issues
 * 
 * @param item - Object with price or priceRangeMin/priceRangeMax
 * @param options.combineFollowUp - If true, show one total (main + follow-up price) instead of "₪X + המשך ₪Y"
 * @returns React element with properly formatted price
 */
export function formatPriceDisplay(
  item: {
    price?: number | null;
    priceRangeMin?: number | null;
    priceRangeMax?: number | null;
    hasFollowUp?: boolean;
    followUp?: { price?: number } | null;
  },
  options?: { combineFollowUp?: boolean }
): React.ReactNode {
  const combineFollowUp = options?.combineFollowUp === true;
  const fu =
    item.hasFollowUp && item.followUp && typeof item.followUp.price === "number"
      ? Math.max(0, item.followUp.price)
      : 0;

  // Check for range first
  if (
    item.priceRangeMin !== undefined &&
    item.priceRangeMin !== null &&
    item.priceRangeMax !== undefined &&
    item.priceRangeMax !== null
  ) {
    const min = Math.min(item.priceRangeMin, item.priceRangeMax);
    const max = Math.max(item.priceRangeMin, item.priceRangeMax);
    if (fu > 0 && combineFollowUp) {
      return (
        <span dir="ltr" className="inline-block">
          ₪{min + fu}–₪{max + fu}
        </span>
      );
    }
    if (fu > 0) {
      return (
        <span dir="rtl" className="inline-block text-sm">
          <span dir="ltr" className="inline-block">
            ₪{min}–₪{max}
          </span>
          <span className="text-slate-600"> + המשך ₪{fu}</span>
        </span>
      );
    }
    return (
      <span dir="ltr" className="inline-block">
        ₪{min}–₪{max}
      </span>
    );
  }

  if (item.price !== undefined && item.price !== null) {
    if (fu > 0 && combineFollowUp) {
      return `₪${item.price + fu}`;
    }
    return fu > 0 ? `₪${item.price} + המשך ₪${fu}` : `₪${item.price}`;
  }

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
