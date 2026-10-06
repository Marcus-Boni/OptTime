"""OptSolv Time — score + sound design, synthesized from scratch.

One piece: D major, 120 BPM (beat = 0.5s = 15 video frames). Every SFX is pitched in key
and shares the music's reverb, so the effects sit inside the track instead of on top of it.
Event times are the film's frame numbers / 30.
"""

import argparse

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d

cli = argparse.ArgumentParser(description="Synthesize the product film score.")
cli.add_argument("out", nargs="?", default="mix.wav", help="output WAV (48 kHz float32 stereo)")
cli.add_argument("--gain", type=float, default=-1.4, help="master trim in dB (default lands at about -15 LUFS)")
cli.add_argument("--report", action="store_true", help="print per-stem levels and SFX-vs-music peaks")
ARGS = cli.parse_args()

SR = 48000
DUR = 24.0
N = int(SR * DUR)
FPS = 30
BEAT = 0.5
rng = np.random.default_rng(11)


def fr(f):
    return f / FPS


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tvec(n):
    return np.arange(n) / SR


def sos_filter(x, kind, freq, order=2):
    sos = signal.butter(order, freq, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def fade(n, a=0.004, r=0.01):
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.sin(np.linspace(0, np.pi / 2, na)) ** 2
    e[-nr:] *= np.cos(np.linspace(0, np.pi / 2, nr)) ** 2
    return e


class Bus:
    def __init__(self):
        self.x = np.zeros((2, N))

    def add(self, sig, start, pan=0.0, gain=1.0):
        if sig.ndim == 1:
            th = (pan + 1) * np.pi / 4
            sig = np.vstack([sig * np.cos(th), sig * np.sin(th)]) * np.sqrt(2)
        i0 = int(round(start * SR))
        s0 = max(0, -i0)
        i0 = max(0, i0)
        n = min(sig.shape[1] - s0, N - i0)
        if n > 0:
            self.x[:, i0 : i0 + n] += gain * sig[:, s0 : s0 + n]


music, sfx, verb_send, delay_send = Bus(), Bus(), Bus(), Bus()
STEMS = {}
STEM = ["misc"]


def put(sig, start, pan=0.0, gain=1.0, bus=None, verb=0.0, delay=0.0, stem=None):
    (bus or music).add(sig, start, pan, gain)
    STEMS.setdefault(stem or STEM[0], Bus()).add(sig, start, pan, gain)
    if verb:
        verb_send.add(sig, start, pan, gain * verb)
    if delay:
        delay_send.add(sig, start, pan, gain * delay)


# ─── Oscillators ──────────────────────────────────────────────────────
TBL = 4096


def saw_table(f0, fc, order=2, top=9000):
    kmax = max(1, int(min(top, SR * 0.45) / f0))
    k = np.arange(1, kmax + 1)
    amp = (1 / k) / np.sqrt(1 + (k * f0 / fc) ** (2 * order))
    ph = np.arange(TBL) / TBL
    tbl = (amp[:, None] * np.sin(2 * np.pi * k[:, None] * ph[None, :])).sum(0)
    return tbl / np.max(np.abs(tbl))


def table_osc(tbl, freq, n, phase0=0.0):
    if np.isscalar(freq):
        ph = (phase0 + freq * np.arange(n) / SR) % 1.0
    else:
        ph = (phase0 + np.cumsum(freq) / SR) % 1.0
    idx = ph * TBL
    i0 = idx.astype(np.int64)
    frac = idx - i0
    return tbl[i0 % TBL] * (1 - frac) + tbl[(i0 + 1) % TBL] * frac


# ─── Instruments ──────────────────────────────────────────────────────
def pad_note(m, dur, bright_from=0.0, bright_to=0.0, attack=0.35, release=0.9, amp=1.0):
    """Detuned unison saw, stereo-decorrelated, with a filter that opens over the note."""
    n = int((dur + release) * SR)
    f0 = hz(m)
    dark, bright = saw_table(f0, 650), saw_table(f0, 2600)
    mix = np.clip(np.linspace(bright_from, bright_to, n), 0, 1)
    out = np.zeros((2, n))
    for ch, cents in enumerate(([-11, -2, 6], [-6, 3, 10])):
        for c in cents:
            f = f0 * 2 ** (c / 1200)
            ph = rng.random()
            out[ch] += (1 - mix) * table_osc(dark, f, n, ph) + mix * table_osc(bright, f, n, ph)
    env = np.ones(n)
    na, nd = int(attack * SR), int(dur * SR)
    env[:na] = np.sin(np.linspace(0, np.pi / 2, na)) ** 2
    rel = n - nd
    env[nd:] = np.cos(np.linspace(0, np.pi / 2, rel)) ** 2
    return out * env * amp / 3


def pluck(m, dur=0.45, amp=1.0, bright=1.0):
    n = int(dur * SR)
    t = tvec(n)
    f = hz(m)
    y = np.zeros(n)
    for k in range(1, 11):
        if k * f > SR * 0.45:
            break
        y += (1 / k**1.3) * np.sin(2 * np.pi * k * f * t + rng.random()) * np.exp(-t * (4 + k * 3.2 / bright))
    return y * fade(n, 0.002, 0.03) * amp * 0.5


def bell(m, dur=2.8, amp=1.0, ratio=3.5, index=2.2, decay=1.0):
    n = int(dur * SR)
    t = tvec(n)
    f = hz(m)
    mod = index * np.exp(-t / 0.5) * np.sin(2 * np.pi * f * ratio * t)
    y = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / decay)
    y += 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / (decay * 0.45))
    y += 0.2 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / (decay * 0.25))
    return y * fade(n, 0.001, 0.2) * amp * 0.45


