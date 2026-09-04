"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Clock,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreateTokenInput } from "@/hooks/use-api-tokens";
import {
  API_TOKEN_PRESETS,
  type ApiTokenPreset,
  type ApiTokenSummary,
} from "@/lib/api-tokens.shared";
import { cn, getRelativeTime } from "@/lib/utils";
import { CopyBlock } from "./CopyBlock";

const PRESET_ORDER: ApiTokenPreset[] = ["read", "write", "full"];

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "180", label: "6 meses" },
  { value: "365", label: "1 ano" },
  { value: "never", label: "Sem expiração" },
] as const;

const CLIENT_LABELS: Record<string, string> = {
  mcp: "Agente de IA",
  cli: "CLI",
  extension: "Extensão",
  ci: "CI/CD",
  other: "Outro",
};

export interface ApiTokenManagerProps {
  tokens: ApiTokenSummary[];
  isLoading: boolean;
  isCreating: boolean;
  revokingId: string | null;
  createdToken: { plaintext: string; token: ApiTokenSummary } | null;
  onCreate: (input: CreateTokenInput) => Promise<boolean>;
  onRevoke: (id: string) => Promise<boolean>;
  onDismissCreated: () => void;
  /**
   * Copy overrides for hosts other than the AI agents page.
   *
   * The token list is the same everywhere, but "cada agente deve ter o seu
   * próprio token" reads wrong on the editor extension page. Defaults keep the
   * agents wording so existing callers are untouched.
   */
  description?: string;
  emptyDescription?: string;
  /** Recorded on the token so the list labels it by what actually carries it. */
  client?: CreateTokenInput["client"];
}

function ScopeBadges({ scopes }: { scopes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {scopes.map((scope) => (
        <Badge
          key={scope}
          variant="secondary"
          className="bg-muted font-mono text-[10px] font-normal"
        >
          {scope}
        </Badge>
      ))}
    </div>
  );
}

function TokenRow({
  token,
  isRevoking,
  onRevoke,
}: {
  token: ApiTokenSummary;
  isRevoking: boolean;
  onRevoke: () => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-sm text-foreground">
            {token.name}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {CLIENT_LABELS[token.client] ?? token.client}
          </Badge>
          {token.isExpired ? (
            <Badge className="bg-red-500/10 text-[10px] text-red-400">
              Expirado
            </Badge>
          ) : null}
        </div>

        <p className="font-mono text-xs text-muted-foreground">
          {token.masked}
        </p>

        <ScopeBadges scopes={token.scopes} />

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>Criado {getRelativeTime(token.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {token.lastUsedAt
              ? `Último uso ${getRelativeTime(token.lastUsedAt)}`
              : "Nunca usado"}
          </span>
          {token.expiresAt ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Expira {getRelativeTime(token.expiresAt)}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRevoke}
        disabled={isRevoking}
        className="shrink-0 self-start text-muted-foreground hover:bg-red-500/10 hover:text-red-400 sm:self-center"
      >
        {isRevoking ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Revogar
      </Button>
    </motion.li>
  );
}

/**
 * Token list plus the create flow.
 *
 * The plaintext panel is intentionally loud and non-dismissible-by-accident:
 * it is the only moment the secret exists in the UI, and users who miss it have
 * to revoke and start over.
 */
export function ApiTokenManager({
  tokens,
  isLoading,
  isCreating,
  revokingId,
  createdToken,
  onCreate,
  onRevoke,
  onDismissCreated,
  description = "Cada agente deve ter o seu próprio token. Revogar um token derruba apenas aquele agente.",
  emptyDescription = "Crie um token para conectar o Cursor, o Claude Code ou qualquer outro agente ao seu apontamento de horas.",
  client,
}: ApiTokenManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<ApiTokenPreset>("write");
  const [expiry, setExpiry] = useState<string>("365");

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const created = await onCreate({
      name: trimmed,
      preset,
      expiresInDays: expiry === "never" ? null : Number.parseInt(expiry, 10),
      ...(client ? { client } : {}),
    });

    if (created) {
      setIsDialogOpen(false);
      setName("");
      setPreset("write");
      setExpiry("365");
    }
  }

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <KeyRound className="h-4 w-4 text-brand-500" />
            Tokens de acesso pessoal
          </CardTitle>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          className="shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo token
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <AnimatePresence>
          {createdToken ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 rounded-xl border border-brand-500/40 bg-brand-500/5 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Copie o token agora
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Guardamos apenas um hash. Este é o único momento em que o
                      valor completo aparece — se você fechar sem copiar, será
                      preciso gerar outro.
                    </p>
                  </div>
                </div>

                <CopyBlock code={createdToken.plaintext} inline />

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onDismissCreated}
                  >
                    Já copiei
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
            <ShieldCheck
              className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-foreground">
              Nenhum token ativo
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {emptyDescription}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {tokens.map((token) => (
                <TokenRow
                  key={token.id}
                  token={token}
                  isRevoking={revokingId === token.id}
                  onRevoke={() => onRevoke(token.id)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">
              Novo token de acesso
            </DialogTitle>
            <DialogDescription>
              Dê um nome que identifique onde o token vai rodar e escolha o
              nível de permissão mínimo necessário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="token-name">Nome</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Cursor — notebook do trabalho"
                maxLength={60}
                autoFocus
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-foreground">
                Permissões
              </legend>
              <div className="space-y-2">
                {PRESET_ORDER.map((key) => {
                  const option = API_TOKEN_PRESETS[key];
                  const isSelected = preset === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPreset(key)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex w-full cursor-pointer flex-col gap-1 rounded-xl border-2 p-3 text-left transition-colors",
                        isSelected
                          ? "border-brand-500 bg-brand-500/5"
                          : "border-border bg-card hover:border-brand-500/40",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {option.label}
                        </span>
                        {key === "write" ? (
                          <Badge
                            variant="secondary"
                            className="bg-brand-500/10 text-[10px] text-brand-500"
                          >
                            Recomendado
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="token-expiry">Validade</Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger id="token-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={isCreating || !name.trim()}
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Gerar token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
