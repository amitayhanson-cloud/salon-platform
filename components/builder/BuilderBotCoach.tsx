"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getBuilderBotLines } from "./builderBotSpeech";

type BuilderBotCoachProps = {
  step: number;
  /** When true, show full text at once (e.g. user already saw this step’s typing animation). */
  instantSpeech?: boolean;
  /** Fires once when the typewriter has finished all lines (or at once if instantSpeech). */
  onSpeakingComplete?: () => void;
};

export function BuilderBotCoach(props: BuilderBotCoachProps) {
  return (
    <BuilderBotCoachInner
      key={`${props.step}-${props.instantSpeech ? 1 : 0}`}
      {...props}
    />
  );
}

function BuilderBotCoachInner({
  step,
  instantSpeech = false,
  onSpeakingComplete,
}: BuilderBotCoachProps) {
  const completedForStepRef = useRef<number | null>(null);
  const lines = useMemo(() => getBuilderBotLines(step), [step]);
  const [lineIndex, setLineIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [ready, setReady] = useState(instantSpeech);

  useEffect(() => {
    if (instantSpeech) return;
    const t = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(t);
  }, [instantSpeech]);

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
    <div className="mb-4 sm:mb-10" dir="rtl">
      <div
        className="rounded-xl border border-white/70 bg-white/45 px-3 py-2 shadow-[0_8px_32px_-12px_rgba(7,18,25,0.12)] backdrop-blur-md sm:rounded-2xl sm:px-5 sm:py-4"
        aria-live="polite"
        aria-atomic="true"
      >
        <p className="whitespace-pre-wrap text-right font-sans text-[13px] font-medium leading-snug text-[#071219] sm:text-[17px] sm:leading-[1.65]">
          {shown}
          {!instantSpeech && !isDone && (
            <span
              className="me-1 inline-block h-[1.05em] w-0.5 animate-pulse rounded-sm bg-[#4e979f] align-middle"
              style={{ verticalAlign: "-0.12em" }}
              aria-hidden
            />
          )}
        </p>
      </div>
    </div>
  );
}