def bass_note(m, dur, amp=1.0):
    n = int((dur + 0.06) * SR)
    t = tvec(n)
    f = hz(m)
    y = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.1 * np.sin(2 * np.pi * 3 * f * t)
    env = np.exp(-t / (dur * 1.6)) * fade(n, 0.006, 0.05)
    y = np.tanh(1.6 * y * env) / np.tanh(1.6)
    return sos_filter(y, "lowpass", 900) * amp


def kick(amp=1.0):
    n = int(0.45 * SR)
    t = tvec(n)
    f = 46 + 110 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    click = sos_filter(rng.standard_normal(n), "highpass", 3000) * np.exp(-t / 0.002) * 0.25
    return np.tanh(1.4 * (body + click)) * fade(n, 0.0005, 0.05) * amp


def clap(amp=1.0):
    n = int(0.35 * SR)
    t = tvec(n)
    noise = sos_filter(rng.standard_normal(n), "bandpass", [900, 3200])
    env = np.zeros(n)
    for d in (0, 0.011, 0.022):
        env += np.where(t >= d, np.exp(-(t - d) / 0.0055), 0)
    env += 0.55 * np.exp(-t / 0.085)
    return noise * env * amp * 0.35


def hat(amp=1.0, decay=0.028):
    n = int(0.16 * SR)
    t = tvec(n)
    y = sos_filter(rng.standard_normal(n), "highpass", 7500) * np.exp(-t / decay)
    return y * amp * 0.3


def tick(amp=1.0, pitch=1.0):
    """Clock tick: resonant wooden click. The hook's clock becomes the groove's hi-hat."""
    n = int(0.09 * SR)
    t = tvec(n)
    y = sos_filter(rng.standard_normal(n), "bandpass", [2000, 9000]) * np.exp(-t / 0.004) * 0.7
    y += 0.55 * np.sin(2 * np.pi * 2350 * pitch * t) * np.exp(-t / 0.018)
    y += 0.3 * np.sin(2 * np.pi * 3720 * pitch * t) * np.exp(-t / 0.01)
    return y * fade(n, 0.0003, 0.02) * amp * 0.5


def ui_click(amp=1.0):
    n = int(0.07 * SR)
    t = tvec(n)
    y = sos_filter(rng.standard_normal(n), "bandpass", [1800, 6500]) * np.exp(-t / 0.0018) * 0.55
    y += 0.4 * np.sin(2 * np.pi * hz(93) * t) * np.exp(-t / 0.014) * (1 - np.exp(-t / 0.0008))  # A6, in key
    return y * fade(n, 0.0002, 0.02) * amp * 0.5


