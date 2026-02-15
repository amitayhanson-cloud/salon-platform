"use client";

import { snapTo15 } from "@/lib/snapTo15";

export interface MinutesNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  /** Optional: custom clamp applied before snap (e.g. ensure >= 1 for duration). */
  ariaLabel?: string;
}

/**
 * Number input for minute/duration fields. Step is 15; value is always snapped to 0,15,30,45,60...
 * - onChange: parse, snap to 15, then call onChange(snapped).
 * - onBlur: snap current value to 15-grid and commit if changed (fixes off-grid values from DB).
 */
export default function MinutesNumberInput({
  value,
  onChange,
  min,
  max,
  disabled = false,
  id,
  className,
  placeholder,
  ariaLabel,
}: MinutesNumberInputProps) {
  const opts = { min, max };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value === "" ? NaN : parseInt(e.target.value, 10);
    const snapped = snapTo15(Number.isFinite(raw) ? raw : 0, opts);
    onChange(snapped);
  };

  const handleBlur = () => {
    const snapped = snapTo15(value, opts);
    if (snapped !== value) onChange(snapped);
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      step={15}
      min={min}
      max={max}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      id={id}
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}
