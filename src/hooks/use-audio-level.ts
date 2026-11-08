"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioLevelSnapshot {
  /** Normalized overall voice level in [0, 1]. */
  level: number;
  /** Center-weighted per-bar vocal spectrum levels in [0, 1]. */
  spectrum: readonly number[];
  /** True while the microphone stream and Web Audio analyser are active. */
  isLive: boolean;
}

export type AudioLevelSubscriber = (snapshot: AudioLevelSnapshot) => void;

export interface UseAudioLevelOptions {
  /** Whether the analyser should capture microphone audio right now. */
  active: boolean;
  /** Number of bars to compute for visualizers. */
  bandCount?: number;
}

export interface AudioLevelController {
  /** True when Web Audio API + getUserMedia are actively reading the mic. */
  isLive: boolean;
  /** Subscribe to 60fps audio frames without triggering React re-renders. */
  subscribe: (listener: AudioLevelSubscriber) => () => void;
  /** Latest instantaneous level in [0, 1] for imperative reads. */
  getLevel: () => number;
  /** Latest per-bar vocal spectrum in [0, 1] for imperative 60fps loops. */
  getSpectrum: () => readonly number[];
}

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function resolveAudioContext(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as WebkitWindow).webkitAudioContext ??
    null
  );
}

/**
 * Captures real microphone amplitude and speech-band frequencies using the
 * Web Audio API (`AudioContext` + `AnalyserNode`) with automatic gain control
 * (AGC) and adaptive noise-floor gating so any microphone produces full,
 * zero-latency visual waveforms during normal speech.
 */
