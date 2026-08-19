"use client";

import { Sparkles, Tag } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CHANGELOG_HREF, DEFAULT_APP_VERSION_TAG } from "@/lib/version";

export interface VersionBadgeProps {
  variant?: "sidebar-footer" | "header-dropdown" | "standalone";
  collapsed?: boolean;
}

export function VersionBadge({
  variant = "sidebar-footer",
  collapsed = false,
}: VersionBadgeProps) {
  const [versionTag, setVersionTag] = useState<string>(DEFAULT_APP_VERSION_TAG);

  useEffect(() => {
    let isMounted = true;
    async function fetchLatestVersion() {
      try {
        const res = await fetch("/api/releases");
        if (!res.ok) return;
        const data = (await res.json()) as {
          releases?: Array<{ status: string; versionTag: string }>;
        };

        if (data.releases && Array.isArray(data.releases)) {
          const published = data.releases.filter(
            (r) => r.status === "published",
          );
          if (published[0]?.versionTag && isMounted) {
            const rawTag = published[0].versionTag.trim();
            const formattedTag = rawTag.startsWith("v") ? rawTag : `v${rawTag}`;
            setVersionTag(formattedTag);
          }
        }
      } catch (err) {
        console.error("[VersionBadge] fetchLatestVersion:", err);
      }
    }

    void fetchLatestVersion();
    return () => {
      isMounted = false;
    };
  }, []);

  if (variant === "sidebar-footer") {
    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={CHANGELOG_HREF}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/40 bg-accent/40 text-[10px] font-mono text-muted-foreground transition-colors hover:border-brand-500/30 hover:text-brand-400"
            >
              <Tag className="h-3.5 w-3.5" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            <span>{versionTag} · Releases</span>
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        href={CHANGELOG_HREF}
        className="group flex items-center justify-between rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand-500/30 hover:bg-accent/50 hover:text-foreground"
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="font-mono text-[11px] font-medium text-foreground/80">
            {versionTag}
          </span>
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
          {versionTag}
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
      {versionTag}
    </Badge>
  );
}
