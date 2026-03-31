"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const AVATAR_URL = "https://v0.dev/placeholder-user.jpg";

const testimonials = [
  {
    name: "Marie Dupont",
    role: "Owner in Nice",
    content:
      "I rented out my apartment in less than a week. The interface is so intuitive!",
    avatar: AVATAR_URL,
  },
  {
    name: "Thomas Martin",
    role: "Tenant in Paris",
    content:
      "Finally a transparent platform. I found my studio without paying agency fees.",
    avatar: AVATAR_URL,
  },
  {
    name: "Sophie Bernard",
    role: "Owner in Lyon",
    content:
      "The tenant verification system gives me peace of mind. I recommend it 100%!",
    avatar: AVATAR_URL,
  },
];

const testimonials2 = [
  {
    name: "Lucas Petit",
    role: "Tenant in Bordeaux",
    content:
      "Best rental experience I've ever had. The process was seamless from start to finish.",
    avatar: AVATAR_URL,
  },
  {
    name: "Emma Laurent",
    role: "Owner in Marseille",
    content:
      "My property was listed and rented within days. Incredible platform!",
    avatar: AVATAR_URL,
  },
  {
    name: "Antoine Rousseau",
    role: "Tenant in Toulouse",
    content:
      "No hidden fees, no surprises. Exactly what I was looking for in a rental app.",
    avatar: AVATAR_URL,
  },
];

const duplicatedTestimonials = [...testimonials, ...testimonials, ...testimonials];
const duplicatedTestimonials2 = [...testimonials2, ...testimonials2, ...testimonials2];

/** Matches v0 template card shell (`border-none` overrides `border` like the original). */
const cardClassName =
  "flex-shrink-0 w-full sm:w-[400px] bg-card border border-border rounded-2xl p-8 border-none py-4";

export function TestimonialsSection() {
  const [isPaused, setIsPaused] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRef2 = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef2.current) {
        scrollRef2.current.scrollLeft = scrollRef2.current.scrollWidth / 3;
      }
      setIsInitialized(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isPaused || !isInitialized || !scrollRef.current) return;

    const scrollContainer = scrollRef.current;
    let animationFrameId: number;
    let isActive = true;

    const scroll = () => {
      if (!isActive || !scrollContainer) return;

      scrollContainer.scrollLeft += 1;
      const maxScroll = scrollContainer.scrollWidth / 3;

      if (scrollContainer.scrollLeft >= maxScroll) {
        scrollContainer.scrollLeft = 0;
      }

      animationFrameId = requestAnimationFrame(scroll);
    };

    animationFrameId = requestAnimationFrame(scroll);

    return () => {
      isActive = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPaused, isInitialized]);

  useEffect(() => {
    if (isPaused || !isInitialized || !scrollRef2.current) return;

    const scrollContainer = scrollRef2.current;
    let animationFrameId: number;
    let isActive = true;

    const scroll = () => {
      if (!isActive || !scrollContainer) return;

      scrollContainer.scrollLeft -= 1;

      if (scrollContainer.scrollLeft <= 0) {
        scrollContainer.scrollLeft = scrollContainer.scrollWidth / 3;
      }

      animationFrameId = requestAnimationFrame(scroll);
    };

    animationFrameId = requestAnimationFrame(scroll);

    return () => {
      isActive = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPaused, isInitialized]);

  return (
    <section id="testimonials" className="px-6 py-32" dir="ltr">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <h2 className="font-serif text-4xl font-normal leading-tight md:text-5xl">
            What they say about us
          </h2>
        </div>

        <div className="space-y-6">
          <div className="relative">
            <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-32 bg-gradient-to-r from-background to-transparent" />
            <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-32 bg-gradient-to-l from-background to-transparent" />

            <div
              ref={scrollRef}
              className="flex gap-6 overflow-x-hidden"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onTouchStart={() => setIsPaused(true)}
              onTouchEnd={() => setIsPaused(false)}
              style={{ scrollBehavior: "auto" }}
            >
              {duplicatedTestimonials.map((testimonial, index) => (
                <div key={index} className={cardClassName}>
                  <div className="mb-6 flex items-start gap-4">
                    <Image
                      src={testimonial.avatar || AVATAR_URL}
                      alt={testimonial.name}
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                    <p className="flex-1 text-lg leading-relaxed text-foreground">
                      &ldquo;{testimonial.content}&rdquo;
                    </p>
                  </div>
                  <div className="mt-auto">
                    <p className="text-sm font-bold text-foreground">{testimonial.name}</p>
                    <p className="text-muted-foreground text-xs">{testimonial.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-32 bg-gradient-to-r from-background to-transparent" />
            <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-32 bg-gradient-to-l from-background to-transparent" />

            <div
              ref={scrollRef2}
              className="flex gap-6 overflow-x-hidden"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              onTouchStart={() => setIsPaused(true)}
              onTouchEnd={() => setIsPaused(false)}
              style={{ scrollBehavior: "auto" }}
            >
              {duplicatedTestimonials2.map((testimonial, index) => (
                <div key={index} className={cardClassName}>
                  <div className="mb-6 flex items-start gap-4">
                    <Image
                      src={testimonial.avatar || AVATAR_URL}
                      alt={testimonial.name}
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                    <p className="flex-1 text-lg leading-relaxed text-foreground">
                      &ldquo;{testimonial.content}&rdquo;
                    </p>
                  </div>
                  <div className="mt-auto">
                    <p className="text-sm font-bold text-foreground">{testimonial.name}</p>
                    <p className="text-muted-foreground text-sm">{testimonial.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
