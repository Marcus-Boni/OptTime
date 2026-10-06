// Deterministic frame capture for the product film.
// Serves stage/, calls window.seek(frame) and screenshots each (sub)frame.
//
//   node capture.mjs stills 120 316 705       one PNG per frame → .render/stills
//   node capture.mjs render [workers] [subframes]   shutter subframes → .render/frames
//   node capture.mjs motion                  per-frame on-screen travel → .render/motion.json
//   node capture.mjs adaptive [workers]      extra subframes for fast frames → .render/frames_hi
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../stage");
const out = resolve(here, "../.render");
const repo = resolve(here, "../../..");

/** CHROME_BIN wins; otherwise reuse the headless shell Remotion already downloads for this repo. */
function browserPath() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const platform = {
    win32: "win64",
    darwin: process.arch === "arm64" ? "mac-arm64" : "mac-x64",
    linux: "linux64",
  }[process.platform];
  const exe =
    process.platform === "win32"
      ? "chrome-headless-shell.exe"
      : "chrome-headless-shell";
  const candidate = join(
    repo,
    "node_modules/.remotion/chrome-headless-shell",
    platform,
    `chrome-headless-shell-${platform}`,
    exe,
  );
  if (existsSync(candidate)) return candidate;
  throw new Error(
    "No browser found. Run `pnpm exec remotion browser ensure` or set CHROME_BIN.",
  );
}

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
};
const server = createServer((req, res) => {
  const path = join(
    root,
    decodeURIComponent(req.url.split("?")[0]).replace(/^\/$/, "/index.html"),
  );
  if (!path.startsWith(root) || !existsSync(path)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    "content-type": types[extname(path)] || "application/octet-stream",
  });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: browserPath(),
  args: [
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--font-render-hinting=none",
    "--disable-lcd-text",
    "--force-color-profile=srgb",
    // GPU raster roughly halves capture time for the blur-heavy stage.
    "--enable-gpu-rasterization",
    "--ignore-gpu-blocklist",
    ...(process.platform === "win32" ? ["--use-angle=d3d11"] : []),
  ],
});

async function openPage() {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, {
    timeout: 30000,
  });
  return page;
}

async function shot(page, frame, path) {
  await page.evaluate((f) => window.seek(f), frame);
  await page.screenshot({
    path,
    type: "png",
    animations: "disabled",
    caret: "hide",
  });
}

/** Runs jobs across N pages; each job is { t, path }. */
async function runJobs(jobs, workers, t0) {
  let next = 0;
  let done = 0;
  async function worker() {
    const page = await openPage();
    while (next < jobs.length) {
      const job = jobs[next++];
      await shot(page, job.t, job.path);
      if (++done % 300 === 0)
        console.log(
          `  ${done}/${jobs.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
        );
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
}

const [mode, ...rest] = process.argv.slice(2);
const t0 = Date.now();
const pad = (n, w) => String(n).padStart(w, "0");

if (mode === "stills") {
  const dir = join(out, "stills");
  mkdirSync(dir, { recursive: true });
  const page = await openPage();
  for (const s of rest)
    await shot(
      page,
      Number(s),
      join(dir, `f${pad(Math.round(Number(s) * 10), 5)}.png`),
    );
  console.log(`stills: ${rest.length} → ${dir}`);
} else if (mode === "render") {
  const workers = Number(rest[0] || 6);
  const sub = Number(rest[1] || 4);
  const dir = join(out, "frames");
  mkdirSync(dir, { recursive: true });
  const page = await openPage();
  const total = await page.evaluate(() => window.DURATION);
  await page.close();
  // Subframes span half a frame interval (180° shutter), centred on the frame.
  const offsets = Array.from({ length: sub }, (_, k) =>
    sub === 1 ? 0 : (k / (sub - 1) - 0.5) * 0.5,
  );
  const jobs = [];
  for (let f = 0; f < total; f++) {
    offsets.forEach((o, k) => {
      jobs.push({ t: f + o, path: join(dir, `s${pad(f * sub + k, 6)}.png`) });
    });
  }
  await runJobs(jobs, workers, t0);
  console.log(
    `render: ${jobs.length} shots in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
} else if (mode === "motion") {
  const page = await openPage();
  const total = await page.evaluate(() => window.DURATION);
  const motion = {};
  for (let f = 0; f < total; f++)
    motion[f] = await page.evaluate((fr) => window.motion(fr), f);
  writeFileSync(join(out, "motion.json"), JSON.stringify(motion));
  console.log(`motion: ${total} frames measured`);
} else if (mode === "adaptive") {
  // 4 subframes leave visible steps on fast camera moves; resample those frames densely.
  const workers = Number(rest[0] || 6);
  const motion = JSON.parse(readFileSync(join(out, "motion.json"), "utf8"));
  const dir = join(out, "frames_hi");
  mkdirSync(dir, { recursive: true });
  const plan = {};
  const jobs = [];
  for (const [key, travel] of Object.entries(motion)) {
    const f = Number(key);
    const n = Math.max(4, Math.min(24, Math.ceil(travel / 9) + 1));
    if (n <= 4) continue;
    plan[f] = n;
    for (let k = 0; k < n; k++)
      jobs.push({
        t: f + (k / (n - 1) - 0.5) * 0.5,
        path: join(dir, `f${pad(f, 4)}_${pad(k, 2)}.png`),
      });
  }
  writeFileSync(join(out, "adaptive.json"), JSON.stringify(plan));
  await runJobs(jobs, workers, t0);
  console.log(
    `adaptive: ${Object.keys(plan).length} frames, ${jobs.length} shots in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
} else {
  console.error("usage: node capture.mjs stills|render|motion|adaptive [...]");
  process.exitCode = 1;
}

await browser.close();
server.close();
