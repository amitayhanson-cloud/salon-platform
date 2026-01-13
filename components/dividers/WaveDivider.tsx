"use client";

import React from "react";

type Props = {
  topColor: string;
  bottomColor: string;
  height?: number;
  flip?: boolean;
  className?: string;
};

export default function WaveDivider({
  topColor,
  bottomColor,
  height = 120,
  flip = false,
  className = "",
}: Props) {
  return (
    <div
      className={`w-full overflow-hidden leading-[0] ${className}`}
      style={{ backgroundColor: bottomColor }}
      aria-hidden="true"
    >
      <svg
        className={`block w-[calc(100%+2px)] ${
          flip ? "rotate-180" : ""
        }`}
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        style={{ 
          pointerEvents: "none",
          height: `${height}px`
        }}
      >
        <path
          fill={topColor}
          d="M0,64 C240,120 480,120 720,80 C960,40 1200,40 1440,72 L1440,0 L0,0 Z"
        />
      </svg>
    </div>
  );
}
