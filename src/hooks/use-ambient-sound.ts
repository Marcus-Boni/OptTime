"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  CHIME_TONES,
  createSoundscapeBuffer,
  createSoundscapeFilters,
} from "@/lib/focus/noise";
import type { AmbientSoundId, ChimeKind } from "@/lib/focus/types";

/** Crossfade length when switching soundscapes or muting. */
const FADE_SECONDS = 0.7;

/** Ceiling applied to the user's 0–1 volume, so full blast is still pleasant. */
const MASTER_CEILING = 0.55;

interface Voice {
  id: Exclude<AmbientSoundId, "none">;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export interface AmbientSoundController {
  /**
   * Play a soundscape, crossfading from whatever is playing.
   * Must be reached from a user gesture the first time, per autoplay policy.
   */
  play: (id: AmbientSoundId, volume: number) => void;
  /** Fade everything out and release the audio graph. */
  stop: () => void;
  /** Retarget the level without restarting the bed. */
  setVolume: (volume: number) => void;
  /** Play a transition bell. Safe to call when no bed is playing. */
  playChime: (kind: ChimeKind) => void;
}

/**
 * Owns the Web Audio graph for the Focus Mode ambient bed.
 *
 * The graph is created lazily on the first `play` (browsers reject an
 * AudioContext created outside a user gesture) and torn down on unmount.
 * Buffers are generated once per soundscape and cached for the session.
 */
export function useAmbientSound(): AmbientSoundController {
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const voiceRef = useRef<Voice | null>(null);
  const buffersRef = useRef(
    new Map<Exclude<AmbientSoundId, "none">, AudioBuffer>(),
  );
  const volumeRef = useRef(0);
  const isUnmountedRef = useRef(false);

  /** Create (or reuse) the context and master gain. Returns null if unsupported. */
  const ensureContext = useCallback((): AudioContext | null => {
    if (isUnmountedRef.current) return null;
    if (contextRef.current) return contextRef.current;

    try {
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);

      contextRef.current = context;
      masterRef.current = master;
      return context;
    } catch (error: unknown) {
      console.error("[useAmbientSound] create AudioContext:", error);
      return null;
    }
  }, []);

  const getBuffer = useCallback(
    (
      context: AudioContext,
      id: Exclude<AmbientSoundId, "none">,
    ): AudioBuffer => {
      const cached = buffersRef.current.get(id);
      if (cached) return cached;

      const buffer = createSoundscapeBuffer(context, id);
      buffersRef.current.set(id, buffer);
      return buffer;
    },
    [],
  );

  /** Fade a voice out and dispose of it once silent. */
  const retireVoice = useCallback((voice: Voice, context: AudioContext) => {
    const now = context.currentTime;

    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
      voice.source.stop(now + FADE_SECONDS + 0.05);
    } catch (error: unknown) {
      console.error("[useAmbientSound] retireVoice:", error);
    }

    voice.source.onended = () => {
      try {
        voice.source.disconnect();
        voice.gain.disconnect();
      } catch {
        // The node may already be detached — nothing to clean up.
      }
    };
  }, []);

  const setVolume = useCallback((volume: number) => {
    volumeRef.current = Math.min(1, Math.max(0, volume));

    const context = contextRef.current;
    const master = masterRef.current;
    if (!context || !master) return;

    const target = voiceRef.current ? volumeRef.current * MASTER_CEILING : 0;
    const now = context.currentTime;

    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(target, now + 0.25);
  }, []);

  const stop = useCallback(() => {
    const context = contextRef.current;
    const master = masterRef.current;
    if (!context || !master) return;

    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);

    const voice = voiceRef.current;
    voiceRef.current = null;
    if (voice) retireVoice(voice, context);
  }, [retireVoice]);

  const play = useCallback(
    (id: AmbientSoundId, volume: number) => {
      volumeRef.current = Math.min(1, Math.max(0, volume));

      if (id === "none") {
        stop();
        return;
      }

      const context = ensureContext();
      const master = masterRef.current;
      if (!context || !master) return;

      // A context created before the gesture completed can start suspended.
      if (context.state === "suspended") {
        void context.resume().catch((error: unknown) => {
          console.error("[useAmbientSound] resume context:", error);
        });
      }

      const current = voiceRef.current;
      if (current?.id === id) {
        setVolume(volumeRef.current);
        return;
      }

      if (current) {
        voiceRef.current = null;
        retireVoice(current, context);
      }

      try {
        const source = context.createBufferSource();
        source.buffer = getBuffer(context, id);
        source.loop = true;

        const gain = context.createGain();
        gain.gain.value = 0;

        const filters = createSoundscapeFilters(context, id);
        if (filters) {
          source.connect(filters.head);
          filters.tail.connect(gain);
        } else {
          source.connect(gain);
        }
        gain.connect(master);

        const now = context.currentTime;
        source.start(now);
        gain.gain.linearRampToValueAtTime(1, now + FADE_SECONDS);

        voiceRef.current = { id, source, gain };
        setVolume(volumeRef.current);
      } catch (error: unknown) {
        console.error("[useAmbientSound] play:", error);
      }
    },
    [ensureContext, getBuffer, retireVoice, setVolume, stop],
  );

  const playChime = useCallback(
    (kind: ChimeKind) => {
      const tones = CHIME_TONES[kind];
      if (!tones) return;

      const context = ensureContext();
      if (!context) return;

      if (context.state === "suspended") {
        void context.resume().catch(() => {
          // Without a prior gesture the chime is simply skipped.
        });
      }

      try {
        const start = context.currentTime + 0.02;

        for (const tone of tones) {
          const at = start + tone.offset;

          // Sine fundamental plus a quiet octave gives the bell some body
          // without needing a sample.
          for (const [ratio, level] of [
            [1, 1],
            [2, 0.28],
          ] as const) {
            const oscillator = context.createOscillator();
            oscillator.type = "sine";
            oscillator.frequency.value = tone.frequency * ratio;

            const gain = context.createGain();
            const peak = tone.gain * level * 0.5;

            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
            gain.gain.exponentialRampToValueAtTime(
              0.0001,
              at + tone.duration * (ratio === 1 ? 1 : 0.7),
            );

            oscillator.connect(gain);
            // Chimes bypass the master bed gain so they stay audible when the
            // ambient level is low or muted.
            gain.connect(context.destination);

            oscillator.start(at);
            oscillator.stop(at + tone.duration + 0.1);
            oscillator.onended = () => {
              try {
                oscillator.disconnect();
                gain.disconnect();
              } catch {
                // Already detached.
              }
            };
          }
        }
      } catch (error: unknown) {
        console.error("[useAmbientSound] playChime:", error);
      }
    },
    [ensureContext],
  );

  // Release the audio hardware when the owner unmounts.
  useEffect(() => {
    isUnmountedRef.current = false;

    return () => {
      isUnmountedRef.current = true;

      const context = contextRef.current;
      const voice = voiceRef.current;

      voiceRef.current = null;
      contextRef.current = null;
      masterRef.current = null;
      buffersRef.current.clear();

      if (voice) {
        try {
          voice.source.stop();
          voice.source.disconnect();
          voice.gain.disconnect();
        } catch {
          // Already stopped.
        }
      }

      if (context && context.state !== "closed") {
        void context.close().catch(() => {
          // Closing twice is harmless.
        });
      }
    };
  }, []);

  // Stable identity: callers keep this controller in effect dependency arrays.
  return useMemo(
    () => ({ play, stop, setVolume, playChime }),
    [play, stop, setVolume, playChime],
  );
}
