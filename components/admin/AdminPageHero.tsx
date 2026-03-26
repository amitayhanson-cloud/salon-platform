"use client";

import { ReactNode } from "react";

export interface AdminPageHeroProps {
  title: string;
  subtitle?: string;
  /** Optional pill badges (e.g. ["חדש"]) */
  pills?: string[];
  /** Use matte liquid glass (backdrop-blur, semi-transparent). Default false = same gradient as main Caleno landing hero. */
  glass?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * Hero strip for admin pages: title, optional subtitle and pills.
 * Default: same background and gradient as main Caleno landing hero (rounded-3xl, border, gradient + grid).
 * Set glass=true for matte liquid glass style.
 */
export function AdminPageHero({
  title,
  subtitle,
  pills,
  glass = false,
  children,
  className = "",
}: AdminPageHeroProps) {
  return (
    <section
      dir="rtl"
      className={`relative overflow-hidden rounded-2xl border border-[#E2E8F0] shadow-sm px-4 py-4 sm:rounded-3xl sm:px-6 sm:py-7 md:py-8 ${className}`}
      style={
        glass
          ? {
              backgroundColor: "rgba(255,255,255,0.25)",
              borderColor: "rgba(255,255,255,0.3)",
              boxShadow: "0 4px 24px -4px rgba(0,0,0,0.08), 0 0 0 1px rgba(255,255,255,0.4) inset",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }
          : undefined
      }
    >
      {/* Same background and gradient as main Caleno landing hero */}
      {!glass && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: "linear-gradient(180deg, #ffffff 0%, #f5fbfc 25%, #e6f5f7 55%, #cceef1 100%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
              backgroundSize: "40px 40px, 40px 40px",
              maskImage: "radial-gradient(100% 70% at 50% 30%, rgba(0,0,0,1), rgba(0,0,0,0.05))",
            }}
          />
        </>
      )}

      <div className="relative z-10">
        {pills && pills.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {pills.map((p) => (
              <span
                key={p}
                className="rounded-full border border-[#E2E8F0] bg-white/70 px-2.5 py-1 text-xs font-medium shadow-sm"
              >
                {p}
              </span>
            ))}
          </div>
        )}
        <h1 className="text-xl font-extrabold tracking-tight text-[#0F172A] sm:text-3xl md:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm leading-relaxed text-[#64748B] sm:mt-2 sm:text-lg">
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