def pop(amp=1.0):
    n = int(0.16 * SR)
    t = tvec(n)
    f = hz(74) * (1 + 0.9 * (1 - np.exp(-t / 0.02)))  # D5 rising to ~A5
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05)
    return y * fade(n, 0.002, 0.03) * amp * 0.35


def tock(amp=1.0, m=81):
    n = int(0.1 * SR)
    t = tvec(n)
    y = np.sin(2 * np.pi * hz(m) * t) * np.exp(-t / 0.022) + 0.4 * sos_filter(rng.standard_normal(n), "bandpass", [800, 3000]) * np.exp(-t / 0.004)
    return y * fade(n, 0.0005, 0.02) * amp * 0.35


def band_noise(dur, fc_from, fc_to, width=0.55, shape=None):
    """Noise whose spectral band glides from fc_from to fc_to (STFT mask)."""
    n = int(dur * SR)
    x = rng.standard_normal(n + 2048)
    f, tt, Z = signal.stft(x, SR, nperseg=1024)
    prog = np.clip(tt / dur, 0, 1)
    curve = shape(prog) if shape else prog
    fc = fc_from * (fc_to / fc_from) ** curve
    lf = np.log2(np.maximum(f, 20))[:, None]
    mask = np.exp(-0.5 * ((lf - np.log2(fc)[None, :]) / width) ** 2)
    _, y = signal.istft(Z * mask, SR, nperseg=1024)
    y = y[:n]
    return y / (np.max(np.abs(y)) + 1e-9)


def whoosh(dur, f0=350, f1=3200, peak=0.55, amp=1.0, pan0=0.0, pan1=0.0):
    y = band_noise(dur, f0, f1, 0.7, lambda p: np.sin(np.pi * p * 0.5) ** 2)
    n = len(y)
    p = np.linspace(0, 1, n)
    env = np.where(p < peak, (p / peak) ** 2.2, ((1 - p) / (1 - peak)) ** 1.6)
    y = y * env * amp * 0.5
    pan = np.linspace(pan0, pan1, n)
    th = (pan + 1) * np.pi / 4
    return np.vstack([y * np.cos(th), y * np.sin(th)]) * np.sqrt(2)


def riser(dur, amp=1.0):
    n = int(dur * SR)
    t = tvec(n)
    p = t / dur
    noise = band_noise(dur, 250, 7000, 0.5, lambda q: q**1.6)
    f = hz(45) * 2 ** (2 * p**1.4)  # A2 → A4
    tone = table_osc(saw_table(hz(45), 1800), f, n)
    tone = sos_filter(tone, "highpass", 200)
    y = (noise * 0.75 + tone * 0.25) * (p**2.4)
    return y * fade(n, 0.01, 0.004) * amp


def impact(amp=1.0):
    n = int(2.4 * SR)
    t = tvec(n)
    f = 38 + 75 * np.exp(-t / 0.12)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.75)
    boom = sos_filter(rng.standard_normal(n), "lowpass", 260) * np.exp(-t / 0.22) * 0.9
    crack = sos_filter(rng.standard_normal(n), "highpass", 2500) * np.exp(-t / 0.018) * 0.35
    y = np.tanh(1.5 * (sub + boom + crack)) / np.tanh(1.5)
    return y * fade(n, 0.0005, 0.3) * amp


def reverse_swell(dur, m_list, amp=1.0):
    n = int(dur * SR)
    y = np.zeros(n)
    for m in m_list:
        y += bell(m, dur + 0.05, 1.0, decay=0.9)[:n]
    y = y[::-1] * (np.linspace(0, 1, n) ** 2)
    noise = band_noise(dur, 900, 6000, 0.6) * np.linspace(0, 1, n) ** 3 * 0.4
    return (y / (np.max(np.abs(y)) + 1e-9) + noise) * amp * 0.5


