"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AdminCardProps {
  children: ReactNode;
  /** Soft gradient from white to Caleno tint (matches landing hero card) */
  gradient?: boolean;
  className?: string;
}

/**
 * Content card for admin pages: rounded-3xl, border, white or soft gradient.
 * Use for forms, sections, and main content blocks.
 */
export function AdminCard({ children, gradient = false, className }: AdminCardProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-[#E2E8F0] shadow-sm",
        gradient
          ? "bg-gradient-to-b from-white to-[#f5fbfc]"
          : "bg-white",
        className
      )}
    >
      {children}
    </div>
  );
}
