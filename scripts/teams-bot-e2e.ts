/**
 * End-to-end run of the Teams app handlers against the dev database.
 *
 * Teams itself is replaced by a local fake Bot Connector that records every
 * activity the bot sends, and inbound JWT checks are bypassed with the
 * dev-only TEAMS_BOT_DEV_SKIP_AUTH flag. Everything else is real: identity
 * resolution, project access, the model (when a provider key is set), the
 * ledger and the time-entry service. Fixtures are ephemeral and removed at
 * the end.
 *
 *   pnpm verify:teams-bot:e2e
 *
 * Confirm/undo and private replies need migration 0028; without it those
 * phases are skipped with a warning.
 */

import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

process.env.TEAMS_BOT_DEV_SKIP_AUTH = "true";

interface Captured {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

async function readBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function main(): Promise<number> {
  const { sql, eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { user, teamsBotAction, teamsBotConversation } = await import(
    "@/lib/db/schema"
  );
  const harness = await import("./mcp-e2e/harness");
  const { handleActivity, handleInvoke } = await import(
    "@/lib/teams/bot/handlers"
  );
  const { shiftDay, todayInAppTimeZone } = await import("@/lib/timezone");
  const { sendPersonalCard } = await import("@/lib/teams/bot/proactive");

  const captured: Captured[] = [];
  const connector = createServer(async (req, res) => {
    const body = await readBody(req);
    captured.push({ method: req.method ?? "", path: req.url ?? "", body });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      res.statusCode = 404;
      res.end("{}");
      return;
    }
    res.end(
      JSON.stringify({
        id: req.url === "/v3/conversations" ? "personal-conv-e2e" : "act-e2e",
      }),
    );
  });
  await new Promise<void>((resolve) => connector.listen(0, resolve));
  const serviceUrl = `http://localhost:${(connector.address() as AddressInfo).port}/`;

  const credentials = {
    appId: "00000000-0000-0000-0000-00000000e2e0",
    appPassword: "dev",
    tenantId: "tenant-e2e",
  };

  const takeSent = (): Captured[] => captured.splice(0, captured.length);
  const sentCards = (items: Captured[]) =>
    items
      .filter((item) => item.method === "POST" && item.body.type === "message")
      .flatMap(
        (item) =>
          (item.body.attachments as Array<{ content: unknown }> | undefined) ??
          [],
      )
      .map((attachment) => JSON.stringify(attachment.content));
  const sentTexts = (items: Captured[]) =>
    items
      .filter(
        (item) => item.method === "POST" && typeof item.body.text === "string",
      )
      .map((item) => item.body.text as string);

  const memberOid = crypto.randomUUID();
  const strangerOid = crypto.randomUUID();
  const today = todayInAppTimeZone();

  const migrated = await db
    .execute(sql`select to_regclass('public.teams_bot_action') as name`)
    .then((result) => Boolean((result.rows[0] as { name: unknown })?.name));

  try {
    harness.phase("Fixtures");
    const lead = await harness.makeUser("teams-lead", { role: "manager" });
    const member = await harness.makeUser("teams-member");
    await db
      .update(user)
      .set({ managerId: lead.id, azureId: memberOid })
      .where(eq(user.id, member.id));
    const projectRow = await harness.makeProject("teams", [member.id], {
      managerId: lead.id,
    });
    harness.info(
      `projeto ${projectRow.code}, migração 0028: ${migrated ? "sim" : "não"}`,
    );

    const baseActivity = (overrides: Record<string, unknown> = {}) => ({
      type: "message",
      id: `msg-${crypto.randomUUID().slice(0, 6)}`,
      serviceUrl,
      channelId: "msteams",
      from: { id: "29:member", name: member.name, aadObjectId: memberOid },
      recipient: { id: `28:${credentials.appId}`, name: "OptSolv Time" },
      conversation: {
        id: "a:personal-e2e",
        conversationType: "personal" as const,
        tenantId: credentials.tenantId,
      },
      ...overrides,
    });

    harness.phase("Chat privado — linguagem natural");
    await handleActivity(
      baseActivity({ text: "registre 1 hora de reunião com meu líder" }),
      credentials,
    );
    let sent = takeSent();
    harness.check(
      "envia indicador de digitação",
      sent.some((item) => item.body.type === "typing"),
    );
    const proposal = sentCards(sent)[0] ?? "";
    harness.check(
      "responde com card de proposta",
      proposal.includes("log.confirm"),
      proposal.slice(0, 120),
    );
    harness.check(
      'duração "1h"',
      proposal.includes('"id":"duration"') && proposal.includes('"value":"1h"'),
    );
    harness.check(
      "“meu líder” vira o nome do líder",
      proposal.includes(lead.name),
      proposal.match(/"id":"description"[^}]*"value":"([^"]*)"/)?.[1] ?? "",
    );

    harness.phase("Conta não vinculada");
    await handleActivity(
      baseActivity({
        text: "hoje",
        from: {
          id: "29:stranger",
          name: "Visitante",
          aadObjectId: strangerOid,
        },
      }),
      credentials,
    );
    sent = takeSent();
    harness.check(
      "pede para vincular a conta",
      sentCards(sent).some((card) => card.includes("Não encontrei sua conta")),
    );

