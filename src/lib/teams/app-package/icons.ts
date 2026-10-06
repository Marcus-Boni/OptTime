/**
 * Teams app icons, drawn in code: a stopwatch in the brand colour.
 *
 * Teams wants a 192×192 full-colour icon and a 32×32 white-on-transparent
 * outline. The glyph is described once in a 192-unit space and rasterised
 * with 4×4 supersampling at either size, so both stay crisp.
 */

import { encodePng } from "@/lib/teams/app-package/binary";

/** --brand-500 (#f97316). */
const BRAND_RGB: [number, number, number] = [0xf9, 0x73, 0x16];
const SUPERSAMPLE = 4;

const CENTER_X = 96;
const CENTER_Y = 106;
const RING_OUTER = 54;
const RING_THICKNESS = 13;

function insideCapsule(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
  );
  const px = ax + t * dx - x;
  const py = ay + t * dy - y;
  return px * px + py * py <= radius * radius;
}

/** True when the point (in 192-unit space) is part of the stopwatch glyph. */
function insideGlyph(x: number, y: number): boolean {
  const distance = Math.hypot(x - CENTER_X, y - CENTER_Y);

  const ring =
    distance <= RING_OUTER && distance >= RING_OUTER - RING_THICKNESS;
  const crown = x >= 82 && x <= 110 && y >= 30 && y <= 42;
  const stem = x >= 90 && x <= 102 && y >= 42 && y <= 54;
  const hub = distance <= 8;
  const minuteHand = insideCapsule(x, y, CENTER_X, CENTER_Y, CENTER_X, 72, 5.5);
  const hourHand = insideCapsule(x, y, CENTER_X, CENTER_Y, 120, 118, 5.5);

  return ring || crown || stem || hub || minuteHand || hourHand;
}

function coverage(px: number, py: number, scale: number): number {
  let hits = 0;
  for (let sy = 0; sy < SUPERSAMPLE; sy++) {
    for (let sx = 0; sx < SUPERSAMPLE; sx++) {
      const x = (px + (sx + 0.5) / SUPERSAMPLE) * scale;
      const y = (py + (sy + 0.5) / SUPERSAMPLE) * scale;
      if (insideGlyph(x, y)) hits++;
    }
  }
  return hits / (SUPERSAMPLE * SUPERSAMPLE);
}

function render(size: number, mode: "color" | "outline"): Buffer {
  const scale = 192 / size;
  const rgba = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const alpha = coverage(x, y, scale);
      const index = (y * size + x) * 4;

      if (mode === "color") {
        // White glyph blended over a solid brand background.
        rgba[index] = Math.round(BRAND_RGB[0] + (255 - BRAND_RGB[0]) * alpha);
        rgba[index + 1] = Math.round(
          BRAND_RGB[1] + (255 - BRAND_RGB[1]) * alpha,
        );
        rgba[index + 2] = Math.round(
          BRAND_RGB[2] + (255 - BRAND_RGB[2]) * alpha,
        );
        rgba[index + 3] = 255;
      } else {
        rgba[index] = 255;
        rgba[index + 1] = 255;
        rgba[index + 2] = 255;
        rgba[index + 3] = Math.round(alpha * 255);
      }
    }
  }

  return encodePng(size, size, rgba);
}

export function renderColorIcon(): Buffer {
  return render(192, "color");
}

export function renderOutlineIcon(): Buffer {
  return render(32, "outline");
}
