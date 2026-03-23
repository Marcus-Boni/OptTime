"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/utils";

interface DurationInputProps {
  value: number; // minutes
  onChange: (minutes: number) => void;
  disabled?: boolean;
}

/**
 * Smart duration input. Accepts:
 * - "2" → 120 min
 * - "2.5" → 150 min
 * - "2h30" → 150 min
 * - "150m" → 150 min
 * - "1:30" → 90 min
 * - "2h" → 120 min
 */
export function DurationInput({
  value,
  onChange,
  disabled,
}: DurationInputProps) {
  const [raw, setRaw] = useState(minutesToDisplay(value));
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only sync from parent if input is not focused
    if (document.activeElement !== inputRef.current) {
      setRaw(minutesToDisplay(value));
    }
  }, [value]);

  function handleBlur() {
    const parsed = parseInput(raw);
    if (parsed === null) {
      setError(true);
      setRaw(minutesToDisplay(value)); // revert
    } else {
      setError(false);
      setRaw(minutesToDisplay(parsed));
      if (parsed !== value) onChange(parsed);
    }
  }

  const parsedLive = parseInput(raw);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setError(false);
        }}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder="1:30"
        className={
          error ? "border-destructive focus-visible:ring-destructive" : ""
        }
      />
      {parsedLive !== null && !error && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground transition-opacity">
          {formatDuration(parsedLive)}
        </span>
      )}
    </div>
  );
}

function minutesToDisplay(minutes: number): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}:00` : `${h}:${m.toString().padStart(2, "0")}`;
}

function parseInput(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  // "1:30" or "01:30"
  const colonMatch = s.match(/^(\d{1,3}):(\d{2})$/);
  if (colonMatch) {
    const h = Number.parseInt(colonMatch[1], 10);
    const m = Number.parseInt(colonMatch[2], 10);
    if (m >= 60) return null;
    const total = h * 60 + m;
    return total >= 1 && total <= 1440 ? total : null;
  }

  // "2h30m" or "2h30" or "2h"
  const hMatch = s.match(/^(\d+)h(\d+)?m?$/i);
  if (hMatch) {
    const h = Number.parseInt(hMatch[1], 10);
    const m = Number.parseInt(hMatch[2] ?? "0", 10);
    const total = h * 60 + m;
    return total >= 1 && total <= 1440 ? total : null;
  }

  // "150m"
  const mMatch = s.match(/^(\d+)m$/i);
  if (mMatch) {
    const total = Number.parseInt(mMatch[1], 10);
    return total >= 1 && total <= 1440 ? total : null;
  }

  // "2.5" decimal hours
  const decimalMatch = s.match(/^(\d+(?:\.\d+)?)$/);
  if (decimalMatch) {
    const hours = Number.parseFloat(decimalMatch[1]);
    const total = Math.round(hours * 60);
    return total >= 1 && total <= 1440 ? total : null;
  }

  return null;
}
