import { readFileSync, writeFileSync } from "node:fs";
import { createReleaseSchema } from "@/lib/validations/release.schema";

/** Prepare a validated publication payload without sending it to the server. */
const notes = readFileSync("docs/releases/v1.9.0.md", "utf8");
const title = notes.match(/\*\*Título sugerido:\*\*\s*(.+)/)?.[1]?.trim();
const start = notes.indexOf("Esta versão");
if (!title || start < 0)
  throw new Error("Título ou corpo das release notes ausente.");
const payload = createReleaseSchema.parse({
  versionTag: "v1.9.0",
  title,
  description: notes.slice(start).trim(),
  videoUrl: "remotion:ReleaseShowcaseV19",
});
writeFileSync(
  "docs/releases/v1.9.0-publication.json",
  `${JSON.stringify(payload, null, 2)}\n`,
);
process.stdout.write(
  `Release v1.9.0 validada: título ${payload.title.length} caracteres; notas ${payload.description.length} caracteres. Nenhuma publicação realizada.\n`,
);
