"use client";

import { Sparkles, Tag } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChangelogNotification } from "@/hooks/use-changelog-notification";
import { CHANGELOG_HREF } from "@/lib/version";

export interface VersionBadgeProps {
  variant?: "sidebar-footer" | "header-dropdown" | "standalone";
  collapsed?: boolean;
}

export function VersionBadge({
  variant = "sidebar-footer",
  collapsed = false,
}: VersionBadgeProps) {
  const { latestVersion, hasUnseen, markAsSeen } = useChangelogNotification();

  if (variant === "sidebar-footer") {
    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={CHANGELOG_HREF}
              onClick={markAsSeen}
              aria-label={`Versão ${latestVersion} — Ver notas de lançamento`}
              className="relative mx-auto flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-accent/40 text-[10px] font-mono text-muted-foreground transition-colors hover:border-brand-500/30 hover:bg-accent/80 hover:text-foreground"
            >
              {hasUnseen ? (
                <>
                  <Sparkles className="h-4 w-4 text-orange-400" />
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500 ring-2 ring-background" />
                  </span>
                </>
              ) : (
                <Tag className="h-4 w-4" />
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            <span>
              {latestVersion} · Releases{hasUnseen ? " (Nova versão!)" : ""}
            </span>
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        href={CHANGELOG_HREF}
        onClick={markAsSeen}
        className="group flex items-center justify-between rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand-500/30 hover:bg-accent/50 hover:text-foreground"
      >
        <div className="flex items-center gap-2">
          {hasUnseen ? (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
            </span>
          ) : (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
          )}
          <span className="font-mono text-[11px] font-medium text-foreground/80">
            {latestVersion}
          </span>
          {hasUnseen ? (
            <span className="rounded-full bg-orange-500/15 px-1.5 py-0.2 text-[9px] font-semibold text-orange-400">
              Novo
            </span>
          ) : null}
        </div>
        <span className="text-[10px] font-medium text-muted-foreground/70 transition-colors group-hover:text-brand-400">
          Changelog →
        </span>
      </Link>
    );
  }

  if (variant === "header-dropdown") {
    return (
      <Link
        href={CHANGELOG_HREF}
        onClick={markAsSeen}
        className="flex items-center justify-between w-full px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <div className="flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-brand-500" />
          <span>Versão da plataforma</span>
        </div>
        <Badge
          variant="outline"
          className="border-border/60 font-mono text-[10px] text-muted-foreground"
        >
          {latestVersion}
        </Badge>
      </Link>
    );
  }

  return (
    <Badge
      variant="outline"
      className="gap-1 border-brand-500/20 bg-brand-500/10 font-mono text-[11px] text-brand-400"
    >
      <Tag className="h-3 w-3" />
      {latestVersion}
    </Badge>
  );
}
