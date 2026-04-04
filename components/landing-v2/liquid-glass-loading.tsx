"use client";

import Image from "next/image";

import { FEATURES_SECTION_BG_PAINT } from "./features-section-background";

/** Served from `public/brand/caleno logo/` */
const SITE_LOADING_IMAGE =
  "/brand/caleno%20logo/Untitled%20design%20(4).png";

type LiquidGlassLoadingProps = {
  /** Full viewport overlay (route loading, nav). Inline fits inside panels (admin, data states). */
  variant?: "fullscreen" | "inline";
};

/**
 * Site loading screen — branded artwork with continuous rotation (styles in app/liquid-glass-loader.css).
 */
export function LiquidGlassLoading({
  variant = "fullscreen",
}: LiquidGlassLoadingProps) {
  const rootClass =
    variant === "fullscreen"
      ? "landing-v2-liquid-loader-root"
      : "landing-v2-liquid-loader-inline";

  return (
    <div
      className={rootClass}
      style={
        variant === "fullscreen"
          ? { background: FEATURES_SECTION_BG_PAINT }
          : undefined
      }
      role="progressbar"
      aria-busy="true"
      aria-label="טוען"
    >
      <div className="landing-v2-site-loader-frame">
        <div className="landing-v2-site-loader-spin">
          <Image
            src={SITE_LOADING_IMAGE}
            alt=""
            fill
            className="landing-v2-site-loader-img object-contain"
            sizes="(max-width: 768px) 40vw, 152px"
            priority
          />
        </div>
      </div>
    </div>
  );
}
