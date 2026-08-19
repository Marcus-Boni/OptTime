"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AMBIENT_SOUNDS } from "@/lib/focus/constants";
import type { AmbientSoundId } from "@/lib/focus/types";
import { cn } from "@/lib/utils";

export interface AmbientSoundControlProps {
  soundId: AmbientSoundId;
  /** Volume in the 0–1 range. */
  volume: number;
  /** True while a break is ducking the level, so the UI can say so. */
  isDucked: boolean;
  onSoundChange: (id: AmbientSoundId) => void;
  onVolumeChange: (volume: number) => void;
}

/** Three bars that dance while a soundscape plays. */
/** Each bar has its own peak and period, which double as its identity. */
const WAVE_BARS = [
  { peak: 0.45, duration: 1.1 },
  { peak: 1, duration: 1.35 },
  { peak: 0.65, duration: 1.6 },
] as const;

function SoundWave({ active }: { active: boolean }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <span aria-hidden className="flex h-3 items-end gap-[2px]">
      {WAVE_BARS.map((bar) => (
        <motion.span
          key={`wave-bar-${bar.peak}`}
          className={cn(
            "w-[2px] rounded-full",
            active ? "bg-brand-400" : "bg-muted-foreground/40",
          )}
          initial={false}
          animate={
            active && !prefersReducedMotion
              ? { height: [4, 12 * bar.peak, 4] }
              : { height: active ? 12 * bar.peak : 4 }
          }
          transition={
            active && !prefersReducedMotion
              ? {
                  duration: bar.duration,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }
              : { duration: 0.2 }
          }
        />
      ))}
    </span>
  );
}

/**
 * Soundscape picker plus level control for the Focus Mode ambient bed.
 * All soundscapes are synthesised in the browser — nothing is downloaded.
 */
export function AmbientSoundControl({
  soundId,
  volume,
  isDucked,
  onSoundChange,
  onVolumeChange,
}: AmbientSoundControlProps) {
  const isMuted = soundId === "none" || volume === 0;
  const VolumeIcon = isMuted ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const percent = Math.round(volume * 100);

  function handleToggleMute() {
    if (soundId === "none") {
      onSoundChange("brown");
      if (volume === 0) onVolumeChange(0.35);
      return;
    }

    onVolumeChange(volume === 0 ? 0.35 : 0);
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {AMBIENT_SOUNDS.map((option) => {
          const isActive = option.id === soundId;

          return (
            <Tooltip key={option.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSoundChange(option.id)}
                  aria-pressed={isActive}
                  className={cn(
                    "relative flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                    isActive
                      ? "text-brand-300"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="ambient-sound-pill"
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-brand-500/40 bg-brand-500/10"
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 32,
                      }}
                    />
                  )}
                  <span className="relative">{option.label}</span>
                  {/* Only the playing chip gets bars — idle ones read as noise. */}
                  {isActive && option.id !== "none" && (
                    <span className="relative">
                      <SoundWave active={!isMuted} />
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{option.description}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={
                isMuted ? "Ativar som ambiente" : "Silenciar som ambiente"
              }
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
            >
              <VolumeIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isMuted ? "Ativar som (M)" : "Silenciar (M)"}
          </TooltipContent>
        </Tooltip>

        <Slider
          // Silence reads as an empty level rather than a dimmed 35% fill.
          value={[soundId === "none" ? 0 : percent]}
          min={0}
          max={100}
          step={1}
          disabled={soundId === "none"}
          onValueChange={(next) => {
            const [value] = next;
            if (value !== undefined) onVolumeChange(value / 100);
          }}
          aria-label="Volume do som ambiente"
          className="flex-1"
        />

        <span className="w-14 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
          {soundId === "none" ? "—" : `${percent}%`}
        </span>
      </div>

      {isDucked && soundId !== "none" && (
        <p className="text-center text-[11px] text-muted-foreground">
          Volume reduzido automaticamente durante a pausa
        </p>
      )}
    </div>
  );
}
