"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import CalenoLoader from "@/components/ui/CalenoLoader";

type Props = {
  children: React.ReactNode;
  shouldShowForNavigation: (nextUrl: URL) => boolean;
  /** Default when `variantForDestination` is not set or does not apply */
  variant: "caleno" | "tenant";
  /** If set, Caleno vs tenant logo is chosen from the link target (e.g. public → admin uses Caleno). */
  variantForDestination?: (nextUrl: URL) => "caleno" | "tenant";
  /** When variant=tenant */
  tenantLogoUrl?: string | null;
  maxWaitMs?: number;
};

/**
 * Full-screen loading feedback after in-app link clicks until the pathname changes
 * (covers slow client navigations where route loading.tsx is not enough).
 */
export function NavigationLoadingLayer({
  children,
  shouldShowForNavigation,
  variant,
  variantForDestination,
  tenantLogoUrl,
  maxWaitMs = 12000,
}: Props) {
  const pathname = usePathname() ?? "";
  const [visible, setVisible] = useState(false);
  const [activeVariant, setActiveVariant] = useState<"caleno" | "tenant">(variant);
  const [mounted, setMounted] = useState(false);
  const predicateRef = useRef(shouldShowForNavigation);
  const variantRef = useRef(variant);
  const variantForDestRef = useRef(variantForDestination);

  useEffect(() => {
    predicateRef.current = shouldShowForNavigation;
  }, [shouldShowForNavigation]);

  useEffect(() => {
    variantRef.current = variant;
    if (!visible) setActiveVariant(variant);
  }, [variant, visible]);

  useEffect(() => {
    variantForDestRef.current = variantForDestination;
  }, [variantForDestination]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setVisible(false);
    setActiveVariant(variantRef.current);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as Element | null)?.closest?.("a[href]");
      if (!el || !(el instanceof HTMLAnchorElement)) return;
      if (el.target === "_blank" || el.hasAttribute("download")) return;
      const href = el.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let nextUrl: URL;
      try {
        nextUrl = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (nextUrl.origin !== window.location.origin) return;
      if (
        nextUrl.pathname === window.location.pathname &&
        nextUrl.search === window.location.search
      ) {
        return;
      }
      if (!predicateRef.current(nextUrl)) return;
      const v = variantForDestRef.current?.(nextUrl) ?? variantRef.current;
      setActiveVariant(v);
      setVisible(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), maxWaitMs);
    return () => window.clearTimeout(t);
  }, [visible, maxWaitMs]);

  const overlay =
    !mounted || !visible ? null : (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-white/90 backdrop-blur-[3px]"
        role="progressbar"
        aria-busy="true"
        aria-label="טוען"
      >
        {activeVariant === "caleno" ? (
          <div className="scale-[0.82]">
            <CalenoLoader />
          </div>
        ) : tenantLogoUrl ? (
          <div className="flex flex-col items-center gap-5 px-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tenantLogoUrl}
              alt=""
              width={160}
              height={160}
              className="h-20 w-auto max-w-[200px] object-contain md:h-24 animate-pulse"
            />
            <div
              className="h-10 w-10 rounded-full border-2 border-[#1e6f7c] border-t-transparent animate-spin"
              aria-hidden
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div
              className="h-12 w-12 rounded-full border-2 border-[#1e6f7c] border-t-transparent animate-spin"
              aria-hidden
            />
            <p className="text-sm text-slate-500">טוען…</p>
          </div>
        )}
      </div>
    );

  return (
    <>
      {children}
      {mounted && overlay ? createPortal(overlay, document.body) : null}
    </>
  );
}
