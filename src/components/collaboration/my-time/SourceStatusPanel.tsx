"use client";

import {
  ChevronDown,
  CircleAlert,
  Loader2,
  type LucideIcon,
  PlugZap,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { signIn } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { SourceHealth, SourceStatus } from "@/types/collaboration";

const AZURE_DEVOPS_PATH = "/dashboard/settings/integrations/azure-devops";

const HEALTH: Record<
  Exclude<SourceHealth, "ok">,
  { icon: LucideIcon; className: string; word: string }
> = {
  needs_reauth: {
    icon: RefreshCw,
    className: "text-amber-600 dark:text-amber-400",
    word: "precisa de um novo login",
  },
  not_connected: {
    icon: PlugZap,
    className: "text-muted-foreground",
    word: "não conectado",
  },
  unlicensed: {
    icon: CircleAlert,
    className: "text-muted-foreground",
    word: "sem licença",
  },
  unavailable: {
    icon: TriangleAlert,
    className: "text-muted-foreground",
    word: "indisponível agora",
  },
};

function ReauthButton() {
  const [isWorking, setIsWorking] = useState(false);

  async function handleReauth(): Promise<void> {
    setIsWorking(true);

    try {
      // Back to this very page, so nobody has to find it again.
      const callbackURL =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/dashboard/my-time";

      const { error } = await signIn.social({
        provider: "microsoft",
        callbackURL,
      });

      if (error) throw new Error(error.message);
    } catch (error: unknown) {
      console.error("[SourceStatusPanel] handleReauth:", error);
      setIsWorking(false);
    }
  }

  return (
    <Button
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={handleReauth}
      disabled={isWorking}
    >
      {isWorking ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="size-3.5" aria-hidden="true" />
      )}
      Entrar novamente
    </Button>
  );
}

export interface SourceStatusPanelProps {
  statuses: SourceStatus[];
  /** Still waiting on Azure DevOps; its row is withheld until it answers. */
  isLoadingActions?: boolean;
}

/**
 * What did not answer, and what to do about it.
 *
 * Replaces a list of free-text warnings rendered in 11px grey at the bottom of
 * the page — under a full screen of zeros, which is precisely where someone
 * who cannot see their data will never look.
 *
 * Collapsed by default when nothing needs a decision: a missing Azure DevOps
 * is normal for most of the company and should not open as an alarm. Anything
 * fixable by signing in again opens expanded, because that one is a real
 * blocker with a one-click answer.
 */
export function SourceStatusPanel({
  statuses,
  isLoadingActions = false,
}: SourceStatusPanelProps) {
  const issues = statuses.filter((status) => status.health !== "ok");
  const blocking = issues.some((status) => status.health === "needs_reauth");
  const [open, setOpen] = useState(blocking);

  if (issues.length === 0) return null;

  const title = blocking
    ? "Entre novamente para ver tudo"
    : `${issues.length} fonte(s) de dados fora do ar`;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-tour="my-time-sources"
      className={cn(
        "rounded-2xl border",
        blocking
          ? "border-amber-500/30 bg-amber-500/[0.04]"
          : "border-border bg-card/60",
      )}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-2xl px-5 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40"
        >
          <TriangleAlert
            className={cn(
              "size-4 shrink-0",
              blocking
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              {title}
            </span>
            <span className="block text-xs text-muted-foreground">
              O resto da tela continua funcionando com as fontes que
              responderam.
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <ul className="space-y-2 border-t border-border/40 px-5 py-3">
          {issues.map((status) => {
            const meta = HEALTH[status.health as Exclude<SourceHealth, "ok">];
            const Icon = meta.icon;

            return (
              <li
                key={status.id}
                className="flex flex-wrap items-start gap-x-3 gap-y-2"
              >
                <Icon
                  className={cn("mt-0.5 size-3.5 shrink-0", meta.className)}
                  aria-hidden="true"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">
                    {status.label}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {meta.word}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {status.detail}
                  </p>
                </div>

                {status.action === "reauth" && <ReauthButton />}

                {status.action === "connect_azure_devops" && (
                  <Button
                    asChild
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                  >
                    <Link href={AZURE_DEVOPS_PATH}>Configurar</Link>
                  </Button>
                )}
              </li>
            );
          })}

          {isLoadingActions && (
            <li className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Ainda consultando o Azure DevOps…
            </li>
          )}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
