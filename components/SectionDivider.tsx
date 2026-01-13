"use client";

interface SectionDividerProps {
  styleKey: "none" | "wave" | "curve" | "angle";
  height?: number;
  fromColor?: string;
  toColor?: string;
  flip?: boolean;
  className?: string;
}

export default function SectionDivider({
  styleKey,
  height = 48,
  fromColor = "var(--bg)",
  toColor = "var(--surface)",
  flip = false,
  className = "",
}: SectionDividerProps) {
  if (styleKey === "none") {
    return null;
  }

  const h = Math.max(24, Math.min(96, height));

  const getPath = () => {
    const width = 100;
    const waveAmplitude = h * 0.4; // Wave height
    
    switch (styleKey) {
      case "wave":
        // Soft wave pattern - repeating waves using quadratic curves
        if (flip) {
          // Wave going up (from bottom to top)
          return `M0,${h} Q${width * 0.25},${h - waveAmplitude} ${width * 0.5},${h} T${width},${h} L${width},0 L0,0 Z`;
        } else {
          // Wave going down (from top to bottom)
          return `M0,0 Q${width * 0.25},${waveAmplitude} ${width * 0.5},0 T${width},0 L${width},${h} L0,${h} Z`;
        }
      case "curve":
        // Single smooth curve
        if (flip) {
          return `M0,${h} Q${width / 2},0 ${width},${h} L${width},0 L0,0 Z`;
        } else {
          return `M0,0 Q${width / 2},${h} ${width},0 L${width},${h} L0,${h} Z`;
        }
      case "angle":
        // Diagonal line
        if (flip) {
          return `M0,${h} L${width},0 L${width},${h} L0,${h} Z`;
        } else {
          return `M0,0 L${width},${h} L${width},0 L0,0 Z`;
        }
      default:
        return "";
    }
  };

  return (
    <div
      className={`section-divider ${className}`}
      style={{
        width: "100%",
        height: `${h}px`,
        lineHeight: 0,
        display: "block",
        overflow: "hidden",
        margin: 0,
        padding: 0,
      }}
    >
      <svg
        width="100%"
        height={h}
        preserveAspectRatio="none"
        viewBox={`0 0 100 ${h}`}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      >
        <defs>
          <linearGradient id={`gradient-${styleKey}-${h}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>
        <path
          d={getPath()}
          fill={`url(#gradient-${styleKey}-${h})`}
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      </svg>
    </div>
  );
}
