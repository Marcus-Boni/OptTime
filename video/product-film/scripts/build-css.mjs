// Compiles the app's real Tailwind v4 design system (src/app/globals.css) for the film stage.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";

const stage = resolve(dirname(fileURLToPath(import.meta.url)), "../stage");
const from = resolve(stage, "film.src.css");
const to = resolve(stage, "film.css");
const result = await postcss([tailwind({ base: stage })]).process(
  readFileSync(from, "utf8"),
  { from, to },
);
writeFileSync(to, result.css);
console.log(`film.css: ${(result.css.length / 1024).toFixed(1)} KB`);
