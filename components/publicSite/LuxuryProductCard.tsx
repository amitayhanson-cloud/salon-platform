"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye } from "lucide-react";
import type { Product } from "@/types/product";
import { formatIlsPrice } from "@/lib/formatPrice";

export default function LuxuryProductCard({
  product,
  href,
  className = "",
  showPrice = true,
}: {
  product: Product;
  href: string;
  className?: string;
  /** When false (e.g. homepage product section), price is hidden until product page */
  showPrice?: boolean;
}) {
  const imageUrl = product.images[0]?.trim() || null;

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow duration-300 hover:shadow-xl ${className}`}
      style={{ borderColor: "var(--products-border, var(--border))" }}
    >
      <Link
        href={href}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)]"
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-neutral-100">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt=""
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">אין תמונה</div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-80" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg"
              style={{
                backgroundColor: "var(--surface, #fff)",
                color: "var(--text, #0f172a)",
              }}
            >
              <Eye className="h-4 w-4" aria-hidden />
              צפייה במוצר
            </span>
          </div>
        </div>
        <div className="space-y-1 px-4 py-4 text-right">
          <h3
            className="line-clamp-2 text-base font-semibold leading-snug tracking-tight"
            style={{ color: "var(--products-cardText, var(--text))" }}
          >
            {product.name}
          </h3>
          {showPrice ? (
            <p className="text-lg font-medium tabular-nums tracking-tight" style={{ color: "var(--products-priceText, var(--text))" }}>
              {formatIlsPrice(product.price)}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
