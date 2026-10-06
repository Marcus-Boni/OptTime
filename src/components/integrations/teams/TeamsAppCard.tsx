"use client";

import {
  AtSign,
  ExternalLink,
  MessageSquareText,
  Sparkles,
  SquarePlus,
} from "lucide-react";
import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TeamsAppAvailability {
  available: boolean;
  appId: string | null;
}

export interface TeamsAppCardProps {
  app: TeamsAppAvailability | null;
}

interface UsageMode {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  where: string;
  example: string;
}

const USAGE_MODES: UsageMode[] = [
  {
    icon: MessageSquareText,
    title: "Chat privado com o app",
    where:
      "Abra o OptSolv Time na barra lateral do Teams e escreva do seu jeito.",
    example: "registre 1h de reunião com meu líder",
  },
  {
    icon: SquarePlus,
    title: "Em qualquer conversa",
    where:
      "No compositor de qualquer chat, grupo ou canal — inclusive o chat consigo mesmo: + → OptSolv Time → Registrar horas. Ou ⋯ → Mais ações em uma mensagem.",
    example: "2h30 no CID-001 ajuste no módulo de obras ontem",
  },
  {
    icon: AtSign,
    title: "Mencionando em grupos e canais",
    where: "Com o app adicionado à conversa, mencione-o seguido do pedido.",
    example: "@OptSolv Time registre 45min de daily",
  },
];

/** Teams deep link that opens the app's install/details page. */
function buildInstallLink(appId: string): string {
  return `https://teams.microsoft.com/l/app/${encodeURIComponent(appId)}`;
}

export default function TeamsAppCard({ app }: TeamsAppCardProps) {
  const available = Boolean(app?.available && app.appId);

  return (
    <Card data-tour="teams-app">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 font-display text-base">
          <Sparkles className="size-4 text-brand-500" aria-hidden="true" />
          App OptSolv Time no Teams
          {available ? (
            <Badge className="bg-emerald-500/15 text-[10px] text-emerald-600 dark:text-emerald-400">
              Disponível
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              Aguardando o admin
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Registre horas em linguagem natural sem sair do Teams. Nada é lançado
          sem a sua confirmação, e suas horas só aparecem no seu chat privado
          com o app.
        </p>

        <ul className="space-y-2">
          {USAGE_MODES.map((mode) => (
            <li
              key={mode.title}
              className="flex gap-3 rounded-lg border border-border/60 px-3 py-2.5"
            >
              <mode.icon
                className="mt-0.5 size-4 shrink-0 text-brand-500"
                aria-hidden
              />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{mode.title}</p>
                <p className="text-xs text-muted-foreground">{mode.where}</p>
                <code className="block break-words font-mono text-xs text-brand-500">
                  {mode.example}
                </code>
              </div>
            </li>
          ))}
        </ul>

        {available && app?.appId ? (
          <Button asChild variant="outline" size="sm">
            <a
              href={buildInstallLink(app.appId)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Abrir no Teams
            </a>
          </Button>
        ) : (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            O app ainda não foi publicado na organização. Assim que o admin
            concluir a configuração, ele aparece em “Aplicativos → Criado para
            sua organização” no Teams.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
