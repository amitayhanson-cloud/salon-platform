"use client";

import * as React from "react";
import { motion, PanInfo } from "framer-motion";
import { cn } from "@/lib/utils";

export type TestimonialItem = {
  id: number | string;
  name: string;
  description: string;
  rating: number; // 1-5
  avatar?: string | null; // Optional profile image URL
};

export interface TestimonialCarouselProps
  extends React.HTMLAttributes<HTMLDivElement> {
  testimonials: TestimonialItem[];
  showDots?: boolean;
}

const Stars = ({ rating }: { rating: number }) => {
  const safeRating = Math.max(1, Math.min(5, Math.round(rating)));
  return (
    <div className="flex items-center gap-0.5 justify-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={cn(
            "w-4 h-4",
            i < safeRating ? "fill-current" : "fill-none"
          )}
          style={{
            color: i < safeRating ? "var(--accent)" : "var(--mutedText)",
            opacity: i < safeRating ? 1 : 0.3,
          }}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
      <span className="sr-only">{safeRating} / 5</span>
    </div>
  );
};

export const TestimonialCarousel = React.forwardRef<
  HTMLDivElement,
  TestimonialCarouselProps
>(({ className, testimonials, showDots = true, ...props }, ref) => {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [exitX, setExitX] = React.useState<number>(0);

  const handleDragEnd = (
    event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (!testimonials?.length) return;

    if (Math.abs(info.offset.x) > 90) {
      setExitX(info.offset.x);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % testimonials.length);
        setExitX(0);
      }, 180);
    }
  };

  if (!testimonials || testimonials.length === 0) return null;

  return (
    <div
      ref={ref}
      dir="rtl"
      className={cn("w-full flex items-center justify-center", className)}
      {...props}
    >
      <div className="relative w-[320px] sm:w-[360px] h-[320px]">
        {testimonials.map((t, index) => {
          const isCurrent = index === currentIndex;
          const isPrev = index === (currentIndex + 1) % testimonials.length;
          const isNext = index === (currentIndex + 2) % testimonials.length;

          if (!isCurrent && !isPrev && !isNext) return null;

          // Get initials for placeholder
          const initials = t.name
            ? t.name
                .trim()
                .split(/\s+/)
                .map((word) => word[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()
            : "?";

          return (
            <motion.div
              key={t.id}
              className={cn(
                "absolute inset-0 rounded-2xl cursor-grab active:cursor-grabbing",
                "border shadow-sm",
                "bg-[var(--card)] border-[var(--border)]"
              )}
              style={{
                zIndex: isCurrent ? 3 : isPrev ? 2 : 1,
              }}
              drag={isCurrent ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.7}
              onDragEnd={isCurrent ? handleDragEnd : undefined}
              initial={{
                scale: 0.96,
                opacity: 0,
                y: isCurrent ? 0 : isPrev ? 10 : 18,
                rotate: isCurrent ? 0 : isPrev ? -2 : -4,
              }}
              animate={{
                scale: isCurrent ? 1 : 0.96,
                opacity: isCurrent ? 1 : isPrev ? 0.55 : 0.25,
                x: isCurrent ? exitX : 0,
                y: isCurrent ? 0 : isPrev ? 10 : 18,
                rotate: isCurrent ? exitX / 25 : isPrev ? -2 : -4,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 22,
              }}
            >
              <div className="p-6 flex flex-col items-center gap-3 text-center">
                {/* Avatar circle */}
                {t.avatar ? (
                  <img
                    src={t.avatar}
                    alt={t.name}
                    className="w-16 h-16 rounded-full object-cover border border-[var(--border)]"
                  />
                ) : (
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center border border-[var(--border)] text-sm font-semibold"
                    style={{
                      backgroundColor: "var(--surface)",
                      color: "var(--mutedText)",
                    }}
                  >
                    {initials}
                  </div>
                )}

                {/* Name */}
                <h3 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
                  {t.name}
                </h3>

                {/* Stars */}
                <Stars rating={t.rating ?? 5} />

                {/* Review text with quotes */}
                <p className="text-center text-sm leading-relaxed" style={{ color: "var(--mutedText)" }}>
                  &quot;{t.description}&quot;
                </p>
              </div>
            </motion.div>
          );
        })}

        {/* Dots indicator */}
        {showDots && testimonials.length > 1 && (
          <div className="absolute -bottom-8 left-0 right-0 flex justify-center gap-2">
            {testimonials.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  index === currentIndex
                    ? "bg-[var(--primary)]"
                    : "bg-[var(--border)]"
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

TestimonialCarousel.displayName = "TestimonialCarousel";
