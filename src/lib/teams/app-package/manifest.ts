/**
 * Teams app manifest + package for the OptSolv Time app.
 *
 * One app, two surfaces sharing the same Azure Bot:
 * - a bot in personal chat, group chats and channels (natural language);
 * - a message-extension action, "Registrar horas", available in the compose
 *   box of ANY chat or channel (including the chat with yourself) and in the
 *   "⋯ → Mais ações" menu of any message.
 *
 * The package is generated on demand from the stored bot App ID, so there is
 * no manifest file to keep in sync with the environment.
 */

import { getServerAppUrl } from "@/lib/app-url";
import { createZip } from "@/lib/teams/app-package/binary";
import {
  renderColorIcon,
  renderOutlineIcon,
} from "@/lib/teams/app-package/icons";

/**
 * Bump on every change to the manifest — Teams only offers an update to
 * installed clients when this version increases.
 */
export const TEAMS_APP_VERSION = "1.0.0";
export const TEAMS_APP_SHORT_NAME = "OptSolv Time";
export const LOG_TIME_COMMAND_ID = "logTime";

const MANIFEST_VERSION = "1.19";

export function buildTeamsManifest(botAppId: string): Record<string, unknown> {
  const appUrl = getServerAppUrl();
  const host = new URL(appUrl).host;

  return {
    $schema: `https://developer.microsoft.com/json-schemas/teams/v${MANIFEST_VERSION}/MicrosoftTeams.schema.json`,
    manifestVersion: MANIFEST_VERSION,
    version: TEAMS_APP_VERSION,
    id: botAppId,
    developer: {
      name: "OptSolv",
      websiteUrl: appUrl,
      privacyUrl: appUrl,
      termsOfUseUrl: appUrl,
    },
    name: {
      short: TEAMS_APP_SHORT_NAME,
      full: "OptSolv Time — registro de horas",
    },
    description: {
      short: "Registre horas sem sair do Teams, em linguagem natural.",
      full: "Registre horas no OptSolv Time direto do Teams. Escreva “registre 1h de reunião com meu líder” no chat do app, mencione @OptSolv Time em um grupo ou canal, ou use “Registrar horas” no compositor de qualquer conversa — inclusive no chat consigo mesmo. Nada é lançado sem sua confirmação, e suas horas só aparecem no seu chat privado.",
    },
    icons: { color: "color.png", outline: "outline.png" },
    accentColor: "#F97316",
    bots: [
      {
        botId: botAppId,
        scopes: ["personal", "groupChat", "team"],
        isNotificationOnly: false,
        supportsFiles: false,
        supportsCalling: false,
        supportsVideo: false,
        commandLists: [
          {
            scopes: ["personal", "groupChat", "team"],
            commands: [
              {
                title: "registre",
                description: "Ex.: registre 1h de reunião com meu líder",
              },
              { title: "hoje", description: "Suas horas de hoje (no privado)" },
              { title: "semana", description: "Resumo da semana (no privado)" },
              {
                title: "timer start",
                description: "timer start <projeto> | <descrição>",
              },
              { title: "timer stop", description: "Para o timer e registra" },
              { title: "ajuda", description: "O que eu sei fazer" },
            ],
          },
        ],
      },
    ],
    composeExtensions: [
      {
        botId: botAppId,
        commands: [
          {
            id: LOG_TIME_COMMAND_ID,
            type: "action",
            title: "Registrar horas",
            description: "Lance horas no OptSolv Time sem sair da conversa",
            context: ["compose", "commandBox", "message"],
            fetchTask: true,
          },
        ],
      },
    ],
    permissions: ["identity", "messageTeamMembers"],
    validDomains: [host],
  };
}

export function buildTeamsAppPackage(botAppId: string): Buffer {
  const manifest = JSON.stringify(buildTeamsManifest(botAppId), null, 2);

  return createZip([
    { name: "manifest.json", data: Buffer.from(manifest, "utf8") },
    { name: "color.png", data: renderColorIcon() },
    { name: "outline.png", data: renderOutlineIcon() },
  ]);
}
