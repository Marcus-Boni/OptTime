"use client";

import {
  AudioLines,
  Check,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Volume2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ActionTooltip } from "@/components/ui/tooltip";
import {
  type OperatorActionOption,
  useOperatorPolicy,
} from "@/hooks/use-operator-policy";
import { OPERATOR_MODE_META } from "@/lib/ai/operator/policy";
import type {
  OperatorActionCategory,
  OperatorMode,
  OperatorPermission,
} from "@/lib/ai/operator/types";
import { cn } from "@/lib/utils";

const MODES: OperatorMode[] = ["always_ask", "smart", "autopilot"];

const MODE_ICONS: Record<OperatorMode, React.ReactNode> = {
  always_ask: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,
  smart: <Sparkles className="h-4 w-4" aria-hidden="true" />,
  autopilot: <Zap className="h-4 w-4" aria-hidden="true" />,
};

const CATEGORY_META: Record<
  OperatorActionCategory,
  { label: string; hint: string }
> = {
  data: {
    label: "Seus dados",
    hint: "Ações que criam, alteram ou enviam registros.",
  },
  interface: {
    label: "Interface do app",
    hint: "Abrir telas e controlar a interface. Não gravam nada.",
  },
};

const CATEGORY_ORDER: OperatorActionCategory[] = ["data", "interface"];

const RISK_LABELS: Record<OperatorActionOption["risk"], string> = {
  low: "Baixo risco",
  medium: "Risco médio",
  high: "Alto risco",
};

const RISK_STYLES: Record<OperatorActionOption["risk"], string> = {
  low: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  medium: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  high: "border-red-500/30 text-red-600 dark:text-red-400",
};

const VOICE_LOCALES = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "pt-PT", label: "Português (Portugal)" },
  { value: "en-US", label: "Inglês (EUA)" },
  { value: "es-ES", label: "Espanhol (Espanha)" },
];

// ─── Mode picker ─────────────────────────────────────────────────────

function ModeOption({
  mode,
  isActive,
  onSelect,
}: {
  mode: OperatorMode;
  isActive: boolean;
  onSelect: () => void;
}) {
  const meta = OPERATOR_MODE_META[mode];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      className={cn(
        "flex cursor-pointer flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors duration-150",
        isActive
          ? "border-orange-500/50 bg-orange-500/10"
          : "border-border/60 hover:border-orange-500/30",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 font-semibold text-sm",
          isActive ? "text-orange-600 dark:text-orange-400" : "text-foreground",
        )}
      >
        {MODE_ICONS[mode]}
        {meta.label}
        {isActive && (
          <Check
            className="ml-auto h-4 w-4 text-orange-500"
            aria-hidden="true"
          />
        )}
      </span>
      <span className="text-muted-foreground text-xs leading-relaxed">
        {meta.description}
      </span>
    </button>
  );
}

// ─── Per-action row ──────────────────────────────────────────────────

