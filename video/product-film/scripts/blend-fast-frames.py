"""Overwrite fast-motion frames in .render/blended/ with their dense shutter average.

The base pass blends 4 subframes per frame with ffmpeg's tmix; frames listed in
.render/adaptive.json were captured with more subframes so whip-pans read as a
continuous streak instead of four stepped copies.
"""

import json
import os

import numpy as np
from PIL import Image

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".render")
plan = {int(k): v for k, v in json.load(open(os.path.join(HERE, "adaptive.json"))).items()}
for f, n in sorted(plan.items()):
    acc = None
    for k in range(n):
        a = np.asarray(Image.open(os.path.join(HERE, "frames_hi", f"f{f:04d}_{k:02d}.png")).convert("RGB"), dtype=np.float32)
        acc = a if acc is None else acc + a
    Image.fromarray(np.clip(acc / n + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(HERE, "blended", f"b{f:04d}.png"), compress_level=1)
print("replaced", len(plan))