# ─── Harmony ──────────────────────────────────────────────────────────
D9 = [50, 57, 61, 64, 66]
Bm9 = [47, 54, 57, 61, 62]
G9 = [43, 54, 57, 59, 62]
Asus = [45, 52, 57, 62, 64]
A = [45, 52, 57, 61, 64]
ROOT = {"D": 38, "B": 35, "G": 31, "A": 33}
ARP = {
    "D": [74, 78, 81, 85, 76, 81],
    "B": [71, 74, 78, 81, 73, 78],
    "G": [67, 71, 74, 78, 69, 74],
    "A": [69, 73, 76, 81, 74, 76],
}
BARS = [("D", D9), ("B", Bm9), ("G", G9), ("A", Asus)] * 2  # bars from 4s to 20s

# ─── Score ────────────────────────────────────────────────────────────
# Hook 0–4s: dark open fifth, clock ticking once per second, then accelerating into the drop.
STEM[0] = "hook_drone"
drone = pad_note(38 + 12, 4.0, 0.0, 0.25, attack=1.2, release=0.25, amp=0.55) + pad_note(45 + 12, 4.0, 0.0, 0.3, attack=1.6, release=0.25, amp=0.4)
drone = sos_filter(drone, "lowpass", 900)
put(drone, 0.0, gain=0.24, verb=0.3)
put(bass_note(26 + 12, 3.9, 0.6), 0.0, gain=0.1)
STEM[0] = "hook_ticks"
for i, ts in enumerate([0, 1, 2, 3]):
    put(tick(1.0, 1.0 if i % 2 == 0 else 0.86), ts, pan=0.15 if i % 2 else -0.15, gain=1.0, verb=0.25)
put(bell(86, 2.0, decay=0.7), 3.0, pan=0.0, gain=0.16, verb=0.6)  # 18:00 — the clock chimes
for k, ts in enumerate([3.25, 3.5, 3.625, 3.75, 3.8125, 3.875, 3.9063]):
    put(tick(0.5 + 0.08 * k, 1.0 + 0.04 * k), ts, pan=(-0.2 if k % 2 else 0.2), gain=0.95, verb=0.2)
STEM[0] = "riser"
put(riser(1.36), 2.58, gain=0.85, verb=0.25)

# Drop at 4.0s: impact + logo sting, the harmony opens to Dmaj9.
STEM[0] = "drop"
put(impact(), fr(120), gain=0.62, verb=0.35)
for k, m in enumerate([74, 81, 85, 90]):
    put(bell(m, 3.2, decay=1.4), fr(120) + 0.012 * k, pan=[-0.3, 0.1, 0.35, -0.1][k], gain=0.11, verb=0.6)

# Pads, bass, arp for bars 4–20s.
for b, (name, chord) in enumerate(BARS):
    t0 = 4.0 + 2.0 * b
    open_from = 0.15 + 0.08 * b
    if name == "A":
        for m in chord:
            put(pad_note(m, 1.0, open_from, open_from + 0.1, attack=0.25, release=0.5), t0, gain=0.11, verb=0.28, stem="pad")
        for m in A:
            put(pad_note(m, 1.0, open_from + 0.1, open_from + 0.2, attack=0.15, release=0.7), t0 + 1.0, gain=0.11, verb=0.28, stem="pad")
    else:
        for m in chord:
            put(pad_note(m, 2.0, open_from, open_from + 0.12, attack=0.3 if b else 0.08, release=0.7), t0, gain=0.11, verb=0.28, stem="pad")
    # Bass: sustained in the reveal, pumping eighths once the groove is in.
    if t0 < 8.0:
        put(bass_note(ROOT[name], 1.9, 1.0), t0, gain=0.24, stem="bass")
    else:
        for e in range(8):
            put(bass_note(ROOT[name] + (12 if e % 4 == 3 else 0), 0.2, 1.0), t0 + e * 0.25 + 0.25 * 0.5, gain=0.23, stem="bass")
            if e % 2 == 0:
                put(bass_note(ROOT[name], 0.12, 0.7), t0 + e * 0.25, gain=0.16, stem="bass")
    # Arp: quarters in the reveal, sixteenths with the groove.
    notes = ARP[name]
    step = 0.5 if t0 < 8.0 else 0.125
    for k in range(int(2.0 / step)):
        m = notes[k % len(notes)] + (12 if (t0 >= 12.0 and k % 8 == 6) else 0)
        acc = 1.0 if k % 4 == 0 else 0.65
        put(pluck(m, 0.4, acc, bright=0.9), t0 + k * step, pan=(-0.35 if k % 2 else 0.35), gain=0.18, verb=0.3, delay=0.45, stem="arp")