function ActionRow({
  option,
  permission,
  onChange,
}: {
  option: OperatorActionOption;
  permission: OperatorPermission;
  onChange: (next: OperatorPermission) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground text-sm">
          {option.label}
          <Badge
            variant="outline"
            className={cn("h-4 px-1.5 text-[9px]", RISK_STYLES[option.risk])}
          >
            {RISK_LABELS[option.risk]}
          </Badge>
          {!option.canAutoRun && (
            <ActionTooltip
              label="Ações que saem do app ou destroem dados sempre exigem um clique"
              side="top"
            >
              <span className="inline-flex items-center gap-0.5 rounded-full border border-blue-500/30 px-1.5 py-0.5 text-[9px] text-blue-600 dark:text-blue-400">
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                sempre confirma
              </span>
            </ActionTooltip>
          )}
        </p>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {option.description}
        </p>
      </div>

      <Select
        value={permission}
        onValueChange={(value) => onChange(value as OperatorPermission)}
      >
        <SelectTrigger
          className="w-40 shrink-0"
          aria-label={`Permissão para ${option.label}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ask">Pedir confirmação</SelectItem>
          {option.canAutoRun && (
            <SelectItem value="auto">Executar direto</SelectItem>
          )}
          <SelectItem value="never">Não oferecer</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────

export function OperatorSettingsCard() {
  const { settings, actions, isLoading, isSaving, permissionFor, save } =
    useOperatorPolicy();
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function persist(
    input: Parameters<typeof save>[0],
    successMessage: string,
  ) {
    const ok = await save(input);

    if (ok) {
      toast.success(successMessage);
    } else {
      toast.error("Não foi possível salvar as preferências do operador.");
    }
  }

  function handleModeChange(mode: OperatorMode) {
    persist(
      { mode },
      `Modo alterado para “${OPERATOR_MODE_META[mode].label}”.`,
    );
  }

  function handlePermissionChange(
    kind: OperatorActionOption["kind"],
    permission: OperatorPermission,
  ) {
    persist(
      { overrides: { ...settings.overrides, [kind]: permission } },
      "Permissão atualizada.",
    );
  }

  function handleResetOverrides() {
    persist({ overrides: {} }, "Permissões individuais restauradas.");
  }

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <output className="sr-only">
            Carregando as preferências do operador
          </output>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const overrideCount = Object.keys(settings.overrides ?? {}).length;

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-orange-500" aria-hidden="true" />
          Operador de IA
          {isSaving && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
        </CardTitle>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Defina quanto o TimeBot pode fazer por você. Ele opera o sistema —
          lança horas, gera relatórios, abre telas, controla o Modo Foco e avisa
          o time — sempre dentro do que você autorizar aqui.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Autonomy */}
        <fieldset className="space-y-3">
          <legend className="font-medium text-foreground text-sm">
            Nível de autonomia
          </legend>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {MODES.map((mode) => (
              <ModeOption
                key={mode}
                mode={mode}
                isActive={settings.mode === mode}
                onSelect={() => handleModeChange(mode)}
              />
            ))}
          </div>
          <p className="flex items-start gap-1.5 rounded-lg bg-blue-500/10 px-3 py-2 text-[11px] text-blue-700 dark:text-blue-300">
            <ShieldCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              Independentemente do modo, <strong>envio de e-mails</strong>,{" "}
              <strong>aprovações</strong>,{" "}
              <strong>submissão de timesheet</strong> e{" "}
              <strong>exclusões</strong> nunca acontecem sem a sua confirmação.
            </span>
          </p>
        </fieldset>

        <Separator />

        {/* Voice */}
        <fieldset className="space-y-4">
          <legend className="font-medium text-foreground text-sm">
            Comando por voz
          </legend>

          <div className="flex items-center justify-between gap-4">
            <Label
              htmlFor="operator-voice-enabled"
              className="flex flex-col items-start gap-0.5 text-left"
            >
              <span className="flex items-center gap-1.5 font-medium text-sm">
                <AudioLines
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                Ativar comando por voz
              </span>
              <span className="font-normal text-muted-foreground text-xs">
                Ditado no chat e modo mãos-livres com Ctrl+Shift+V. O áudio é
                processado pelo próprio navegador.
              </span>
            </Label>
            <Switch
              id="operator-voice-enabled"
              checked={settings.voiceEnabled}
              onCheckedChange={(checked) =>
                persist(
                  { voiceEnabled: checked },
                  checked ? "Voz ativada." : "Voz desativada.",
                )
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label
              htmlFor="operator-speak-replies"
              className="flex flex-col items-start gap-0.5 text-left"
            >
              <span className="flex items-center gap-1.5 font-medium text-sm">
                <Volume2
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                Ler respostas em voz alta
              </span>
              <span className="font-normal text-muted-foreground text-xs">
                O assistente narra a resposta depois de terminar de escrever.
              </span>
            </Label>
            <Switch
              id="operator-speak-replies"
              checked={settings.speakReplies}
              disabled={!settings.voiceEnabled}
              onCheckedChange={(checked) =>
                persist(
                  { speakReplies: checked },
                  checked ? "Narração ativada." : "Narração desativada.",
                )
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label
              htmlFor="operator-voice-locale"
              className="flex flex-col items-start gap-0.5 text-left"
            >
              <span className="font-medium text-sm">Idioma do microfone</span>
              <span className="font-normal text-muted-foreground text-xs">
                Usado no reconhecimento de fala e na narração.
              </span>
            </Label>
            <Select
              value={settings.voiceLocale}
              disabled={!settings.voiceEnabled}
              onValueChange={(value) =>
                persist({ voiceLocale: value }, "Idioma da voz atualizado.")
              }
            >
              <SelectTrigger
                id="operator-voice-locale"
                className="w-48 shrink-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_LOCALES.map((locale) => (
                  <SelectItem key={locale.value} value={locale.value}>
                    {locale.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </fieldset>

        <Separator />

        {/* Per-action overrides */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-foreground text-sm">
                Permissões por ação
              </p>
              <p className="text-muted-foreground text-xs">
                Ajuste ação por ação quando precisar de algo diferente do modo
                escolhido.
                {overrideCount > 0 && ` ${overrideCount} personalizada(s).`}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced((current) => !current)}
              aria-expanded={showAdvanced}
              className="shrink-0 cursor-pointer text-xs"
            >
              {showAdvanced ? "Ocultar" : "Ver todas"}
            </Button>
          </div>

          {showAdvanced && (
            <div className="space-y-3">
              {CATEGORY_ORDER.map((category) => {
                const rows = actions.filter(
                  (option) => option.category === category,
                );
                if (rows.length === 0) return null;

                return (
                  <div
                    key={category}
                    className="rounded-xl border border-border/60"
                  >
                    <div className="border-border/60 border-b px-4 py-2">
                      <p className="font-medium text-foreground text-xs">
                        {CATEGORY_META[category].label}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {CATEGORY_META[category].hint}
                      </p>
                    </div>

                    <div className="divide-y divide-border/60 px-4">
                      {rows.map((option) => (
                        <ActionRow
                          key={option.kind}
                          option={option}
                          permission={permissionFor(option.kind)}
                          onChange={(next) =>
                            handlePermissionChange(option.kind, next)
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {overrideCount > 0 && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResetOverrides}
                    className="cursor-pointer text-muted-foreground text-xs"
                  >
                    Restaurar padrões do modo
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default OperatorSettingsCard;
