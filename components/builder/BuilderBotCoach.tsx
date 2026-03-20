"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { getBuilderBotLines } from "./builderBotSpeech";

const BOT_IMAGE_SRC = "/brand/caleno logo/Untitled design (1).png";

export function BuilderBotCoach({
  step,
  instantSpeech = false,
  onSpeakingComplete,
}: {
  step: number;
  /** When true, show full text at once (e.g. user already saw this step’s typing animation). */
  instantSpeech?: boolean;
  /** Fires once per step when the typewriter has finished all lines (or at once if instantSpeech). */
  onSpeakingComplete?: () => void;
}) {
  const completedForStepRef = useRef<number | null>(null);
  const lines = useMemo(() => getBuilderBotLines(step), [step]);
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    completedForStepRef.current = null;
    setLineIndex(0);
    setCharIndex(0);
    if (instantSpeech) {
      setReady(true);
      return;
    }
    setReady(false);
    const t = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(t);
  }, [step, instantSpeech]);

  useEffect(() => {
    if (instantSpeech || !ready || lines.length === 0) return;
    const text = lines[lineIndex];
    if (text === undefined) return;

    if (charIndex < text.length) {
      const char = text.charAt(charIndex);
      const delay =
        char === "\n"
          ? 340
          : /[.!?]/.test(char)
            ? 95
            : /[\s,]/.test(char)
              ? 22
              : 36;
      const id = window.setTimeout(() => setCharIndex((c) => c + 1), delay);
      return () => window.clearTimeout(id);
    }

    if (lineIndex < lines.length - 1) {
      const id = window.setTimeout(() => {
        setLineIndex((i) => i + 1);
        setCharIndex(0);
      }, 540);
      return () => window.clearTimeout(id);
    }
  }, [instantSpeech, ready, lines, lineIndex, charIndex]);

  const cur = lines[lineIndex] ?? "";
  const shown = instantSpeech
    ? lines.join("\n\n")
    : lines.slice(0, lineIndex).join("\n\n") +
      (lineIndex > 0 && cur ? "\n\n" : "") +
      cur.slice(0, charIndex);

  const lastLine = lines[lines.length - 1] ?? "";
  const isDone = instantSpeech
    ? lines.length > 0
    : lines.length > 0 &&
      lineIndex === lines.length - 1 &&
      charIndex >= lastLine.length;

  // Require `ready` (typed mode) so we never fire complete on stale isDone from the previous step.
  useEffect(() => {
    if (lines.length === 0) return;
    if (instantSpeech) {
      if (completedForStepRef.current === step) return;
      completedForStepRef.current = step;
      onSpeakingComplete?.();
      return;
    }
    if (!ready || !isDone) return;
    if (completedForStepRef.current === step) return;
    completedForStepRef.current = step;
    onSpeakingComplete?.();
  }, [instantSpeech, ready, isDone, step, lines.length, onSpeakingComplete]);

  return (
    <div className="mb-8 flex flex-row items-start gap-3 sm:mb-10 sm:gap-4" dir="rtl">
      <div className="caleno-builder-bot-float relative h-[84px] w-[84px] shrink-0 sm:h-[100px] sm:w-[100px]">
        <Image
          src={BOT_IMAGE_SRC}
          alt="בוט Caleno"
          fill
          className="object-contain drop-shadow-[0_6px_16px_rgba(30,111,124,0.2)]"
          sizes="100px"
          priority={step === 1}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="rounded-2xl rounded-tr-md border border-caleno-200/90 bg-gradient-to-br from-caleno-50 via-white to-caleno-50/40 px-4 py-3.5 shadow-[0_4px_20px_-8px_rgba(30,111,124,0.18)] sm:px-5 sm:py-4"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="whitespace-pre-wrap text-right text-[15px] font-medium leading-[1.65] text-caleno-ink sm:text-[17px]">
            {shown}
            {!instantSpeech && !isDone && (
              <span
                className="mr-1 inline-block h-[1.05em] w-0.5 animate-pulse rounded-sm bg-caleno-deep align-middle"
                style={{ verticalAlign: "-0.12em" }}
                aria-hidden
              />
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
