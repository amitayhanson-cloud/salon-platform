"use client";

import Link from "next/link";
import type { SiteService } from "@/types/siteConfig";

function formatPrice(price: number | string | undefined): string | null {
  if (price === undefined || price === null) return null;
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (!Number.isFinite(n)) return null;
  return `₪${Math.round(n)}`;
}

function formatDuration(minutes: number | undefined): string | null {
  if (minutes === undefined || minutes === null || minutes < 1) return null;
  return `${minutes} דק׳`;
}

export default function ServiceCard({
  service,
  siteId,
  bookingEnabled,
  libraryImage,
}: {
  service: SiteService;
  siteId: string;
  bookingEnabled: boolean;
  /** Fallback image from template library when service has no imageUrl */
  libraryImage?: string | null;
}) {
  const priceStr = formatPrice(service.price);
  const durationStr = formatDuration(service.duration);
  const metaParts = [priceStr, durationStr].filter(Boolean);
  const metaRow = metaParts.length > 0 ? metaParts.join(" • ") : null;

  const imageSrc = service.imageUrl || libraryImage;

  const content = (
    <>
      <div className="relative w-full overflow-hidden rounded-t-2xl bg-[var(--border)]" style={{ aspectRatio: "16/10" }}>
        {imageSrc ? (
          <img
            src={imageSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-[var(--muted)]"
            style={{ backgroundColor: "var(--surface)" }}
            aria-hidden
          >
            <svg className="w-12 h-12 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
            </svg>
          </div>
        )}
      </div>
      <div className="rounded-b-2xl border border-t-0 p-5 text-right" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <h3 className="text-lg font-bold leading-snug mb-2" style={{ color: "var(--text)" }}>
          {service.name}
        </h3>
        {service.description?.trim() ? (
          <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--muted)" }}>
            {service.description.trim()}
          </p>
        ) : null}
        {metaRow ? (
          <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
            {metaRow}
          </p>
        ) : null}
      </div>
    </>
  );

  const cardClassName =
    "group block w-full rounded-2xl overflow-hidden border transition-all duration-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--primary)]";
  const cardStyle = { borderColor: "var(--border)" };

  if (bookingEnabled) {
    return (
      <Link
        href={`/site/${siteId}/book`}
        className={cardClassName}
        style={cardStyle}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cardClassName} style={cardStyle}>
      {content}
    </div>
  );
}
