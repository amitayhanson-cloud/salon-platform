"use client";

import type { BookingStatusKey } from "@/lib/bookingStatusUi";
import { statusUi } from "@/lib/bookingStatusUi";

const DEFAULT_SIZE_PX = 10;

interface StatusDotProps {
  /** Normalized status key for color mapping. */
  statusKey: BookingStatusKey;
  /** Diameter in px. Default 10. */
  size?: number;
  /** Optional tooltip (e.g. Hebrew label). */
  title?: string;
  className?: string;
}

/**
 * Colored dot with dark outline for booking status. Readable on any background.
 * booked => blue, pending => yellow, confirmed => green.
 */
export default function StatusDot({
  statusKey,
  size = DEFAULT_SIZE_PX,
  title,
  className = "",
}: StatusDotProps) {
  const ui = statusUi(statusKey);
  return (
    <span
      className={`shrink-0 rounded-full border-2 border-black/85 shadow-sm ${ui.dotStyle} ${className}`}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden
    />
  );
}
