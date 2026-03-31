"use client"

import { motion } from "framer-motion"

interface AnimatedTextProps {
  text: string
  delay?: number
}

export function AnimatedText({ text, delay = 0 }: AnimatedTextProps) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  let charIndex = 0

  return (
    <motion.span
      className="font-bold text-center text-inherit leading-[1.28] tracking-tighter font-hero text-black md:leading-[1.3] lg:leading-[1.34]"
      initial="hidden"
      animate="visible"
      style={{ perspective: 400, display: "block" }}
    >
      {lines.map((line, lineIndex) => {
        const words = line.split(/\s+/).filter(Boolean)
        return (
          <span key={lineIndex} className="block text-center whitespace-nowrap">
            {words.map((word, wordIndex) => (
              <span key={wordIndex} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
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
            ))}
          </span>
        )
      })}
    </motion.span>
  )
}
