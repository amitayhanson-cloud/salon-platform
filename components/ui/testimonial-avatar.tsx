"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export function TestimonialAvatar({
  src,
  name,
  initials,
  className,
}: {
  src: string | null | undefined;
  name: string;
  initials: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(src?.trim()) && !failed;

  const onError = useCallback(() => setFailed(true), []);

  if (!showImg) {
    return (
      <div
        className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center border border-[var(--border)] text-sm font-semibold",
          className
        )}
        style={{
          backgroundColor: "var(--surface)",
          color: "var(--mutedText)",
        }}
        aria-hidden={!name}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src!.trim()}
      alt={name ? `תמונת ${name}` : ""}
      className={cn(
        "w-16 h-16 rounded-full object-cover border border-[var(--border)] bg-[var(--surface)]",
        className
      )}
      onError={onError}
      loading="lazy"
      decoding="async"
    />
  );
}