    harness.phase("Extensão de mensagem — qualquer chat");
    const fetchEmpty = await handleInvoke(
      baseActivity({
        type: "invoke",
        name: "composeExtension/fetchTask",
        value: { commandId: "logTime", commandContext: "compose" },
      }),
      credentials,
    );
    const emptyBody = JSON.stringify(fetchEmpty.body);
    harness.check(
      "abre diálogo com campo livre",
      emptyBody.includes('"id":"request"'),
    );
    const proposalId = emptyBody.match(/"proposalId":"([^"]+)"/)?.[1] ?? "";

    const parsed = await handleInvoke(
      baseActivity({
        type: "invoke",
        name: "composeExtension/submitAction",
        value: {
          commandId: "logTime",
          data: {
            action: "dialog.parse",
            proposalId,
            requesterOid: memberOid,
            request: `2h30 no ${projectRow.code} revisão de PR ontem`,
          },
        },
      }),
      credentials,
    );
    const parsedBody = JSON.stringify(parsed.body);
    harness.check(
      "projeto citado vem selecionado",
      parsedBody.includes(`"value":"${projectRow.id}"`),
    );
    harness.check('duração "2h30"', parsedBody.includes('"value":"2h30"'));
    harness.check(
      "data de ontem",
      parsedBody.includes(`"value":"${shiftDay(today, -1)}"`),
    );

    const fromMessage = await handleInvoke(
      baseActivity({
        type: "invoke",
        name: "composeExtension/fetchTask",
        value: {
          commandId: "logTime",
          commandContext: "message",
          messagePayload: {
            body: {
              contentType: "html",
              content:
                "<p>Pessoal, foram 45min de alinhamento com o cliente.</p>",
            },
          },
        },
      }),
      credentials,
    );
    harness.check(
      "“⋯ → Mais ações” lê a mensagem original",
      JSON.stringify(fromMessage.body).includes('"value":"45min"'),
    );

    if (!migrated) {
      harness.warn(
        "confirmar/desfazer e respostas privadas não testados",
        "aplique a migração 0028 (pnpm db:migrate) e rode de novo",
      );
      return harness.summary();
    }

    harness.phase("Confirmar, idempotência e desfazer");
    const actionId = crypto.randomUUID();
    const confirmActivity = (oid: string, verb: string) =>
      baseActivity({
        type: "invoke",
        name: "adaptiveCard/action",
        from: { id: "29:member", name: member.name, aadObjectId: oid },
        value: {
          action: {
            type: "Action.Execute",
            verb,
            data: {
              action: verb,
              proposalId: actionId,
              requesterOid: memberOid,
              projectId: projectRow.id,
              duration: "1h30",
              date: today,
              description: "Reunião com o líder (e2e)",
              billable: "false",
            },
          },
        },
      });

    const refused = await handleInvoke(
      confirmActivity(strangerOid, "log.confirm"),
      credentials,
    );
    harness.check(
      "outra pessoa não confirma o card",
      JSON.stringify(refused.body).includes("Só quem pediu"),
    );

    const confirmed = await handleInvoke(
      confirmActivity(memberOid, "log.confirm"),
      credentials,
    );
    const confirmedBody = JSON.stringify(confirmed.body);
    harness.check(
      "lança e mostra card de sucesso",
      confirmedBody.includes("registradas"),
      confirmedBody.slice(0, 200),
    );

    const ledger = await db.query.teamsBotAction.findFirst({
      where: eq(teamsBotAction.id, actionId),
    });
    harness.check(
      "ledger guarda o lançamento",
      ledger?.status === "logged" && Boolean(ledger.entryId),
    );

    const again = await handleInvoke(
      confirmActivity(memberOid, "log.confirm"),
      credentials,
    );
    harness.check(
      "clique duplo não duplica",
      JSON.stringify(again.body).includes("já foi registrado"),
    );

    const undone = await handleInvoke(
      confirmActivity(memberOid, "log.undo"),
      credentials,
    );
    harness.check(
      "desfazer remove o lançamento",
      JSON.stringify(undone.body).includes("desfeito"),
    );

    harness.phase("Privacidade em grupo");
    // Forget the 1:1 stored by the personal phase, so the bot has to open
    // the private chat from the group activity itself.
    await db
      .delete(teamsBotConversation)
      .where(eq(teamsBotConversation.userId, member.id));
    takeSent();
    await handleActivity(
      baseActivity({
        text: "<at>OptSolv Time</at> hoje",
        conversation: {
          id: "19:group-e2e",
          conversationType: "groupChat",
          tenantId: credentials.tenantId,
        },
      }),
      credentials,
    );
    sent = takeSent();
    harness.check(
      "abre o chat privado",
      sent.some((item) => item.path === "/v3/conversations"),
    );
    harness.check(
      "horas vão para o privado",
      sent.some(
        (item) =>
          item.path.includes("personal-conv-e2e") &&
          String(item.body.text).includes("Hoje"),
      ),
    );
    harness.check(
      "grupo recebe só o aviso",
      sentTexts(sent).some((text) => text.includes("chat privado")),
    );

    harness.phase("Lembrete proativo pelo chat do app");
    const delivered = await sendPersonalCard(
      member.id,
      { type: "AdaptiveCard", version: "1.4", body: [] },
      "Feche seu dia",
      { enabled: true, credentials },
    );
    sent = takeSent();
    harness.check("entrega no chat privado gravado", delivered === "sent");
    harness.check(
      "card vai para a conversa pessoal",
      sent.some(
        (item) =>
          item.path.includes("personal-conv-e2e") &&
          item.body.summary === "Feche seu dia",
      ),
    );
    const unknownUser = await sendPersonalCard(
      lead.id,
      { type: "AdaptiveCard", version: "1.4", body: [] },
      "Feche seu dia",
      { enabled: true, credentials },
    );
    harness.check(
      "sem app instalado cai no próximo canal",
      unknownUser === "unavailable",
    );

    await db.delete(teamsBotAction).where(eq(teamsBotAction.userId, member.id));
    await db
      .delete(teamsBotConversation)
      .where(eq(teamsBotConversation.userId, member.id));

    assert.ok(true);
    return harness.summary();
  } finally {
    const result = await harness.cleanup();
    harness.info(`limpeza: ${result.detail}`);
    connector.close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
