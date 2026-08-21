import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Where every integration sub-page returns to.
 *
 * `/dashboard/settings/integrations` only redirects to the settings screen, so
 * the tab query is what actually lands the user back where they came from.
 */
export const INTEGRATIONS_HREF = "/dashboard/settings?tab=integrations";

export interface IntegrationBackLinkProps {
  className?: string;
}

/**
 * The "back to Integrations" affordance shared by the integration sub-pages.
 *
 * Shared so the destination and the styling stay in one place — a sub-page that
 * drifts to a different back target is a bug users feel immediately.
 */
export function IntegrationBackLink({ className }: IntegrationBackLinkProps) {
  return (
    <Link
      href={INTEGRATIONS_HREF}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Voltar para Integrações
    </Link>
  );
}
