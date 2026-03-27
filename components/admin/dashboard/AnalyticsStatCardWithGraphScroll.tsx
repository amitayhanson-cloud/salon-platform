"use client";

import Link from "next/link";
import { ExternalLink, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { StatSparkline } from "@/components/admin/dashboard/StatSparkline";

/** Snappier spring — reads as a slight “zoom” into the Bento tile */
const STAT_MORPH_TRANSITION = {
  type: "spring" as const,
  stiffness: 520,
  damping: 30,
  mass: 0.72,
};

export type DashboardBentoSize = "hero" | "secondary" | "small";

type Props = {
  label: string;
  value: number | string | null;
  href: string;
  icon: LucideIcon;
  title?: string;
  className?: string;
  onOpenChart: () => void;
  expandLayoutId: string;
  /** Tailwind grid placement, e.g. col-span-12 md:col-span-6 */
  gridClassName: string;
  bentoSize: DashboardBentoSize;
  /** Week series for hero sparkline only */
  sparklineValues?: (number | null)[];
};

/**
 * Bento dashboard tile: RTL text, icon + external link on the opposite side; hero rows include a sparkline.
 */
export function AnalyticsStatCardWithGraphScroll({
  label,
  value,
  href,
  icon: Icon,
  title,
  className,
  onOpenChart,
  expandLayoutId,
  gridClassName,
  bentoSize,
  sparklineValues,
}: Props) {
  const isHero = bentoSize === "hero";

  return (
    <motion.div
      layoutId={expandLayoutId}
      layout
      transition={STAT_MORPH_TRANSITION}
      className={cn(
        "group relative rounded-2xl border border-slate-100 bg-white/90 shadow-sm",
        "transition-all duration-300 ease-out will-change-transform",
        "hover:z-10 hover:scale-[1.02] hover:shadow-md",
        "min-w-0",
        gridClassName,
        className
      )}
    >
      <button
        type="button"
        title={title}
        onClick={onOpenChart}
        dir="rtl"
        className={cn(
          "flex w-full flex-row rounded-2xl text-right text-slate-900 transition-colors",
          "pe-3 pt-3 ps-3 pb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/40 focus-visible:ring-offset-2",
          isHero
            ? "min-h-[8.5rem] items-start sm:min-h-[9rem]"
            : "min-h-[4.75rem] items-center md:min-h-[5.5rem]"
        )}
      >
        <div className={cn("flex min-w-0 flex-1 flex-col", isHero && "justify-center py-0.5")}>
          <div className="inline-flex w-full items-center justify-start gap-2">
            <motion.span
              layoutId={`${expandLayoutId}-icon`}
              transition={STAT_MORPH_TRANSITION}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600 ring-1 ring-teal-700/5",
                isHero ? "h-11 w-11 sm:h-12 sm:w-12" : "h-10 w-10"
              )}
            >
              <Icon className={cn("shrink-0 stroke-[2]", isHero ? "h-5 w-5" : "h-4 w-4")} aria-hidden />
            </motion.span>
            <span className="truncate text-sm font-medium leading-relaxed text-slate-600">{label}</span>
          </div>
          <motion.p
            layoutId={`${expandLayoutId}-value`}
            transition={STAT_MORPH_TRANSITION}
            className={cn(
              "mt-0.5 font-bold tabular-nums text-slate-900",
              isHero ? "text-2xl md:text-3xl" : "text-lg md:text-xl"
            )}
          >
            {value !== null && value !== undefined ? value : "—"}
          </motion.p>
          {isHero && sparklineValues && sparklineValues.length > 0 ? (
            <div className="mt-3 flex w-full justify-end border-t border-slate-100/90 pt-3">
              <StatSparkline values={sparklineValues} width={132} height={36} className="opacity-90" />
            </div>
          ) : null}
        </div>
      </button>
      <Link
        href={href}
        title="לדף הניהול"
        aria-label={`לדף הניהול — ${label}`}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        className={cn(
          "absolute top-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-full",
          "end-2.5 border border-slate-100 bg-white text-teal-600 shadow-sm",
          "transition hover:bg-teal-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/35",
          "md:top-3 md:end-3"
        )}
      >
        <ExternalLink className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      </Link>
    </motion.div>
  );
}

export { STAT_MORPH_TRANSITION };
