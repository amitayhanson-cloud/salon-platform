"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { ArrowLeft, Store } from "lucide-react";
import type { SiteConfig } from "@/types/siteConfig";
import type { Product } from "@/types/product";
import { defaultThemeColors } from "@/types/siteConfig";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { subscribeSiteProducts, subscribeSiteProduct } from "@/lib/firestoreProducts";
import { getSiteUrl } from "@/lib/tenant";
import { formatIlsPrice } from "@/lib/formatPrice";
import LuxuryProductCard from "@/components/publicSite/LuxuryProductCard";

function ShopShell({
  children,
  config,
  siteId,
  backHref,
  title,
}: {
  children: React.ReactNode;
  config: SiteConfig | null;
  siteId: string;
  backHref: string;
  title: string;
}) {
  const theme = config?.themeColors ?? defaultThemeColors;
  const slug = config?.slug ?? null;
  return (
    <div
      className="min-h-screen text-right"
      dir="rtl"
      style={{
        backgroundColor: theme.background,
        color: theme.text,
        ["--text" as string]: theme.text,
        ["--surface" as string]: theme.surface,
        ["--border" as string]: theme.border,
        ["--primary" as string]: theme.primary,
      }}
    >
      <header className="border-b" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 lg:px-8">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-medium opacity-80 transition hover:opacity-100"
            style={{ color: theme.text }}
          >
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
            חזרה לאתר
          </Link>
          <Link href={getSiteUrl(slug, siteId, "")} className="text-lg font-semibold" style={{ color: theme.text }}>
            {config?.salonName ?? "החנות"}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
        <div className="mb-8 flex items-center gap-3">
          <Store className="h-6 w-6 opacity-70" aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}

export function ShopListingClient() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!siteId) return;
    const u1 = subscribeSiteConfig(siteId, setConfig, console.error);
    const u2 = subscribeSiteProducts(
      siteId,
      true,
      setProducts,
      (e) => console.error("[shop]", e)
    );
    return () => {
      u1();
      u2();
    };
  }, [siteId]);

  if (!siteId) return null;

  const slug = config?.slug ?? null;
  const shopBase = getSiteUrl(slug, siteId, "/shop");

  return (
    <ShopShell config={config} siteId={siteId} backHref={getSiteUrl(slug, siteId, "")} title="החנות">
      {products.length === 0 ? (
        <p className="text-sm opacity-70">אין מוצרים להצגה כרגע.</p>
      ) : (
        <div
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
          style={
            {
              "--products-border": config?.themeColors?.border ?? defaultThemeColors.border,
              "--products-cardText": config?.themeColors?.text ?? defaultThemeColors.text,
              "--products-priceText": config?.themeColors?.text ?? defaultThemeColors.text,
            } as React.CSSProperties
          }
        >
          {products.map((p) => (
            <LuxuryProductCard key={p.id} product={p} href={`${shopBase}/${p.id}`} />
          ))}
        </div>
      )}
    </ShopShell>
  );
}

export function ShopProductDetailClient() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const productId = params?.productId as string;
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [product, setProduct] = useState<Product | null | undefined>(undefined);

  useEffect(() => {
    if (!siteId || !productId) return;
    const u1 = subscribeSiteConfig(siteId, setConfig, console.error);
    const u2 = subscribeSiteProduct(
      siteId,
      productId,
      setProduct,
      () => setProduct(null)
    );
    return () => {
      u1();
      u2();
    };
  }, [siteId, productId]);

  if (!siteId || !productId) return null;

  const slug = config?.slug ?? null;
  const shopHref = getSiteUrl(slug, siteId, "/shop");

  if (product === undefined) {
    return (
      <ShopShell config={config} siteId={siteId} backHref={shopHref} title="מוצר">
        <p className="text-sm opacity-70">טוען…</p>
      </ShopShell>
    );
  }

  if (product === null) {
    return (
      <ShopShell config={config} siteId={siteId} backHref={shopHref} title="מוצר">
        <p className="text-sm opacity-70">המוצר לא נמצא.</p>
      </ShopShell>
    );
  }

  return (
    <ShopShell config={config} siteId={siteId} backHref={shopHref} title={product.name}>
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100">
          {product.images[0] ? (
            <Image src={product.images[0]} alt="" fill className="object-cover" priority sizes="(max-width: 1024px) 100vw, 50vw" />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-400">אין תמונה</div>
          )}
        </div>
        <div className="space-y-4">
          <p className="text-sm font-medium opacity-60">{product.category}</p>
          <p className="text-3xl font-semibold tabular-nums">{formatIlsPrice(product.price)}</p>
          {product.description ? (
            <p className="whitespace-pre-line leading-relaxed opacity-90">{product.description}</p>
          ) : null}
          <p className="text-sm opacity-60">מלאי: {product.stock}</p>
        </div>
      </div>
      {product.images.length > 1 ? (
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {product.images.slice(1).map((src) => (
            <div key={src} className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100">
              <Image src={src} alt="" fill className="object-cover" sizes="(max-width: 640px) 45vw, 200px" />
            </div>
          ))}
        </div>
      ) : null}
    </ShopShell>
  );
}
