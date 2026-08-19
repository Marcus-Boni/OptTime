/**
 * Procedural noise generation for the Focus Mode ambient bed.
 *
 * Everything here is synthesised in the browser with the Web Audio API — the
 * app ships no audio files. A few seconds of noise are rendered into an
 * `AudioBuffer` once, then looped forever, which costs a single short burst of
 * CPU instead of a network download.
 */

import type { AmbientSoundId } from "@/lib/focus/types";

/** Loop body length. Long enough that the repeat is inaudible. */
const BUFFER_SECONDS = 8;

/** Crossfade applied across the loop seam to remove the click. */
const SEAM_FADE_SECONDS = 0.35;

/** Per-soundscape filtering applied on top of the raw noise buffer. */
interface FilterSpec {
  type: BiquadFilterType;
  frequency: number;
  Q?: number;
  gain?: number;
}

interface SoundscapeSpec {
  /** Which noise colour feeds the filter chain. */
  noise: "white" | "pink" | "brown";
  /** Filters applied in order, source → … → gain. */
  filters: FilterSpec[];
  /** Perceptual level trim so every soundscape sits at a similar loudness. */
  trim: number;
  /** Slow amplitude drift, giving the bed a sense of movement. */
  swell?: { depth: number; seconds: number };
}

const SOUNDSCAPES: Record<Exclude<AmbientSoundId, "none">, SoundscapeSpec> = {
  brown: {
    noise: "brown",
    filters: [{ type: "lowpass", frequency: 1100, Q: 0.7 }],
    trim: 1,
  },
  pink: {
    noise: "pink",
    filters: [{ type: "lowpass", frequency: 6500, Q: 0.5 }],
    trim: 0.85,
  },
  white: {
    noise: "white",
    filters: [{ type: "highshelf", frequency: 8000, gain: -6 }],
    trim: 0.5,
  },
  rain: {
    noise: "pink",
    filters: [
      { type: "highpass", frequency: 420, Q: 0.7 },
      { type: "lowpass", frequency: 7200, Q: 0.6 },
      { type: "peaking", frequency: 2200, Q: 0.8, gain: 4 },
    ],
    trim: 0.9,
    swell: { depth: 0.28, seconds: 11 },
  },
};

/** White noise: uniform samples, flat spectrum. */
function writeWhite(out: Float32Array): void {
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.random() * 2 - 1;
  }
}

/**
 * Pink noise (-3 dB/octave) via Paul Kellet's economy filter bank —
 * the standard cheap approximation, accurate to ~0.5 dB from 10 Hz to 20 kHz.
 */
function writePink(out: Float32Array): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  for (let i = 0; i < out.length; i += 1) {
    const white = Math.random() * 2 - 1;

    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;

    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
}

/**
 * Brown noise (-6 dB/octave) via a leaky integrator over white noise.
 * The `/ 1.02` leak keeps the running sum from drifting off to a DC offset.
 */
function writeBrown(out: Float32Array): void {
  let last = 0;

  for (let i = 0; i < out.length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    out[i] = last * 3.5;
  }
}

const NOISE_WRITERS = {
  white: writeWhite,
  pink: writePink,
  brown: writeBrown,
} as const;

/**
 * Normalise to a target peak so filtering never clips downstream.
 * Returns the applied scale so callers can match it on samples outside `data`.
 */
function normalise(data: Float32Array, targetPeak: number): number {
  let peak = 0;
  for (let i = 0; i < data.length; i += 1) {
    const magnitude = Math.abs(data[i] ?? 0);
    if (magnitude > peak) peak = magnitude;
  }

  if (peak === 0) return 1;

  const scale = targetPeak / peak;
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (data[i] ?? 0) * scale;
  }

  return scale;
}

