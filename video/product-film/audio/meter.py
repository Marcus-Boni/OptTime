# Per-half-second loudness (K-weighted RMS approximation) + band balance of mix.wav.
import numpy as np, sys
from scipy.io import wavfile
from scipy import signal
sr, x = wavfile.read(sys.argv[1] if len(sys.argv) > 1 else "mix.wav")
x = x.T.astype(np.float64)
# K-weighting: high-shelf +4 dB @ 1.5k and highpass 38 Hz (approximation of BS.1770)
b1, a1 = signal.iirfilter(2, 38, btype="highpass", ftype="butter", fs=sr)
shelf = signal.butter(2, 1500, "highpass", fs=sr, output="sos")
k = signal.lfilter(b1, a1, x, axis=-1)
k = k + (10 ** (4 / 20) - 1) * signal.sosfilt(shelf, k, axis=-1)
win = sr // 2
rows = []
for i in range(0, x.shape[1] - win + 1, win):
    seg = k[:, i:i + win]
    ms = np.mean(seg ** 2, axis=1).sum()
    lufs = -0.691 + 10 * np.log10(ms + 1e-12)
    lo = signal.sosfilt(signal.butter(4, 150, "lowpass", fs=sr, output="sos"), x[:, i:i+win].mean(0))
    hi = signal.sosfilt(signal.butter(4, 4000, "highpass", fs=sr, output="sos"), x[:, i:i+win].mean(0))
    rows.append(f"{i/sr:5.1f}s {lufs:6.1f} LUFS  low {20*np.log10(np.sqrt(np.mean(lo**2))+1e-9):6.1f}  high {20*np.log10(np.sqrt(np.mean(hi**2))+1e-9):6.1f}")
print("\n".join(rows))
