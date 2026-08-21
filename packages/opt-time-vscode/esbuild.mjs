import { build, context } from "esbuild";

/**
 * The extension ships as a single CommonJS bundle.
 *
 * VS Code loads `main` with `require`, and `vscode` is injected by the host at
 * runtime — bundling it would break the extension, so it stays external.
 */

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const test = process.argv.includes("--test");

/** @type {import('esbuild').BuildOptions} */
const base = {
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  external: ["vscode"],
  treeShaking: true,
  logLevel: "info",
};

/**
 * The test bundle is a separate entry point rather than a runner config: the
 * tests cover pure functions, so they only need to be reachable from Node.
 */
const options = test
  ? { ...base, entryPoints: ["src/test/logic.test.ts"], outfile: "dist/test.js" }
  : {
      ...base,
      entryPoints: ["src/extension.ts"],
      outfile: "dist/extension.js",
      sourcemap: !production,
      minify: production,
    };

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("[opt-time] watching for changes…");
} else {
  await build(options);
}
