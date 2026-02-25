"use client";

import { ChevronUp, ChevronDown } from "lucide-react";
import { snapTo15 } from "@/lib/snapTo15";

const STEP = 15;

export interface DurationMinutesStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Optional class for the input part only */
  inputClassName?: string;
  "aria-label"?: string;
}

/**
 * Duration (minutes) input: read-only display + up/down stepper only.
 * Step 15, min 0 (or prop). Values always multiples of 15.
 * No typing or paste — stepper buttons only.
 */
export default function DurationMinutesStepper({
  value,
  onChange,
  min = 0,
  max,
  disabled = false,
  id,
  className,
  inputClassName,
  "aria-label": ariaLabel,
}: DurationMinutesStepperProps) {
  const opts = { min, max };
  const snapped = snapTo15(value, opts);
  const displayValue = value !== snapped ? snapped : value;

  const handleStep = (delta: number) => {
    if (disabled) return;
    const next = snapTo15(displayValue + delta, opts);
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      handleStep(STEP);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      handleStep(-STEP);
      return;
    }
    e.preventDefault();
  };

  return (
    <div
      className={`inline-flex items-stretch rounded-lg border border-slate-300 bg-white overflow-hidden ${className ?? ""}`}
    >
      <input
        type="text"
        inputMode="none"
        readOnly
        value={displayValue}
        id={id}
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        onPaste={(e) => e.preventDefault()}
        className={`min-w-[3rem] flex-1 text-right px-2 py-2 border-0 bg-transparent text-slate-900 focus:outline-none focus:ring-0 ${inputClassName ?? ""}`}
        tabIndex={0}
      />
      <div className="flex flex-col border-r border-slate-200">
        <button
          type="button"
          disabled={disabled || (max != null && displayValue >= max)}
          onClick={() => handleStep(STEP)}
          className="flex items-center justify-center p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:pointer-events-none border-b border-slate-200"
          aria-label="הגדל ב-15 דקות"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={disabled || displayValue <= min}
          onClick={() => handleStep(-STEP)}
          className="flex items-center justify-center p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="הקטן ב-15 דקות"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
