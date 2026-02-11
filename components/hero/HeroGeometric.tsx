"use client";

import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import type { Variants } from "framer-motion";
import { Circle } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";


function ElegantShape({
    className,
    delay = 0,
    width = 400,
    height = 100,
    rotate = 0,
    gradient = "from-white/[0.08]",
    lightTheme = false,
}: {
    className?: string;
    delay?: number;
    width?: number;
    height?: number;
    rotate?: number;
    gradient?: string;
    lightTheme?: boolean;
}) {
    return (
        <motion.div
            initial={{
                opacity: 0,
                y: -150,
                rotate: rotate - 15,
            }}
            animate={{
                opacity: 1,
                y: 0,
                rotate: rotate,
            }}
            transition={{
                duration: 2.4,
                delay,
                ease: [0.23, 0.86, 0.39, 0.96],
                opacity: { duration: 1.2 },
            }}
            className={cn("absolute", className)}
        >
            <motion.div
                animate={{
                    y: [0, 15, 0],
                }}
                transition={{
                    duration: 12,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                }}
                style={{
                    width,
                    height,
                }}
                className="relative"
            >
                <div
                    className={cn(
                        "absolute inset-0 rounded-full",
                        "bg-gradient-to-r to-transparent",
                        gradient,
                        "backdrop-blur-[2px]",
                        lightTheme
                            ? "border border-[#E2EEF2]/70 shadow-[0_8px_32px_0_rgba(46,196,198,0.06)] after:absolute after:inset-0 after:rounded-full after:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.35),transparent_70%)]"
                            : "border-2 border-white/[0.15] shadow-[0_8px_32px_0_rgba(255,255,255,0.1)] after:absolute after:inset-0 after:rounded-full after:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.2),transparent_70%)]"
                    )}
                />
            </motion.div>
        </motion.div>
    );
}

function HeroGeometric({
    badge = "Design Collective",
    title1 = "Elevate Your Digital Vision",
    title2 = "Crafting Exceptional Websites",
    backgroundOnly = false,
    fixed = false,
}: {
    badge?: string;
    title1?: string;
    title2?: string;
    /** When true, only render the background shapes (no text). For use behind existing hero content. */
    backgroundOnly?: boolean;
    /** When true (with backgroundOnly), use fixed positioning to cover viewport as full-page background. */
    fixed?: boolean;
}) {
    const fadeUpVariants: Variants = {
        hidden: { opacity: 0, y: 30 },
        visible: (i: number) => ({
            opacity: 1,
            y: 0,
            transition: {
                duration: 1,
                delay: 0.5 + i * 0.2,
                ease: [0.25, 0.4, 0.25, 1] as const,
            },
        }),
    };

    const isCalenoLight = backgroundOnly;
    const wrapperClass = backgroundOnly
        ? fixed
            ? "fixed inset-0 z-[-1] pointer-events-none overflow-hidden"
            : "absolute inset-0 pointer-events-none overflow-hidden"
        : "relative min-h-screen flex items-center justify-center overflow-hidden";

    return (
        <div
            className={cn(
                "w-full",
                wrapperClass,
                isCalenoLight ? "bg-gradient-to-b from-[#F7FBFC] to-[#EEF7F9]" : "bg-[#030303]"
            )}
        >
            <div
                className={cn(
                    "absolute inset-0 blur-3xl",
                    isCalenoLight
                        ? "bg-gradient-to-br from-[#2EC4C6]/[0.18] via-transparent to-[#A7E6E7]/[0.18]"
                        : "bg-gradient-to-br from-indigo-500/[0.05] via-transparent to-rose-500/[0.05]"
                )}
            />

            <div className="absolute inset-0 overflow-hidden">
                <ElegantShape
                    lightTheme={isCalenoLight}
                    delay={0.3}
                    width={600}
                    height={140}
                    rotate={12}
                    gradient={isCalenoLight ? "from-[#2EC4C6]/[0.36]" : "from-indigo-500/[0.15]"}
                    className="left-[-10%] md:left-[-5%] top-[15%] md:top-[20%]"
                />
                <ElegantShape
                    lightTheme={isCalenoLight}
                    delay={0.5}
                    width={500}
                    height={120}
                    rotate={-15}
                    gradient={isCalenoLight ? "from-[#A7E6E7]/[0.38]" : "from-rose-500/[0.15]"}
                    className="right-[-5%] md:right-[0%] top-[70%] md:top-[75%]"
                />
                <ElegantShape
                    lightTheme={isCalenoLight}
                    delay={0.4}
                    width={300}
                    height={80}
                    rotate={-8}
                    gradient={isCalenoLight ? "from-[#22A6A8]/[0.32]" : "from-violet-500/[0.15]"}
                    className="left-[5%] md:left-[10%] bottom-[5%] md:bottom-[10%]"
                />
                <ElegantShape
                    lightTheme={isCalenoLight}
                    delay={0.6}
                    width={200}
                    height={60}
                    rotate={20}
                    gradient={isCalenoLight ? "from-[#A7E6E7]/[0.34]" : "from-amber-500/[0.15]"}
                    className="right-[15%] md:right-[20%] top-[10%] md:top-[15%]"
                />
                <ElegantShape
                    lightTheme={isCalenoLight}
                    delay={0.7}
                    width={150}
                    height={40}
                    rotate={-25}
                    gradient={isCalenoLight ? "from-[#2EC4C6]/[0.30]" : "from-cyan-500/[0.15]"}
                    className="left-[20%] md:left-[25%] top-[5%] md:top-[10%]"
                />
            </div>

            {!backgroundOnly && (
                <div className="relative z-10 container mx-auto px-4 md:px-6">
                    <div className="max-w-3xl mx-auto text-center">
                        <motion.div
                            custom={0}
                            variants={fadeUpVariants}
                            initial="hidden"
                            animate="visible"
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] mb-8 md:mb-12"
                        >
                            <Circle className="h-2 w-2 fill-rose-500/80" />
                            <span className="text-sm text-white/60 tracking-wide">
                                {badge}
                            </span>
                        </motion.div>

                        <motion.div
                            custom={1}
                            variants={fadeUpVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            <h1 className="text-4xl sm:text-6xl md:text-8xl font-bold mb-6 md:mb-8 tracking-tight">
                                <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-white/80">
                                    {title1}
                                </span>
                                <br />
                                <span
                                    className={cn(
                                        "bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-white/90 to-rose-300 "
                                    )}
                                >
                                    {title2}
                                </span>
                            </h1>
                        </motion.div>

                        <motion.div
                            custom={2}
                            variants={fadeUpVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            <p className="text-base sm:text-lg md:text-xl text-white/40 mb-8 leading-relaxed font-light tracking-wide max-w-xl mx-auto px-4">
                                Crafting exceptional digital experiences through
                                innovative design and cutting-edge technology.
                            </p>
                        </motion.div>
                    </div>
                </div>
            )}

            {isCalenoLight ? (
                <div className="absolute inset-0 bg-gradient-to-b from-[#F7FBFC]/50 via-transparent to-[#EEF7F9]/40 pointer-events-none" />
            ) : (
                <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-transparent to-[#030303]/80 pointer-events-none" />
            )}
        </div>
    );
}

export { HeroGeometric }
