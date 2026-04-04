"use client"

import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

interface AnimatedTextProps {
  text: string
  delay?: number
  /** One class string per line (after splitting on `\\n`). */
  lineClassNames?: string[]
  /** Applied to the first word of the first line only (e.g. brand colour). */
  firstWordClassName?: string
  /** Use `ltr` so Latin brand names render correctly inside RTL headings. */
  firstWordDir?: "ltr" | "rtl"
}

export function AnimatedText({
  text,
  delay = 0,
  lineClassNames,
  firstWordClassName,
  firstWordDir,
}: AnimatedTextProps) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  let charIndex = 0

  return (
    <motion.span
      className={cn(
        "font-hero text-center text-[1em] font-bold leading-[1.28] tracking-tighter md:leading-[1.3] lg:leading-[1.34]",
        lineClassNames?.length ? null : "text-inherit",
      )}
      initial="hidden"
      animate="visible"
      style={{ perspective: 400, display: "block" }}
    >
      {lines.map((line, lineIndex) => {
        const words = line.split(/\s+/).filter(Boolean)
        return (
          <span
            key={lineIndex}
            className={cn(
              "block text-center text-[1em] whitespace-nowrap",
              lineClassNames?.[lineIndex],
              !lineClassNames?.[lineIndex] && "text-inherit",
            )}
          >
            {words.map((word, wordIndex) => {
              const isFirstWord = lineIndex === 0 && wordIndex === 0
              return (
              <span
                key={wordIndex}
                dir={isFirstWord && firstWordDir ? firstWordDir : undefined}
                className={isFirstWord && firstWordClassName ? firstWordClassName : undefined}
                style={{ display: "inline-block", whiteSpace: "nowrap" }}
              >
                {word.split("").map((char, index) => {
                  const currentIndex = charIndex++
                  return (
                    <motion.span
                      key={`${lineIndex}-${wordIndex}-${index}`}
                      initial={{ opacity: 0, y: 30, filter: "blur(12px)", rotateX: -45 }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)", rotateX: 0 }}
                      transition={{
                        duration: 0.6,
                        delay: delay + currentIndex * 0.04,
                        ease: [0.25, 0.46, 0.45, 0.94],
                      }}
                      style={{
                        display: "inline-block",
                        transformStyle: "preserve-3d",
                        transformOrigin: "center bottom",
                      }}
                    >
                      {char}
                    </motion.span>
                  )
                })}
                {wordIndex < words.length - 1 && "\u00A0"}
              </span>
              )
            })}
          </span>
        )
      })}
    </motion.span>
  )
}
