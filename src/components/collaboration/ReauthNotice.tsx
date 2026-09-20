"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export interface ReauthNoticeProps {
  /** What the person gains by signing in again, in their words. */
  feature: string;
  className?: string;
}

/**
 * "Entrar de novo" in one click.
 *
 * A Microsoft permission granted in Entra only reaches a session created by a
 * *full* login — refreshing a token never adds scopes. That is invisible to the
 * person, who just sees a feature that does not work, so the product has to say
 * it plainly and then do it for them: one button, Microsoft SSO usually skips
 * the password, and the callback lands back on this very page.
 */
export function ReauthNotice({ feature, className }: ReauthNoticeProps) {
  const [isWorking, setIsWorking] = useState(false);

  async function handleReauth() {
    setIsWorking(true);

    try {
      const callbackURL =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/dashboard/time";

      const { error } = await signIn.social({
        provider: "microsoft",
        callbackURL,
      });

      if (error) {
        throw new Error(error.message || "Não foi possível entrar novamente.");
      }
    } catch (error: unknown) {
      console.error("[ReauthNotice] handleReauth:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível entrar novamente.",
      );
      setIsWorking(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-brand-500/30 bg-brand-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <RefreshCw
          className="mt-0.5 size-4 shrink-0 text-brand-500"
          aria-hidden="true"
        />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            Falta um passo rápido para ver {feature}
          </p>
          <p className="text-xs text-muted-foreground">
            Sua sessão começou antes de a permissão ser liberada. Entrar de novo
            resolve — costuma levar poucos segundos, sem digitar senha, e você
            volta para esta mesma tela.
          </p>
        </div>
      </div>

      <Button
        size="sm"
        className="shrink-0 rounded-full bg-brand-500 text-white hover:bg-brand-600"
        onClick={() => void handleReauth()}
        disabled={isWorking}
      >
        {isWorking ? (
          <>
            <Loader2
              className="mr-1.5 size-3.5 animate-spin"
              aria-hidden="true"
            />
            Entrando…
          </>
        ) : (
          "Entrar de novo"
        )}
      </Button>
    </div>
  );
}