# Drums.
kicks = []
for b in range(16, 39):  # beats 16..38 → 8.0s .. 19.0s
    ts = b * BEAT
    kicks.append(ts)
    put(kick(), ts, gain=0.5, verb=0.03, stem="kick")
    if b % 2 == 1:
        put(clap(), ts, pan=0.05, gain=1.3, verb=0.3, stem="clap")
kicks.append(19.5)
put(kick(0.9), 19.5, gain=0.5)
# Ticking hats: the clock motif carries on as the groove's top line.
for k in range(int((20.0 - 4.0) / 0.125)):
    ts = 4.0 + k * 0.125
    on_off = (k % 4) == 2
    if ts < 8.0:
        if on_off:
            put(tick(0.32, 1.0), ts, pan=0.25, gain=1.0, verb=0.12, stem="hats")
    else:
        vel = 0.55 if on_off else (0.22 if k % 2 else 0.3)
        put(hat(vel, 0.05 if on_off else 0.025), ts, pan=0.3 if k % 2 else 0.2, gain=1.1, verb=0.08, stem="hats")
STEM[0] = "turnaround"
# Turnaround 19.5–20.0: rising claps; then a breath before the final chord.
for k, ts in enumerate(np.arange(19.5, 20.0, 0.0625)):
    put(clap(0.25 + 0.09 * k), ts, pan=(-0.15 if k % 2 else 0.15), gain=0.9, verb=0.3)
put(reverse_swell(0.5, [74, 81, 85]), 20.0, gain=0.35, verb=0.3)

STEM[0] = "outro"
# Outro at 20.5s (f615): final Dmaj9, bright, long tail; bell sting.
for m in D9 + [69, 73]:
    put(pad_note(m, 2.6, 0.55, 0.85, attack=0.05, release=0.85), fr(615), gain=0.09, verb=0.35)
put(bass_note(38, 2.8, 1.0), fr(615), gain=0.26)
put(impact(0.55), fr(615), gain=0.4, verb=0.4)
for k, m in enumerate([74, 78, 81, 86, 90]):
    put(bell(m, 3.4, decay=1.5), fr(615) + 0.035 * k, pan=[-0.35, -0.1, 0.1, 0.3, 0.0][k], gain=0.1, verb=0.65)
for k, m in enumerate([98, 102, 105]):  # sheen across the logo tile
    put(bell(m, 1.4, decay=0.5, index=1.2), 22.3 + 0.09 * k, pan=0.2 - 0.2 * k, gain=0.035, verb=0.7)

# ─── Sound design on picture ─────────────────────────────────────────
STEM[0] = "sfx"
put(whoosh(0.9, 400, 2600, 0.6, 1.0, -0.2, 0.25), fr(196), bus=sfx, gain=0.42, verb=0.25)  # match cut
for f in (255, 345, 450, 555):  # cursor clicks
    put(ui_click(), fr(f), pan=0.3, bus=sfx, gain=0.22, verb=0.15)
put(pop(), fr(257), pan=0.2, bus=sfx, gain=0.5, verb=0.3)  # dialog opens
put(whoosh(0.6, 500, 2200, 0.5, 0.8, 0.1, 0.3), fr(250), bus=sfx, gain=0.18, verb=0.2)  # push-in
for i, m in enumerate([74, 76, 78, 81, 83]):  # suggestions cascade in, pentatonic
    put(pluck(m + 12, 0.35, 0.8, 1.4), fr(268 + 5 * i), pan=0.25, bus=sfx, gain=0.07, verb=0.4)
