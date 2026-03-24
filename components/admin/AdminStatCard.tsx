"use client";

import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminStatCardProps {
  label: string;
  value: number | string | null;
  href: string;
  icon: LucideIcon;
  className?: string;
}

/**
 * Stat card for dashboard: rounded-2xl, Caleno tint background, icon + label + value.
 * Hover state for engagement. Renders as Link.
 */
export function AdminStatCard({ label, value, href, icon: Icon, className }: AdminStatCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col rounded-2xl border border-[#E2E8F0] p-4 transition-all duration-200",
        "bg-[rgba(30,111,124,0.06)] hover:bg-[rgba(30,111,124,0.1)] hover:border-caleno-deep/30 hover:shadow-md",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2",
        className
      )}
    >
      <div className="mb-2 flex items-start gap-2 text-caleno-deep">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(30,111,124,0.12)] text-caleno-deep">
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 pt-0.5 text-sm font-medium leading-snug text-[#0F172A]/80">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold leading-tight text-[#0F172A] tabular-nums">
        {value !== null && value !== undefined ? value : "—"}
      </p>
    </Link>
  );
}
