import { build } from "esbuild";
import { execFileSync } from "node:child_process";

/**
 * Roda os testes de lógica pura da extensão (`src/**\/__tests__/*.test.ts`).
 *
 * A extensão não tem um test runner configurado — não vale a pena introduzir
 * um só para meia dúzia de arquivos que testam funções puras. `esbuild`
 * transpila TypeScript para um bundle CommonJS único e Node executa.
 */

const result = await build({
  entryPoints: ["src/shared/__tests__/errors.test.ts"],
  bundle: true,
  outfile: "dist/test/errors.test.js",
  format: "cjs",
  platform: "node",
  target: "node18",
  logLevel: "info",
});

if (result.errors.length > 0) {
  process.exit(1);
}

execFileSync(process.execPath, ["dist/test/errors.test.js"], {
  stdio: "inherit",
});