fill = band_noise(1.0, 1500, 7000, 0.45) * np.linspace(0, 1, SR) ** 1.5 * fade(SR, 0.05, 0.12)
put(fill, fr(288), pan=0.25, bus=sfx, gain=0.035, verb=0.35)  # projected progress filling
for k, m in enumerate([86, 93, 98]):  # launched
    put(bell(m, 1.6, decay=0.6, index=1.4), fr(347) + 0.05 * k, pan=0.3, bus=sfx, gain=0.06, verb=0.5)
put(whoosh(1.2, 300, 3800, 0.42, 1.0, 0.35, -0.1), fr(350), bus=sfx, gain=0.52, verb=0.25)  # whip-pan + cards fly
for i in range(5):  # cards land in Friday's column
    put(tock(0.8, 81 + [0, 2, 4, 7, 9][i]), fr(376 + 3 * i), pan=0.35, bus=sfx, gain=0.22, verb=0.25)
for k, m in enumerate([86, 93]):  # 40h — week complete
    put(bell(m, 2.0, decay=0.9), fr(390) + 0.09 * k, pan=0.3, bus=sfx, gain=0.08, verb=0.5)
put(whoosh(1.7, 500, 5200, 0.4, 1.0, 0.2, 0.55), fr(452), bus=sfx, gain=0.46, verb=0.3)  # sent
put(whoosh(1.3, 260, 1800, 0.55, 1.0, -0.1, -0.7), fr(458), bus=sfx, gain=0.22, verb=0.2)  # member window recedes left
put(whoosh(1.3, 300, 2400, 0.62, 1.0, 0.8, 0.2), fr(466), bus=sfx, gain=0.24, verb=0.2)  # manager window arrives from the right
put(pop(0.9), fr(507), pan=0.35, bus=sfx, gain=0.4, verb=0.3)  # lands in the queue
put(bell(93, 1.2, decay=0.4, index=1.0), fr(508), pan=0.35, bus=sfx, gain=0.05, verb=0.5)
put(whoosh(0.8, 450, 2400, 0.55, 0.8, 0.2, 0.35), fr(524), bus=sfx, gain=0.16, verb=0.2)  # push to Aprovar
for k, m in enumerate([86, 90, 93, 98]):  # approved
    put(bell(m, 2.4, decay=1.0), fr(558) + 0.055 * k, pan=0.3 - 0.1 * k, bus=sfx, gain=0.11, verb=0.55)
put(whoosh(0.9, 300, 4200, 0.75, 1.0, 0.25, 0.0), fr(594), bus=sfx, gain=0.3, verb=0.3)  # zoom-through to outro

# ─── Effects returns ─────────────────────────────────────────────────
def make_ir(rt=2.3, pre=0.022):
    n = int((rt + 0.3) * SR)
    t = tvec(n)
    ir = np.zeros((2, n))
    for ch in range(2):
        noise = rng.standard_normal(n)
        lo = sos_filter(noise, "lowpass", 900) * np.exp(-6.9 * t / rt)
        mid = sos_filter(noise, "bandpass", [900, 4000]) * np.exp(-6.9 * t / (rt * 0.7))
        hi = sos_filter(noise, "highpass", 4000) * np.exp(-6.9 * t / (rt * 0.35))
        body = lo + mid * 0.8 + hi * 0.5
        er = np.zeros(n)
        for d, g in ((0.011, 0.5), (0.019, 0.38), (0.027, 0.3), (0.041, 0.22), (0.053, 0.16)):
            er[int((d + 0.003 * ch) * SR)] += g * (1 if rng.random() > 0.5 else -1)
        ir[ch] = np.concatenate([np.zeros(int(pre * SR)), (body * 0.12 + er)[: n - int(pre * SR)]])
    return ir / np.sqrt(np.sum(ir**2) / 2)


ir = make_ir()
wet = np.vstack([signal.fftconvolve(verb_send.x[ch], ir[ch])[:N] for ch in range(2)])
wet = sos_filter(sos_filter(wet, "highpass", 180), "lowpass", 8500)

