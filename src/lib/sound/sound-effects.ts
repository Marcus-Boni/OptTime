"use client";

/**
 * Web Audio API earcon synthesizer.
 *
 * Provides subtle, procedural audio cues (Linear/macOS style) with zero external assets.
 * Respects user preferences and handles browser autoplay policies gracefully.
 */

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  try {
    if (!sharedAudioContext || sharedAudioContext.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      sharedAudioContext = new AudioCtx();
    }

    if (sharedAudioContext.state === "suspended") {
      void sharedAudioContext.resume().catch(() => undefined);
    }

    return sharedAudioContext;
  } catch (error: unknown) {
    console.error("[sound-effects] Failed to initialize AudioContext:", error);
    return null;
  }
}

/** Check if global sound effects are enabled in user preferences */
export function isAudioFeedbackEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const pref = window.localStorage.getItem("optsolv:audio-feedback");
  return pref !== "disabled";
}

/** Set global sound effects preference */
export function setAudioFeedbackEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    "optsolv:audio-feedback",
    enabled ? "enabled" : "disabled",
  );
}

/**
 * Play an earcon by type.
 */
export type EarconType =
  | "timer_start"
  | "timer_stop"
  | "action_success"
  | "voice_start"
  | "voice_end"
  | "undo"
  | "phase_complete";

export function playEarcon(type: EarconType): void {
  if (!isAudioFeedbackEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime + 0.01;

    switch (type) {
      case "timer_start": {
        // Ascending bright double-ping (520Hz -> 780Hz)
        playPing(ctx, 523.25, now, 0.12, 0.14); // C5
        playPing(ctx, 783.99, now + 0.09, 0.16, 0.18); // G5
        break;
      }
      case "timer_stop": {
        // Soft descending tone (659Hz -> 440Hz)
        playPing(ctx, 659.25, now, 0.12, 0.14); // E5
        playPing(ctx, 440.0, now + 0.09, 0.18, 0.16); // A4
        break;
      }
      case "action_success": {
        // Crisp, satisfying subtle confirmation chime (880Hz -> 1320Hz)
        playPing(ctx, 880.0, now, 0.08, 0.12);
        playPing(ctx, 1318.51, now + 0.06, 0.14, 0.15);
        break;
      }
      case "voice_start": {
        // Warm radar wake tone (440Hz -> 660Hz -> 880Hz arpeggio)
        playPing(ctx, 440.0, now, 0.08, 0.12);
        playPing(ctx, 659.25, now + 0.06, 0.08, 0.14);
        playPing(ctx, 880.0, now + 0.12, 0.14, 0.16);
        break;
      }
      case "voice_end": {
        // Soft acknowledgement blip (660Hz)
        playPing(ctx, 659.25, now, 0.1, 0.14);
        break;
      }
      case "undo": {
        // Subtle descending reverse swoosh (600Hz -> 350Hz)
        playSweep(ctx, 600, 350, now, 0.18, 0.12);
        break;
      }
      case "phase_complete": {
        // Gentle peaceful chord (F5 + A5 + C6)
        playPing(ctx, 698.46, now, 0.35, 0.12);
        playPing(ctx, 880.0, now + 0.04, 0.4, 0.14);
        playPing(ctx, 1046.5, now + 0.08, 0.5, 0.16);
        break;
      }
    }
  } catch (error: unknown) {
    console.error("[sound-effects] Error playing earcon:", error);
  }
}

function playPing(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  gainLevel: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(gainLevel * 0.45, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);

  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // Ignore disconnect error
    }
  };
}

function playSweep(
  ctx: AudioContext,
  startFreq: number,
  endFreq: number,
  startTime: number,
  duration: number,
  gainLevel: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(gainLevel * 0.4, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);

  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // Ignore disconnect error
    }
  };
}
