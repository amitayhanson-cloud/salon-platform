"use client";

/** Logo in public: public/brand/caleno logo/caleno_logo_new 2.png */
const CALENO_LOGO_SRC = "/brand/caleno%20logo/caleno_logo_new%202.png";

/**
 * Caleno water loading animation: orbital arcs, glowing logo, ripples, wave bar.
 * Uses caleno_logo_new 2.png in the center.
 *
 * Example:
 *   <div className="flex items-center justify-center h-screen">
 *     <CalenoLoader />
 *   </div>
 */
export default function CalenoLoader() {
  return (
    <div className="caleno-water-scene" role="status" aria-label="טוען">
      <div className="caleno-water-logo-outer">
        <div className="caleno-water-glow-pulse" aria-hidden />

        <div className="caleno-water-arc-ring caleno-water-arc-3" aria-hidden />
        <div className="caleno-water-arc-ring caleno-water-arc-2" aria-hidden />
        <div className="caleno-water-arc-ring caleno-water-arc-1" aria-hidden />

        <div className="caleno-water-dot-track caleno-water-dot-track-3">
          <div className="caleno-water-dot" />
        </div>
        <div className="caleno-water-dot-track caleno-water-dot-track-2">
          <div className="caleno-water-dot" />
        </div>
        <div className="caleno-water-dot-track caleno-water-dot-track-1">
          <div className="caleno-water-dot" />
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CALENO_LOGO_SRC}
          alt="Caleno"
          width={160}
          height={160}
          className="caleno-water-logo-img"
          loading="eager"
        />

        <svg
          className="caleno-water-ripple-svg"
          width={220}
          height={48}
          viewBox="0 0 220 48"
          overflow="visible"
          aria-hidden
        >
          <ellipse
            className="caleno-water-rp"
            cx={110}
            cy={28}
            rx={28}
            ry={7}
            fill="none"
            stroke="rgba(0,210,200,0.6)"
            strokeWidth={1.5}
          />
          <ellipse
            className="caleno-water-rp2"
            cx={110}
            cy={28}
            rx={28}
            ry={7}
            fill="none"
            stroke="rgba(0,210,200,0.5)"
            strokeWidth={1.5}
          />
          <ellipse
            className="caleno-water-rp3"
            cx={110}
            cy={28}
            rx={28}
            ry={7}
            fill="none"
            stroke="rgba(0,210,200,0.4)"
            strokeWidth={1.5}
          />
        </svg>
      </div>

      <div className="caleno-water-wave-bar">
        {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1].map((delay, i) => (
          <span key={i} style={{ animationDelay: `${delay}s` }} />
        ))}
      </div>

      <div className="caleno-water-label">Loading</div>
    </div>
  );
}