# Ping-pong delay, dotted eighth (0.375s), filtered feedback.
d = int(0.375 * SR)
dl = np.zeros((2, N))
src = sos_filter(delay_send.x, "bandpass", [400, 6000])
fb = 0.42
for k in range(1, 7):
    shift = k * d
    if shift >= N:
        break
    ch = k % 2
    dl[ch, shift:] += (fb ** (k - 1)) * 0.6 * src.mean(axis=0)[: N - shift]
dl = sos_filter(dl, "lowpass", 5000)

# Sidechain: pads, bass and arp breathe with the kick.
duck = np.zeros(N)
tt = tvec(N)
for k in kicks:
    i = int(k * SR)
    seg = tt[i:] - k
    duck[i:] += np.exp(-seg / 0.13)
duck = 1 - 0.55 * np.clip(duck, 0, 1)
duck = signal.sosfilt(signal.butter(1, 60, fs=SR, output="sos"), duck)

mix = music.x * duck + dl * duck * 1.4 + wet * 0.55 + sfx.x

def db(x):
    return 20 * np.log10(np.sqrt(np.mean(x**2)) + 1e-12)


for name, (a, b) in ({} if not ARGS.report else {"hook": (0.2, 3.4), "reveal": (4.3, 7.8), "groove": (8.2, 19.4), "outro": (20.6, 23.0)}).items():
    i, j = int(a * SR), int(b * SR)
    parts = {k: db(v.x[:, i:j]) for k, v in STEMS.items() if db(v.x[:, i:j]) > -80}
    parts["verb"] = db(wet[:, i:j] * 0.55)
    parts["delay"] = db(dl[:, i:j] * 1.4)
    print(f"{name:7s} total {db(mix[:, i:j]):6.1f} | " + "  ".join(f"{k} {v:.1f}" for k, v in sorted(parts.items(), key=lambda kv: -kv[1])))
mix = sos_filter(mix, "highpass", 28)

# ─── Master: gentle saturation, look-ahead limiter, loudness trim ─────
mix = np.tanh(mix * 1.1) / 1.1


def limit(x, ceiling=0.84, look=0.004, release=0.09):
    peak = np.max(np.abs(x), axis=0)
    la = int(look * SR)
    peak = maximum_filter1d(peak, size=2 * la + 1)
    target = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    g = np.empty_like(target)
    a = np.exp(-1 / (release * SR))
    cur = 1.0
    for i, v in enumerate(target):
        cur = v if v < cur else a * cur + (1 - a) * v
        g[i] = cur
    g = signal.sosfiltfilt(signal.butter(1, 400, fs=SR, output="sos"), g)
    return x * np.minimum(g, 1.0)


mix = mix * 10 ** (ARGS.gain / 20)
mix = limit(mix)
# Gentle fade at the very end so the tail lands on silence with the last frame.
tail = int(0.9 * SR)
mix[:, -tail:] *= np.cos(np.linspace(0, np.pi / 2, tail)) ** 1.5
mix[:, :int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
print("peak", np.max(np.abs(mix)), "rms dBFS", 20 * np.log10(np.sqrt(np.mean(mix**2)) + 1e-12))
wavfile.write(ARGS.out, SR, mix.T.astype(np.float32))

if ARGS.report:
    sfx_x = STEMS["sfx"].x
    mus = music.x * duck
    for name, t in [("match whoosh", 6.9), ("click fill", 8.5), ("pop", 8.57), ("rows", 9.1), ("click launch", 11.5), ("whip", 11.9), ("tocks", 12.6), ("40h bell", 13.0), ("click submit", 15.0), ("sent whoosh", 15.6), ("land pop", 16.9), ("click approve", 18.5), ("approve bells", 18.65), ("outro whoosh", 20.1)]:
        i, j = int((t - 0.05) * SR), int((t + 0.35) * SR)
        sp = 20 * np.log10(np.max(np.abs(sfx_x[:, i:j])) + 1e-9)
        mp = 20 * np.log10(np.max(np.abs(mus[:, i:j])) + 1e-9)
        print(f"{name:14s} sfx peak {sp:6.1f}  music peak {mp:6.1f}  diff {sp - mp:5.1f}")
