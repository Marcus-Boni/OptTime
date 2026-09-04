"use client";

import {
  AlertTriangle,
  ExternalLink,
  HelpCircle,
  Info,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CopyBlock } from "@/components/integrations/mcp/CopyBlock";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Used until the browser reports the real origin, and on the server. */
const FALLBACK_ORIGIN = "https://opt-time.optsolv.com.br";

const POWER_AUTOMATE_URL = "https://make.powerautomate.com";

/** The expression that forwards our card into the Teams message. */
const CARD_EXPRESSION = "string(triggerBody()?['attachments']?[0]?['content'])";

const ACTION_FIELDS: Array<{ label: string; value: string }> = [
  { label: "Postar como", value: "Bot do Fluxo" },
  { label: "Postar em", value: "Chat com o Bot do Fluxo" },
  { label: "Destinatário", value: "você mesmo" },
  { label: "Cartão adaptável", value: "a expressão do passo 4" },
];

const TROUBLESHOOTING: Array<{ symptom: string; cause: string }> = [
  {
    symptom: "Erro 401",
    cause: "“Quem pode disparar” não está em “Qualquer pessoa” (passo 2).",
  },
  {
    symptom: "Erro 400",
    cause:
      "Acentos quebrados pelo PowerShell — use o comando desta tela, que já força UTF-8.",
  },
  {
    symptom: "Nada chega no Teams",
    cause:
      "Veja “Histórico de execuções (28 dias)” no fluxo: o erro exato aparece lá.",
  },
];

/**
 * Builds the manual smoke test for a freshly created flow.
 *
 * PowerShell 5.1 encodes a string `-Body` with the system codepage, which turns
 * the card's accents into bytes the service rejects as malformed JSON — hence
 * the explicit UTF-8 conversion. The `try/catch` exists because
 * `Invoke-RestMethod` swallows the response body and reports only the status.
 */
function buildTestCommand(origin: string): string {
  const card = `{"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive","content":{"type":"AdaptiveCard","version":"1.4","msteams":{"width":"Full"},"body":[{"type":"TextBlock","text":"🌆 Fim de dia — teste","weight":"Bolder","size":"Large","wrap":true},{"type":"TextBlock","text":"Você registrou **6h** hoje. Faltam **2h** para fechar o dia.","wrap":true}],"actions":[{"type":"Action.OpenUrl","title":"✨ Preencher meu dia com IA","url":"${origin}/dashboard/time?reconstruct=1"}]}}]}`;

  return [
    "$url = 'COLE_AQUI_A_URL_DO_FLUXO'",
    `$body = '${card}'`,
    "try { Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($body)); Write-Host \"OK - enviado\" -ForegroundColor Green } catch { $s = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); Write-Host $s.ReadToEnd() -ForegroundColor Yellow }",
  ].join("\n");
}

interface CalloutProps {
  tone: "info" | "warning" | "neutral";
  icon: ReactNode;
  children: ReactNode;
}

function Callout({ tone, icon, children }: CalloutProps) {
  const toneClass =
    tone === "warning"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : tone === "info"
        ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
        : "bg-muted/60 text-muted-foreground";

  return (
    <div className={`flex gap-2 rounded-lg px-3 py-2 text-xs ${toneClass}`}>
      <span className="mt-px shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="space-y-1 leading-relaxed">{children}</div>
    </div>
  );
}

interface GuideStepProps {
  index: number;
  title: string;
  children: ReactNode;
}

function GuideStep({ index, title, children }: GuideStepProps) {
  return (
    <li className="relative pl-9">
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 flex size-6 items-center justify-center rounded-full bg-brand-500/10 font-mono text-xs font-semibold text-brand-500"
      >
        {index}
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-1.5 space-y-2 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </li>
  );
}

