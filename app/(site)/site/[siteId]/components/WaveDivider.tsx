"use client";

import React from "react";

type WaveDividerProps = {
  topColor?: string; // default "var(--heroBase)"
  bottomColor?: string; // default "var(--bg)"
  heightClassName?: string; // default "h-[clamp(64px,9vw,120px)]"
  className?: string;
};

export default function WaveDivider({
  topColor = "var(--heroBase)",
  bottomColor = "var(--bg)",
  heightClassName = "h-[clamp(64px,9vw,120px)]",
  className = "",
}: WaveDividerProps) {
  return (
    <div
      className={`w-full overflow-hidden leading-[0] ${className}`}
      style={{ backgroundColor: bottomColor }}
      aria-hidden="true"
    >
      <svg
        className={`block w-full ${heightClassName}`}
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
        style={{ pointerEvents: "none" }}
      >
        {/* Bottom layer (bottomColor) - forms the base */}
        <path
          fill={bottomColor}
          d="M0,160 L1440,160 L1440,0 L0,0 Z"
        />
        {/* Top layer (topColor) - forms the wave curve - big smooth single curve */}
        <path
          fill={topColor}
          d="M0,100 C240,60 480,60 720,80 C960,100 1200,100 1440,80 L1440,0 L0,0 Z"
        />
      </svg>
    </div>
  );
}
