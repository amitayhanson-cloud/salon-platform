"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { getMarketingPricingUrlClient } from "@/lib/url";
import type { AnalyticsMetricKind } from "@/lib/analytics/MockData";

const TEASER_BODY: Record<AnalyticsMetricKind, string> = {
  revenue: "See which services are your real money-makers.",
  whatsapp: "Track your exact spending down to the Agora.",
  bookings: "Predict your busiest weeks before they happen.",
  clients: "Track how your client base grows over time.",
  newClients: "See when new clients join each week.",
  cancellations: "Spot cancellation trends early.",
  utilization: "See how fully your calendar is booked.",
  traffic: "See which booking links drive the most traffic.",
};

type Props = {
  metricKind: AnalyticsMetricKind;
};

export function AnalyticsLockedOverlay({ metricKind }: Props) {
  const upgradeHref = getMarketingPricingUrlClient();
  const openInNewTab = /^https?:\/\//i.test(upgradeHref);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/5 p-3"
      dir="ltr"
    >
      <div className="max-w-[260px] rounded-2xl border border-white/60 bg-white/92 p-5 text-center shadow-[0_8px_40px_-12px_rgba(15,23,42,0.35)] backdrop-blur-md">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(30,111,124,0.12)] text-[#1e6f7c]">
          <Lock className="h-5 w-5" strokeWidth={2} aria-hidden />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Locked feature</p>
        <p className="mt-2 text-sm leading-snug text-[#0F172A]">{TEASER_BODY[metricKind]}</p>
        <Link
          href={upgradeHref}
          target={openInNewTab ? "_blank" : undefined}
          rel={openInNewTab ? "noopener noreferrer" : undefined}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#0F172A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E293B]"
        >
          Upgrade Now
        </Link>
      </div>
    </div>
  );
}