/** Slow sine swell so the bed breathes instead of sitting perfectly static. */
function applySwell(
  data: Float32Array,
  sampleRate: number,
  depth: number,
  periodSeconds: number,
): void {
  // Round the period to a whole number of loop cycles so the swell itself
  // also lines up at the seam.
  const cycles = Math.max(1, Math.round(BUFFER_SECONDS / periodSeconds));
  const omega = (2 * Math.PI * cycles) / (BUFFER_SECONDS * sampleRate);

  for (let i = 0; i < data.length; i += 1) {
    const modulation = 1 - depth + depth * (0.5 + 0.5 * Math.sin(omega * i));
    data[i] = (data[i] ?? 0) * modulation;
  }
}

/**
 * Render a seamless, loopable buffer for the given soundscape.
 *
 * The seam is handled by generating `bodyLength + fadeLength` samples and
 * crossfading the natural continuation back over the start, so the last sample
 * flows into the first without a discontinuity.
 */
export function createSoundscapeBuffer(
  context: BaseAudioContext,
  id: Exclude<AmbientSoundId, "none">,
): AudioBuffer {
  const spec = SOUNDSCAPES[id];
  const { sampleRate } = context;
  const bodyLength = Math.floor(BUFFER_SECONDS * sampleRate);
  const fadeLength = Math.floor(SEAM_FADE_SECONDS * sampleRate);

  const scratch = new Float32Array(bodyLength + fadeLength);
  NOISE_WRITERS[spec.noise](scratch);

  const body = scratch.subarray(0, bodyLength);
  const scale = normalise(body, 0.92 * spec.trim);

  const buffer = context.createBuffer(1, bodyLength, sampleRate);
  const channel = buffer.getChannelData(0);
  channel.set(body);

  // Crossfade the natural continuation (which normalise did not touch, hence
  // the manual `scale`) back over the head of the loop.
  for (let i = 0; i < fadeLength; i += 1) {
    const t = i / fadeLength;
    const head = channel[i] ?? 0;
    const tail = (scratch[bodyLength + i] ?? 0) * scale;
    channel[i] = head * t + tail * (1 - t);
  }

  if (spec.swell) {
    applySwell(channel, sampleRate, spec.swell.depth, spec.swell.seconds);
  }

  return buffer;
}

/**
 * Build the filter chain for a soundscape and return its endpoints, so the
 * caller can wire `source → head` and `tail → gain`.
 */
export function createSoundscapeFilters(
  context: BaseAudioContext,
  id: Exclude<AmbientSoundId, "none">,
): { head: AudioNode; tail: AudioNode } | null {
  const specs = SOUNDSCAPES[id].filters;
  if (specs.length === 0) return null;

  let head: AudioNode | null = null;
  let previous: AudioNode | null = null;

  for (const spec of specs) {
    const filter = context.createBiquadFilter();
    filter.type = spec.type;
    filter.frequency.value = spec.frequency;
    if (spec.Q !== undefined) filter.Q.value = spec.Q;
    if (spec.gain !== undefined) filter.gain.value = spec.gain;

    if (previous) previous.connect(filter);
    else head = filter;

    previous = filter;
  }

  if (!head || !previous) return null;
  return { head, tail: previous };
}

/** Two-note bell used to mark phase transitions. */
export interface ChimeTone {
  frequency: number;
  /** Offset from the chime start, in seconds. */
  offset: number;
  duration: number;
  gain: number;
}

export const CHIME_TONES: Record<string, readonly ChimeTone[]> = {
  // Rising: a break just ended, get back to work.
  focusStart: [
    { frequency: 523.25, offset: 0, duration: 1.1, gain: 0.5 },
    { frequency: 783.99, offset: 0.14, duration: 1.3, gain: 0.42 },
  ],
  // Falling: a focus block just ended, let go.
  breakStart: [
    { frequency: 880, offset: 0, duration: 1.2, gain: 0.46 },
    { frequency: 659.25, offset: 0.16, duration: 1.5, gain: 0.4 },
  ],
  // Resolved triad: the whole session is done.
  sessionEnd: [
    { frequency: 523.25, offset: 0, duration: 1.6, gain: 0.4 },
    { frequency: 659.25, offset: 0.12, duration: 1.6, gain: 0.34 },
    { frequency: 783.99, offset: 0.24, duration: 1.8, gain: 0.3 },
  ],
};