export function useAudioLevel({
  active,
  bandCount = 48,
}: UseAudioLevelOptions): AudioLevelController {
  const [isLive, setIsLive] = useState(false);
  const levelRef = useRef(0);
  const spectrumRef = useRef<number[]>(new Array<number>(bandCount).fill(0));
  const listenersRef = useRef<Set<AudioLevelSubscriber>>(new Set());

  const subscribe = useCallback((listener: AudioLevelSubscriber) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getLevel = useCallback(() => levelRef.current, []);
  const getSpectrum = useCallback(() => spectrumRef.current, []);

  useEffect(() => {
    if (!active) {
      levelRef.current = 0;
      spectrumRef.current = new Array<number>(bandCount).fill(0);
      setIsLive(false);
      return;
    }

    const AudioContextClass = resolveAudioContext();
    if (!AudioContextClass || !navigator.mediaDevices?.getUserMedia) {
      setIsLive(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let rafId = 0;

    async function acquireMicStream(): Promise<MediaStream> {
      try {
        // Disable browser WebRTC DSP (echoCancellation / noiseSuppression) on
        // this analyser-only stream so it has zero processing lag and never
        // gates sustained vocal formants.
        return await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch {
        return navigator.mediaDevices.getUserMedia({ audio: true });
      }
    }

    async function startAnalyser(): Promise<void> {
      try {
        stream = await acquireMicStream();

        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          return;
        }

        const ContextCtor = resolveAudioContext();
        if (!ContextCtor) return;

        audioContext = new ContextCtor();
        if (audioContext.state === "suspended") {
          await audioContext.resume().catch(() => undefined);
        }

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        // 1024 samples gives ~46Hz bin resolution at 48kHz while keeping the
        // time-domain window short (~21ms) for immediate syllable attack.
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.42;
        analyser.minDecibels = -88;
        analyser.maxDecibels = -22;
        source.connect(analyser);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const floatTimeData = new Float32Array(analyser.fftSize);
        const byteTimeData = new Uint8Array(analyser.fftSize);
        const spectrum = new Array<number>(bandCount).fill(0);
        spectrumRef.current = spectrum;

        // Vocal fundamental + formant range (~90Hz to ~2,400Hz -> bins 2..52).
        const startBin = 2;
        const vocalBins = Math.min(50, analyser.frequencyBinCount - startBin);

        // Adaptive noise floor & automatic gain peak tracker so both quiet
        // laptop mics and hot USB mics utilize the full [0, 1] visual range.
        let noiseFloor = 0.0025;
        let agcPeak = 0.026;
        let smoothedLevel = 0;

        setIsLive(true);

        const tick = (now: number) => {
          if (cancelled) return;

          analyser.getByteFrequencyData(freqData);

          let sumSquares = 0;
          let instantPeak = 0;

          if (typeof analyser.getFloatTimeDomainData === "function") {
            analyser.getFloatTimeDomainData(floatTimeData);
            for (let i = 0; i < floatTimeData.length; i++) {
              const sample = Math.abs(floatTimeData[i] ?? 0);
              sumSquares += sample * sample;
              if (sample > instantPeak) instantPeak = sample;
            }
          } else {
            analyser.getByteTimeDomainData(byteTimeData);
            for (let i = 0; i < byteTimeData.length; i++) {
              const sample = Math.abs(((byteTimeData[i] ?? 128) - 128) / 128);
              sumSquares += sample * sample;
              if (sample > instantPeak) instantPeak = sample;
            }
          }

          const rms = Math.sqrt(sumSquares / analyser.fftSize);
          // Blend RMS with crest peak so plosives and syllable onsets react in <16ms.
          const rawEnergy = Math.max(rms, instantPeak * 0.46);

          // Update adaptive noise floor.
          if (rawEnergy < noiseFloor * 1.35) {
            noiseFloor = noiseFloor * 0.94 + rawEnergy * 0.06;
          } else {
            noiseFloor = noiseFloor * 0.9985 + rawEnergy * 0.0015;
          }
          noiseFloor = Math.max(0.0006, Math.min(0.022, noiseFloor));

          const gateThreshold = noiseFloor * 1.42 + 0.001;
          const signalAboveNoise = Math.max(0, rawEnergy - gateThreshold);

          // Update automatic gain peak: fast expansion, gentle decay.
          if (signalAboveNoise > agcPeak) {
            agcPeak = agcPeak * 0.32 + signalAboveNoise * 0.68;
          } else {
            agcPeak = Math.max(0.018, agcPeak * 0.994);
          }

          const envelope =
            signalAboveNoise > 0
              ? Math.min(1, (signalAboveNoise / agcPeak) ** 0.65)
              : 0;

          // Snappy attack (65%), smooth syllable release (26%).
          const alpha = envelope > smoothedLevel ? 0.65 : 0.26;
          smoothedLevel += (envelope - smoothedLevel) * alpha;
          if (smoothedLevel < 0.005) smoothedLevel = 0;
          levelRef.current = smoothedLevel;

          // Build center-weighted vocal spectrum across `bandCount` bars.
          const half = Math.max(1, (bandCount - 1) / 2);
          for (let i = 0; i < bandCount; i++) {
            const centerDist = Math.abs((i - half) / half); // 0 at center, 1 at edges
            // Center bars map to fundamental/low formants; outer bars to upper harmonics.
            const binOffset = Math.floor(centerDist ** 1.15 * (vocalBins - 1));
            // Mirror left/right slightly offset by 1 bin so the wave looks organic, not rigidly cloned.
            const sideOffset = i < half ? 0 : 1;
            const binIndex = Math.min(
              analyser.frequencyBinCount - 1,
              startBin + binOffset + sideOffset,
            );

            const rawBin = (freqData[binIndex] ?? 0) / 255;
            const shapedBin = Math.min(1, rawBin ** 0.72 * 1.35);

            // Bell-curve spatial envelope so center bars reach full height and edges taper.
            const spatialWindow = Math.cos(centerDist * Math.PI * 0.44) ** 1.05;

            // Subtle traveling harmonic ripple while voice is active.
            const ripple =
              smoothedLevel > 0.04
                ? 0.88 +
                  0.26 *
                    Math.sin(now * 0.019 - centerDist * 5.2 + (i % 3) * 0.9)
                : 1;

            const harmonicVar =
              0.74 +
              0.26 *
                Math.abs(
                  Math.sin(now * 0.022 + i * 0.85) *
                    Math.cos(now * 0.015 - centerDist * 4.5),
                );
            const voiceDrive = Math.max(
              smoothedLevel * harmonicVar,
              smoothedLevel * 0.58 + shapedBin * 0.55,
            );

            const combined = Math.min(
              1,
              voiceDrive * spatialWindow * ripple * 1.15,
            );

            const prevBar = spectrum[i] ?? 0;
            const barAlpha = combined > prevBar ? 0.72 : 0.28;
            spectrum[i] = Math.min(
              1,
              Math.max(0, prevBar + (combined - prevBar) * barAlpha),
            );
          }

          if (listenersRef.current.size > 0) {
            const snapshot: AudioLevelSnapshot = {
              level: smoothedLevel,
              spectrum,
              isLive: true,
            };
            for (const listener of listenersRef.current) {
              listener(snapshot);
            }
          }

          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      } catch (error: unknown) {
        console.error("[useAudioLevel] startAnalyser:", error);
        if (!cancelled) {
          levelRef.current = 0;
          setIsLive(false);
        }
      }
    }

    void startAnalyser();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      levelRef.current = 0;
      setIsLive(false);

      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch(() => undefined);
      }
    };
  }, [active, bandCount]);

  return {
    isLive,
    subscribe,
    getLevel,
    getSpectrum,
  };
}
