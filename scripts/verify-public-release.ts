import assert from "node:assert/strict";
import {
  findRemotionComposition,
  toPublicRelease,
} from "@/lib/releases/public-release";

const draft = {
  status: "draft",
  versionTag: "v1.9.0",
  title: "Em preparação",
  videoUrl: "remotion:ReleaseShowcaseV19",
};
assert.equal(
  toPublicRelease(draft),
  null,
  "Rascunhos não podem aparecer na homepage",
);
assert.equal(
  toPublicRelease(null),
  null,
  "Ausência de release não anuncia uma versão não publicada",
);
const published = {
  ...draft,
  status: "published",
  versionTag: "1.9.0",
  authorId: "private",
  description: "internal",
};
assert.deepEqual(
  toPublicRelease(published),
  {
    versionTag: "v1.9.0",
    title: "Em preparação",
    videoUrl: "remotion:ReleaseShowcaseV19",
  },
  "Somente metadados públicos atravessam a fronteira da página",
);
assert.equal(toPublicRelease({ ...published, videoUrl: "  " })?.videoUrl, null);

const compositions = [
  { id: "ReleaseShowcaseV19", aliases: ["v1.9", "v19"] },
  { id: "ReleaseShowcaseV18", aliases: ["v1.8", "v18"] },
  { id: "ProductDemo", aliases: ["demo"] },
];
assert.equal(
  findRemotionComposition("remotion:ReleaseShowcaseV18", compositions)?.id,
  "ReleaseShowcaseV18",
);
assert.equal(
  findRemotionComposition(" remotion:ReleaseShowcaseV19 ", compositions)?.id,
  "ReleaseShowcaseV19",
);
assert.equal(
  findRemotionComposition("v19", compositions)?.id,
  "ReleaseShowcaseV19",
);
assert.equal(
  findRemotionComposition("/release-v1.9.0.mp4", compositions),
  undefined,
  "MP4 com versão no nome deve continuar sendo MP4",
);
assert.equal(
  findRemotionComposition("https://example.com/v1.8/demo.mp4", compositions),
  undefined,
);
assert.equal(
  findRemotionComposition("remotion:ReleaseShowcaseV20", compositions),
  undefined,
  "Não substituir uma composição futura pelo vídeo de outra release",
);
process.stdout.write(
  "Homepage: rascunhos privados, metadados públicos e seleção de vídeo verificados.\n",
);
