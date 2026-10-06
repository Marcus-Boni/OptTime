// Renders the landing product film into public/product-film.mp4 (+ poster) with one command.
//
//   pnpm video:film                          full render (about 10 minutes)
//   pnpm video:film --stills 120,316,705     quick look at chosen frames (.render/stills/sheet.jpg)
//   pnpm video:film --audio-only             re-synthesize the score and re-mux the last render
//
// Env overrides: CHROME_BIN, PYTHON, FFMPEG, FILM_WORKERS.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const render = join(here, ".render");
const publicDir = resolve(here, "../../public");

const PYTHON =
  process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const WORKERS = String(process.env.FILM_WORKERS || 6);
const SUBFRAMES = 4;
/** "Seu dia, montado sozinho." — the settled dialog frame doubles as poster and frame 0. */
const POSTER_FRAME = 316;
const OUTPUT = join(publicDir, "product-film.mp4");
const POSTER = join(publicDir, "product-film-poster.jpg");

function run(label, cmd, args) {
  console.log(`\n▸ ${label}`);
  const result = spawnSync(cmd, args, { cwd: here, stdio: "inherit" });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`${label}: exited with ${result.status}`);
}

const frame = (n) => String(n).padStart(4, "0");

function prepareStage() {
  run("Lucide icons", process.execPath, ["scripts/gen-icons.mjs"]);
  run("Tailwind (src/app/globals.css)", process.execPath, [
    "scripts/build-css.mjs",
  ]);
}

function score() {
  mkdirSync(render, { recursive: true });
  run("Score + sound design", PYTHON, [
    "audio/score.py",
    join(render, "mix.wav"),
  ]);
}

function encode() {
  const blended = join(render, "blended");
  if (!existsSync(join(blended, `b${frame(POSTER_FRAME)}.png`))) {
    throw new Error("No blended frames yet — run the full render first.");
  }
  run("Poster", FFMPEG, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    join(blended, `b${frame(POSTER_FRAME)}.png`),
    "-q:v",
    "2",
    POSTER,
  ]);
  // Bake the poster in as frame 0 so every platform's thumbnail shows it; duration and sync stay intact.
  copyFileSync(
    join(blended, `b${frame(POSTER_FRAME)}.png`),
    join(blended, "b0000.png"),
  );
  run("Encode H.264 + AAC", FFMPEG, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    "30",
    "-start_number",
    "0",
    "-i",
    join(blended, "b%04d.png"),
    "-i",
    join(render, "mix.wav"),
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "17",
    "-tune",
    "film",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale=out_color_matrix=bt709:out_range=tv",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-shortest",
    "-movflags",
    "+faststart",
    OUTPUT,
  ]);
  console.log(`\n✓ ${OUTPUT}\n✓ ${POSTER}`);
}

function fullRender() {
  prepareStage();
  score();
  for (const dir of ["frames", "frames_hi", "blended"])
    rmSync(join(render, dir), { recursive: true, force: true });
  mkdirSync(join(render, "blended"), { recursive: true });
  run(`Capture (${SUBFRAMES} shutter subframes per frame)`, process.execPath, [
    "scripts/capture.mjs",
    "render",
    WORKERS,
    String(SUBFRAMES),
  ]);
  run("Measure on-screen motion", process.execPath, [
    "scripts/capture.mjs",
    "motion",
  ]);
  run("Dense subframes for fast moves", process.execPath, [
    "scripts/capture.mjs",
    "adaptive",
    WORKERS,
  ]);
  run("Blend motion blur", FFMPEG, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    String(SUBFRAMES * 30),
    "-i",
    join(render, "frames", "s%06d.png"),
    "-vf",
    `tmix=frames=${SUBFRAMES}:weights='${Array(SUBFRAMES).fill(1).join(" ")}',select='eq(mod(n\\,${SUBFRAMES})\\,${SUBFRAMES - 1})',setpts=N/(30*TB)`,
    "-fps_mode",
    "passthrough",
    "-start_number",
    "0",
    join(render, "blended", "b%04d.png"),
  ]);
  run("Blend fast frames", PYTHON, ["scripts/blend-fast-frames.py"]);
  encode();
}

function stills(list) {
  prepareStage();
  rmSync(join(render, "stills"), { recursive: true, force: true });
  run("Stills", process.execPath, [
    "scripts/capture.mjs",
    "stills",
    ...list.split(","),
  ]);
  run("Contact sheet", PYTHON, [
    "scripts/contact-sheet.py",
    join(render, "stills", "*.png"),
    join(render, "stills", "sheet.jpg"),
    "3",
  ]);
}

const args = process.argv.slice(2);
try {
  if (args[0] === "--stills") stills(args[1] || "60,316,705");
  else if (args[0] === "--audio-only") {
    score();
    encode();
  } else fullRender();
} catch (error) {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
