"use client";

import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import type { SiteConfig } from "@/types/siteConfig";
import type { Product } from "@/types/product";
import { getSiteUrl } from "@/lib/tenant";
import { getSectionColorResolved } from "@/lib/sectionStyles";
import { getContentValue } from "@/lib/editor/defaultContent";
import LuxuryProductCard from "./LuxuryProductCard";

export default function ProductSection({
  config,
  siteId,
  products,
}: {
  config: SiteConfig;
  siteId: string;
  products: Product[];
}) {
  if (config.showProductsSection !== true || products.length === 0) {
    return null;
  }

  const slug = config.slug ?? null;
  const shopHref = getSiteUrl(slug, siteId, "/shop");
  const content = config.content ?? {};
  const title = getContentValue(content, "products", "sectionTitle");
  const subtitle = getContentValue(content, "products", "sectionSubtitle");
  const display = products.slice(0, 4);

  return (
    <section
      id="products-section"
      dir="rtl"
      className="scroll-mt-[5.75rem] py-16 lg:py-24"
      style={{
        backgroundColor: getSectionColorResolved(config, "products", "bg"),
        ["--products-titleText" as string]: getSectionColorResolved(config, "products", "titleText"),
        ["--products-text" as string]: getSectionColorResolved(config, "products", "text"),
        ["--products-cardBg" as string]: getSectionColorResolved(config, "products", "cardBg"),
        ["--products-cardText" as string]: getSectionColorResolved(config, "products", "cardText"),
        ["--products-priceText" as string]: getSectionColorResolved(config, "products", "priceText"),
        ["--products-border" as string]: getSectionColorResolved(config, "products", "border"),
      }}
    >
      <div className="mx-auto max-w-6xl px-4 lg:px-8">
        <div className="mb-10 flex flex-col gap-3 text-right sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p
              className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] opacity-80"
              style={{ color: "var(--products-titleText)" }}
            >
              <Store className="h-3.5 w-3.5" aria-hidden />
              חנות
            </p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: "var(--products-titleText)" }}>
              {title}
            </h2>
            {subtitle ? (
              <p className="max-w-2xl text-base leading-relaxed" style={{ color: "var(--products-text)" }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <Link
            href={shopHref}
            className="inline-flex items-center gap-2 self-start rounded-full border px-5 py-2.5 text-sm font-semibold transition hover:bg-black/[0.04] sm:self-auto"
            style={{
              borderColor: "var(--products-border)",
              color: "var(--products-titleText)",
            }}
          >
            לכל החנות
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </Link>
        </div>

        <div
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          style={
            {
              "--text": getSectionColorResolved(config, "products", "cardText"),
              "--surface": getSectionColorResolved(config, "products", "cardBg"),
              "--border": getSectionColorResolved(config, "products", "border"),
              "--primary": getSectionColorResolved(config, "products", "titleText"),
            } as React.CSSProperties
          }
        >
          {display.map((p) => (
            <LuxuryProductCard key={p.id} product={p} href={`${shopHref}/${p.id}`} showPrice={false} />
          ))}
        </div>
      </div>
    </section>
  );
}