/** A quoted label exactly as Power Automate spells it, to aid scanning. */
function UiLabel({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">“{children}”</span>;
}

/**
 * Step-by-step guide for creating the personal Power Automate flow.
 *
 * Lives next to the webhook field because the flow is built entirely outside
 * this app: without it, the only instructions are a one-line hint that assumes
 * the reader already knows Power Automate.
 */
export function PersonalWebhookGuide() {
  const [origin, setOrigin] = useState(FALLBACK_ORIGIN);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-brand-500 hover:text-brand-600"
        >
          <HelpCircle className="size-3.5" aria-hidden="true" />
          Como configurar
        </Button>
      </DialogTrigger>

      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            Receber o lembrete no Teams
          </DialogTitle>
          <DialogDescription>
            Cinco passos no Power Automate, cerca de 5 minutos. Sem custo — o
            fluxo usa apenas conectores inclusos no Microsoft 365.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 flex-1 space-y-5 overflow-y-auto px-6 py-1">
          <Callout tone="info" icon={<Info className="size-3.5" />}>
            <p>
              <strong>Isto é opcional.</strong> Sem webhook, o lembrete das
              17h30 chega no seu e-mail sem precisar configurar nada. O fluxo
              serve apenas para recebê-lo no chat do Teams.
            </p>
          </Callout>

          <ol className="space-y-5">
            <GuideStep index={1} title="Criar o fluxo">
              <p>
                Abra o{" "}
                <a
                  href={POWER_AUTOMATE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-brand-500 hover:underline"
                >
                  Power Automate
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>{" "}
                com sua conta OptSolv e vá em <UiLabel>Criar</UiLabel> →{" "}
                <UiLabel>Fluxo de nuvem instantâneo</UiLabel>.
              </p>
              <p>
                Dê um nome (ex.: <em>OptSolv — Lembrete no Teams</em>) e escolha
                o gatilho{" "}
                <UiLabel>
                  Quando uma solicitação de webhook do Teams é recebida
                </UiLabel>
                .
              </p>
            </GuideStep>

            <GuideStep index={2} title="Liberar o disparo">
              <p>
                Clique no bloco do gatilho. No campo{" "}
                <UiLabel>Quem pode disparar o fluxo?</UiLabel>, selecione{" "}
                <UiLabel>Qualquer pessoa</UiLabel>.
              </p>
              <Callout
                tone="warning"
                icon={<AlertTriangle className="size-3.5" />}
              >
                <p>
                  É o passo que mais gente erra. Nas outras opções o Power
                  Automate exige um token da Microsoft em cada chamada, e o
                  OptSolv envia apenas o card — o resultado é erro{" "}
                  <code className="font-mono">401</code> e nenhum lembrete. A
                  URL gerada já é longa e secreta; é ela que protege o fluxo.
                </p>
              </Callout>
            </GuideStep>

            <GuideStep index={3} title="Adicionar a ação de envio">
              <p>
                <UiLabel>+ Nova etapa</UiLabel> → busque{" "}
                <span className="font-mono text-foreground">Teams</span> →
                escolha <UiLabel>Postar cartão em um chat ou canal</UiLabel>.
                Preencha:
              </p>
              <dl className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60">
                {ACTION_FIELDS.map((field) => (
                  <div
                    key={field.label}
                    className="flex items-baseline justify-between gap-3 px-3 py-1.5"
                  >
                    <dt>{field.label}</dt>
                    <dd className="text-right font-medium text-foreground">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </GuideStep>

            <GuideStep index={4} title="Preencher o “Cartão adaptável”">
              <p>
                Esse campo não aceita conteúdo dinâmico da lista: clique nele,
                abra a aba <UiLabel>Expressão</UiLabel> (<em>fx</em>) e cole
                exatamente:
              </p>
              <CopyBlock code={CARD_EXPRESSION} language="text" />
              <p>
                É o que repassa o card do OptSolv inteiro, com os botões
                funcionando.
              </p>
            </GuideStep>

            <GuideStep index={5} title="Salvar e colar a URL aqui">
              <p>
                Salve o fluxo, volte ao bloco do gatilho e copie a{" "}
                <UiLabel>URL HTTP</UiLabel> que apareceu. Cole no campo{" "}
                <UiLabel>Webhook pessoal do Teams</UiLabel> e clique em Salvar.
              </p>
              <p>
                Depois, ligue <UiLabel>Lembrete vespertino</UiLabel> logo acima.
              </p>
            </GuideStep>
          </ol>

          <section className="space-y-2 border-t border-border/60 pt-4">
            <h3 className="text-sm font-semibold text-foreground">
              Testar sem esperar as 17h30
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Este campo não tem botão de teste. Para conferir agora, cole a URL
              na primeira linha e rode no PowerShell — deve chegar um card no
              seu chat com o <em>Bot do Fluxo</em>.
            </p>
            <CopyBlock code={buildTestCommand(origin)} language="bash" />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Se algo der errado
            </h3>
            <dl className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/60 text-xs">
              {TROUBLESHOOTING.map((item) => (
                <div key={item.symptom} className="px-3 py-2">
                  <dt className="font-medium text-foreground">
                    {item.symptom}
                  </dt>
                  <dd className="text-muted-foreground">{item.cause}</dd>
                </div>
              ))}
            </dl>
            <Callout tone="neutral" icon={<Wallet className="size-3.5" />}>
              <p>
                <strong className="text-foreground">Sobre custo:</strong> os
                dois blocos acima são do conector Microsoft Teams, que é{" "}
                <em>standard</em> e já vem na licença Microsoft 365. Evite o
                gatilho{" "}
                <UiLabel>Quando uma solicitação HTTP é recebida</UiLabel>: ele
                parece o caminho óbvio, mas é <em>premium</em> e cobrado à
                parte.
              </p>
            </Callout>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
