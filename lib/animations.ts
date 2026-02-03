/**
 * Reusable viewport-triggered entrance animations for section columns.
 * RTL-correct: columns slide inward toward the center.
 * Fade in + horizontal slide, play once, no scale/bounce/overshoot.
 * Use with framer-motion: <motion.div {...slideInFromLeft}>...</motion.div>
 */

/** Left-side column (e.g. image in RTL) — slides in from the left. */
export const slideInFromLeft = {
  initial: { opacity: 0, x: -50 },
  whileInView: { opacity: 1, x: 0 },
  viewport: { once: true },
  transition: { duration: 0.8, ease: "easeOut" as const },
} as const;

/** Right-side column (e.g. text in RTL) — slides in from the right. */
export const slideInFromRight = {
  initial: { opacity: 0, x: 50 },
  whileInView: { opacity: 1, x: 0 },
  viewport: { once: true },
  transition: { duration: 0.8, ease: "easeOut" as const },
} as const;

// --- Services section (fade + vertical slide, stagger) ---

/** Container for staggered service cards. Use initial="hidden" and whileInView="show" with viewport={{ once: true }}. */
export const servicesContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
    },
  },
} as const;

/** Single service card entrance. Use as variants on a motion child of servicesContainer. */
export const serviceItem = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
} as const;

/** Section title (e.g. Services heading) — fade in + slide up slightly. */
export const servicesTitle = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
} as const;
