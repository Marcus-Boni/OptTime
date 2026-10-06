/**
 * Offline checks for the Teams app (bot + message extension).
 *
 * Covers the parts that decide what gets written or exposed without needing
 * Teams, a model or the database: the rules parser, the model-merge guard
 * rails, card contracts, the generated app package and request security.
 *
 *   pnpm verify:teams-bot
 */

process.env.DATABASE_URL ??= "postgres://verify:verify@localhost:5432/verify";

import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

async function main(): Promise<void> {
  const { parseWithRules, mergeWithRules, parseDateText, validateDraftDate } =
    await import("@/lib/teams/bot/intent");
  const {
    buildProposalCard,
    buildLoggedCard,
    buildRequestCard,
    minutesToInput,
  } = await import("@/lib/teams/bot/cards");
  const { buildTeamsManifest, buildTeamsAppPackage } = await import(
    "@/lib/teams/app-package/manifest"
  );
  const { crc32 } = await import("@/lib/teams/app-package/binary");
  const { verifyInboundRequest } = await import("@/lib/teams/bot/auth");
  const { isTrustedServiceUrl } = await import("@/lib/teams/bot/connector");
  const { readInputs } = await import("@/lib/teams/bot/actions");

  let passed = 0;
  async function check(
    name: string,
    run: () => void | Promise<void>,
  ): Promise<void> {
    try {
      await run();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      console.error(`  ✗ ${name}`);
      throw error;
    }
  }

  const context = {
    today: "2026-10-06", // a Tuesday
    managerName: "Ana Souza",
    projects: [
      {
        id: "p-int",
        name: "Interno OptSolv",
        code: "OPT-000",
        billable: false,
        clientName: null,
      },
      {
        id: "p-cid",
        name: "Cidade Engenharia",
        code: "CID-001",
        billable: true,
        clientName: null,
      },
      {
        id: "p-por",
        name: "Portal",
        code: "POR-01",
        billable: true,
        clientName: null,
      },
    ],
    recentProjectIds: ["p-cid"],
  };

  console.log("Parser de regras");

  await check(
    "“registre 1 hora de reunião com meu líder” vira rascunho completo",
    () => {
      const draft = parseWithRules(
        "registre 1 hora de reunião com meu líder",
        context,
      );
      assert.equal(draft.durationMinutes, 60);
      assert.equal(draft.date, "2026-10-06");
      assert.equal(draft.description, "Reunião com Ana Souza");
      assert.equal(draft.projectId, "p-cid");
      assert.equal(draft.projectGuessed, true, "projeto veio do histórico");
    },
  );

  await check("prefixo /opt-time, projeto citado e “ontem”", () => {
    const draft = parseWithRules(
      "/opt-time lança 2h30 no projeto Cidade Engenharia ajuste no módulo de obras ontem",
      context,
    );
    assert.equal(draft.durationMinutes, 150);
    assert.equal(draft.date, "2026-10-05");
    assert.equal(draft.projectId, "p-cid");
    assert.equal(draft.projectGuessed, false);
    assert.equal(draft.description, "Ajuste no módulo de obras");
  });

  await check("código do projeto e work item", () => {
    const draft = parseWithRules("1h30 daily CID-001 #4512", context);
    assert.equal(draft.durationMinutes, 90);
    assert.equal(draft.azureWorkItemId, 4512);
    assert.equal(draft.description, "Daily");
  });

  const realWorld = {
    today: "2026-10-06",
    managerName: "Rômulo Louzada",
    recentProjectIds: ["cid", "arc2"],
    projects: [
      ["cid", "Cidade Engenharia - Painel Estratégico", "CIDADE-ENGENH-951E14"],
      ["vix", "SHOPPING VIX - Atendimento Lojista", "SHOPPING-VIX-ATEND"],
      [
        "ape",
        "APERAM - Sequenciamento Otimizado de Tesouras",
        "APERAM-SEQUEN-365DAA",
      ],
      ["arc1", "ARCELOR MITTAL - Antônio", "ARCELOR-MITTA-C7F60A"],
      ["arc2", "ARCELOR MITTAL - Estivagem", "ARCELOR-MITTAL-ESTIV"],
      ["gab", "GAB - Suporte", "GAB-SUPORTE-72FE48"],
      ["vit", "Shopping Vitória", "SHOP-VIT"],
    ].map(([id, name, code]) => ({
      id: id ?? "",
      name: name ?? "",
      code: code ?? "",
      billable: true,
      clientName: null,
    })),
  };

  await check("frases reais do Teams: cliente citado e narrativa", () => {
    const vix = parseWithRules(
      "Tive uma reunião de 2 horas com o Júnio e Pedras sobre projeto shopping vix",
      realWorld,
    );
    assert.equal(vix.projectId, "vix");
    assert.equal(vix.projectGuessed, false);
    assert.equal(vix.description, "Reunião com o Júnio e Pedras");

    const aperam = parseWithRules(
      "registre 2 horas no projeto da aperam, estava fazendo configuração de ambiente",
      realWorld,
    );
    assert.equal(aperam.projectId, "ape");
    assert.equal(aperam.description, "Configuração de ambiente");
  });

  await check(
    "acento ignorado e cliente com vários projetos pede conferência",
    () => {
      const vitoria = parseWithRules(
        "2h no shopping vitoria levantamento de requisitos",
        realWorld,
      );
      assert.equal(vitoria.projectId, "vit");
      assert.equal(vitoria.description, "Levantamento de requisitos");

      const arcelor = parseWithRules(
        "1h na arcelor mittal revisão do plano",
        realWorld,
      );
      assert.equal(arcelor.projectId, "arc2", "o mais usado do cliente");
      assert.equal(arcelor.projectGuessed, true);
    },
  );

  await check(
    "palavra genérica não vira projeto certo nem some do texto",
    () => {
      const draft = parseWithRules("45min de suporte ao cliente", realWorld);
      assert.equal(draft.projectGuessed, true);
      assert.equal(draft.description, "Suporte ao cliente");
    },
  );

  await check("meia hora e dia da semana", () => {
    const draft = parseWithRules(
      "anota meia hora de code review na segunda",
      context,
    );
    assert.equal(draft.durationMinutes, 30);
    assert.equal(draft.date, "2026-10-05");
    assert.equal(draft.description, "Code review");
  });

  await check("datas nunca no futuro", () => {
    assert.equal(parseDateText("dia 20", context.today), "2026-09-20");
    assert.equal(parseDateText("25/12", context.today), "2025-12-25");
    assert.equal(parseDateText("na terça", context.today), "2026-10-06");
    assert.equal(parseDateText("sábado", context.today), "2026-10-03");
  });

  await check("janela de datas do PRD (sem futuro, até 30 dias)", () => {
    assert.equal(validateDraftDate("2026-10-06", context.today), null);
    assert.match(
      validateDraftDate("2026-10-07", context.today) ?? "",
      /futuras/,
    );
    assert.match(
      validateDraftDate("2026-09-01", context.today) ?? "",
      /30 dias/,
    );
  });

  console.log("Guarda-corpos do modelo");

  await check("código inventado pelo modelo é ignorado", () => {
    const rules = parseWithRules("registre 1h de reunião", context);
    const draft = mergeWithRules(
      { intent: "log_time", projectCode: "XYZ-999", projectNamedByUser: true },
      rules,
      context,
    );
    assert.equal(draft.projectId, rules.projectId);
    assert.equal(draft.projectGuessed, true);
  });

  await check("projeto citado pelo usuário vence o palpite do modelo", () => {
    const rules = parseWithRules("1h no Portal revisão", context);
    const draft = mergeWithRules(
      { intent: "log_time", projectCode: "OPT-000", projectNamedByUser: false },
      rules,
      context,
    );
    assert.equal(draft.projectId, "p-por");
    assert.equal(draft.projectGuessed, false);
  });

  await check("data futura do modelo cai para a das regras", () => {
    const rules = parseWithRules("1h de reunião ontem", context);
    const draft = mergeWithRules(
      { intent: "log_time", date: "2026-12-01", durationMinutes: 60 },
      rules,
      context,
    );
    assert.equal(draft.date, "2026-10-05");
  });

  console.log("Cards");

  const draft = parseWithRules(
    "registre 1h30 de reunião com meu líder",
    context,
  );
  const ids = { proposalId: "prop-1", requesterOid: "oid-1" };

  await check("card de proposta no chat usa Action.Execute", () => {
    const card = buildProposalCard({
      surface: "message",
      ...ids,
      draft,
      projects: context.projects,
    });
    const actions = card.actions as Array<Record<string, unknown>>;
    assert.equal(card.version, "1.5");
    assert.deepEqual(
      actions.map((a) => [a.type, a.verb]),
      [
        ["Action.Execute", "log.confirm"],
        ["Action.Execute", "log.cancel"],
      ],
    );
    const json = JSON.stringify(card);
    for (const id of [
      "projectId",
      "duration",
      "date",
      "description",
      "billable",
    ]) {
      assert.ok(json.includes(`"id":"${id}"`), `input ${id}`);
    }
    assert.ok(json.includes('"value":"1h30"'));
    assert.ok(
      json.includes("sugerido automaticamente"),
      "aviso de projeto sugerido",
    );
  });

  await check("card no diálogo usa Action.Submit com action no data", () => {
    const card = buildProposalCard({
      surface: "dialog",
      ...ids,
      draft,
      projects: context.projects,
    });
    const actions = card.actions as Array<{
      type: string;
      data: { action: string };
    }>;
    assert.ok(actions.every((a) => a.type === "Action.Submit"));
    assert.equal(actions[0]?.data.action, "log.confirm");
    const request = buildRequestCard(ids);
    assert.ok(JSON.stringify(request).includes('"id":"request"'));
  });

  await check("card de sucesso oferece desfazer", () => {
    const card = buildLoggedCard({
      surface: "message",
      ...ids,
      projectLabel: "CID-001 · Cidade Engenharia",
      date: "2026-10-06",
      durationMinutes: 90,
      description: "Reunião",
      dayTotalLabel: "3h",
    });
    assert.ok(JSON.stringify(card).includes('"verb":"log.undo"'));
  });

  await check("inputs do card voltam ao rascunho", () => {
    const back = readInputs(
      {
        projectId: "p-cid",
        duration: "1h30",
        date: "2026-10-05",
        description: " Daily ",
        workItemId: "12",
      },
      context.today,
    );
    assert.equal(back.durationMinutes, 90);
    assert.equal(back.description, "Daily");
    assert.equal(back.azureWorkItemId, 12);
    assert.equal(minutesToInput(45), "45min");
    assert.equal(minutesToInput(120), "2h");
  });

  console.log("Pacote do app");

  const APP_ID = "11111111-2222-3333-4444-555555555555";

  await check("manifest declara bot e extensão em qualquer conversa", () => {
    const manifest = buildTeamsManifest(APP_ID) as {
      id: string;
      bots: Array<{ botId: string; scopes: string[] }>;
      composeExtensions: Array<{
        commands: Array<{
          type: string;
          context: string[];
          fetchTask: boolean;
        }>;
      }>;
    };
    assert.equal(manifest.id, APP_ID);
    assert.deepEqual(manifest.bots[0]?.scopes, [
      "personal",
      "groupChat",
      "team",
    ]);
    const command = manifest.composeExtensions[0]?.commands[0];
    assert.equal(command?.type, "action");
    assert.equal(command?.fetchTask, true);
    assert.deepEqual(command?.context, ["compose", "commandBox", "message"]);
  });

  interface ZipFile {
    name: string;
    data: Buffer;
  }

  function readZip(zip: Buffer): ZipFile[] {
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    assert.ok(end > 0, "EOCD presente");
    const count = zip.readUInt16LE(end + 10);
    let cursor = zip.readUInt32LE(end + 16);
    const files: ZipFile[] = [];

    for (let i = 0; i < count; i++) {
      assert.equal(zip.readUInt32LE(cursor), 0x02014b50, "central header");
      const crc = zip.readUInt32LE(cursor + 16);
      const size = zip.readUInt32LE(cursor + 20);
      const nameLength = zip.readUInt16LE(cursor + 28);
      const localOffset = zip.readUInt32LE(cursor + 42);
      const name = zip
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString("utf8");

      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const dataStart = localOffset + 30 + localNameLength;
      const data = zip.subarray(dataStart, dataStart + size);
      assert.equal(crc32(data), crc, `CRC de ${name}`);

      files.push({ name, data });
      cursor += 46 + nameLength;
    }
    return files;
  }

  function readPngSize(png: Buffer): { width: number; height: number } {
    assert.deepEqual(
      [...png.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  }

  await check("zip válido com manifest e ícones nos tamanhos do Teams", () => {
    const files = readZip(buildTeamsAppPackage(APP_ID));
    assert.deepEqual(
      files.map((f) => f.name),
      ["manifest.json", "color.png", "outline.png"],
    );
    const manifest = JSON.parse(files[0]?.data.toString("utf8") ?? "{}") as {
      id: string;
    };
    assert.equal(manifest.id, APP_ID);
    assert.deepEqual(readPngSize(files[1]?.data ?? Buffer.alloc(0)), {
      width: 192,
      height: 192,
    });
    assert.deepEqual(readPngSize(files[2]?.data ?? Buffer.alloc(0)), {
      width: 32,
      height: 32,
    });
  });

  await check("ícone outline é branco sobre transparente", () => {
    const files = readZip(buildTeamsAppPackage(APP_ID));
    const png = files[2]?.data ?? Buffer.alloc(0);
    const idat = png.indexOf(Buffer.from("IDAT"));
    const length = png.readUInt32BE(idat - 4);
    const raw = inflateSync(png.subarray(idat + 4, idat + 4 + length));
    let transparent = 0;
    let opaqueWhite = 0;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const at = y * (32 * 4 + 1) + 1 + x * 4;
        if (raw[at + 3] === 0) transparent++;
        if (raw[at + 3] === 255 && raw[at] === 255) opaqueWhite++;
      }
    }
    assert.ok(transparent > 400, "fundo transparente");
    assert.ok(opaqueWhite > 50, "glifo branco");
  });

  console.log("Segurança");

  await check(
    "requisição sem token ou com token malformado é recusada",
    async () => {
      const activity = { serviceUrl: "https://smba.trafficmanager.net/br/" };
      assert.deepEqual(await verifyInboundRequest(null, activity, APP_ID), {
        ok: false,
        reason: "missing_token",
      });
      assert.deepEqual(
        await verifyInboundRequest("Bearer not.a.jwt", activity, APP_ID),
        {
          ok: false,
          reason: "invalid_token",
        },
      );
    },
  );

  await check("serviceUrl fora da Microsoft é recusado (SSRF)", () => {
    assert.ok(isTrustedServiceUrl("https://smba.trafficmanager.net/br/"));
    assert.ok(
      isTrustedServiceUrl("https://smba.infra.gcc.teams.microsoft.com/"),
    );
    assert.ok(!isTrustedServiceUrl("https://evil.example.com/"));
    assert.ok(!isTrustedServiceUrl("https://trafficmanager.net.evil.com/"));
    assert.ok(!isTrustedServiceUrl("http://smba.trafficmanager.net/br/"));
    assert.ok(!isTrustedServiceUrl("http://localhost:3978/"));
  });

  console.log(`\n${passed} verificações do app do Teams passaram.`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
