import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createReleaseSchema } from "@/lib/validations/release.schema";
import { DEFAULT_APP_VERSION, DEFAULT_APP_VERSION_TAG } from "@/lib/version";

/** Prepare a validated changelog payload without publishing or notifying users. */
const notes = readFileSync("docs/releases/v1.11.0.md", "utf8");
const title = notes.match(/\*\*Título sugerido:\*\*\s*(.+)/)?.[1]?.trim();
const start = notes.indexOf("A versão **v1.11.0**");
const end = notes.indexOf("\n## Operação da entrega");
assert.ok(
  title && start >= 0 && end > start,
  "Notas de lançamento incompletas.",
);
assert.equal(DEFAULT_APP_VERSION_TAG, "v1.11.0");
const manifest: { version: string } = JSON.parse(
  readFileSync("package.json", "utf8"),
);
assert.equal(manifest.version, DEFAULT_APP_VERSION);
const payload = createReleaseSchema.parse({
  versionTag: DEFAULT_APP_VERSION_TAG,
  title,
  description: notes.slice(start, end).trim(),
  videoUrl: null,
});
writeFileSync(
  "docs/releases/v1.11.0-publication.json",
  `${JSON.stringify(payload, null, 2)}\n`,
);
process.stdout.write(
  `Release ${payload.versionTag} validada; ${payload.description.length} caracteres. Nenhum anúncio publicado.\n`,
);
