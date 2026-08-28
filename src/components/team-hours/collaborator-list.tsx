"use client";

import { format } from "date-fns";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDuration, parseLocalDate } from "@/lib/utils";
import type { TeamHoursCollaborator } from "@/types/team-hours";

/**
 * `rail` is the tall sidebar used on wide screens; `strip` is the horizontal
 * scroller that takes its place on notebooks, where the weekly board needs the
 * full content width to stay readable.
 */
export type CollaboratorListLayout = "rail" | "strip";

const SELECTED_STYLES = "border-brand-500/40 bg-brand-500/8";
const IDLE_STYLES =
  "border-transparent hover:border-border/60 hover:bg-muted/40";
const FOCUS_STYLES =
  "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none";

function ShareBar({
  sharePercent,
  isActive,
}: {
  sharePercent: number;
  isActive: boolean;
}) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
      aria-hidden="true"
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          isActive ? "bg-brand-500" : "bg-muted-foreground/35",
        )}
        style={{ width: `${Math.min(100, Math.max(2, sharePercent))}%` }}
      />
    </div>
  );
}

interface CollaboratorItemProps {
  collaborator: TeamHoursCollaborator;
  isActive: boolean;
  onSelect: () => void;
}

/** Full-width row for the rail: name, volume, recency and share. */
function CollaboratorRow({
  collaborator,
  isActive,
  onSelect,
}: CollaboratorItemProps) {
  const { user, totalMinutes, entryCount, sharePercent, latestDate } =
    collaborator;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      className={cn(
        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
        FOCUS_STYLES,
        isActive ? SELECTED_STYLES : IDLE_STYLES,
      )}
    >
      <div className="flex items-center gap-3">
        <UserAvatar name={user.name} image={user.image} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {user.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {entryCount} registros
            {latestDate
              ? ` · último em ${format(parseLocalDate(latestDate), "dd/MM")}`
              : ""}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              isActive ? "text-brand-500" : "text-foreground",
            )}
          >
            {formatDuration(totalMinutes)}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {sharePercent}%
          </p>
        </div>
      </div>

      {/* Share of the filtered team total — turns the list into a ranking. */}
      <div className="mt-2">
        <ShareBar sharePercent={sharePercent} isActive={isActive} />
      </div>
    </button>
  );
}

/** Fixed-width card for the strip: only what survives at a glance. */
function CollaboratorCard({
  collaborator,
  isActive,
  onSelect,
}: CollaboratorItemProps) {
  const { user, totalMinutes, sharePercent } = collaborator;
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      title={`${user.name} · ${formatDuration(totalMinutes)}`}
      className={cn(
        "w-[152px] shrink-0 snap-start rounded-lg border px-2.5 py-2 text-left transition-colors",
        FOCUS_STYLES,
        isActive ? SELECTED_STYLES : IDLE_STYLES,
      )}
    >
      <div className="flex items-center gap-2">
        <UserAvatar name={user.name} image={user.image} size="sm" />
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {firstName}
        </p>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-1">
        <span
          className={cn(
            "font-mono text-xs font-semibold tabular-nums",
            isActive ? "text-brand-500" : "text-foreground",
          )}
        >
          {formatDuration(totalMinutes)}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {sharePercent}%
        </span>
      </div>

      <div className="mt-1.5">
        <ShareBar sharePercent={sharePercent} isActive={isActive} />
      </div>
    </button>
  );
}

export interface CollaboratorListProps {
  collaborators: TeamHoursCollaborator[];
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
  loading: boolean;
  layout?: CollaboratorListLayout;
}

/**
 * Ranked list of everyone inside the current filters, in whichever shape the
 * available width can afford. Sorted by hours, so the strip's first cards are
 * the people a manager most likely wants — scrolling is the exception.
 */
export function CollaboratorList({
  collaborators,
  selectedUserId,
  onSelect,
  loading,
  layout = "rail",
}: CollaboratorListProps) {
  const isStrip = layout === "strip";

  if (loading) {
    return (
      <output
        aria-label="Carregando colaboradores"
        className={cn(
          "block p-2",
          isStrip ? "flex gap-2 overflow-hidden" : "space-y-2",
        )}
      >
        {["c-1", "c-2", "c-3", "c-4", "c-5", "c-6"].map((key) => (
          <Skeleton
            key={key}
            className={cn(
              "rounded-lg",
              isStrip ? "h-[74px] w-[152px] shrink-0" : "h-[62px] w-full",
            )}
          />
        ))}
      </output>
    );
  }

  if (collaborators.length === 0) {
    return (
      <p
        className={cn(
          "text-center text-sm text-muted-foreground",
          isStrip ? "px-4 py-6" : "px-4 py-8",
        )}
      >
        Nenhum colaborador no filtro atual.
      </p>
    );
  }

  if (isStrip) {
    return (
      <div
        // Horizontal scrolling is the point here, so the container owns it and
        // snapping keeps cards from stopping half-visible.
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto p-2"
      >
        {collaborators.map((collaborator) => (
          <CollaboratorCard
            key={collaborator.user.id}
            collaborator={collaborator}
            isActive={collaborator.user.id === selectedUserId}
            onSelect={() => onSelect(collaborator.user.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {collaborators.map((collaborator) => (
        <CollaboratorRow
          key={collaborator.user.id}
          collaborator={collaborator}
          isActive={collaborator.user.id === selectedUserId}
          onSelect={() => onSelect(collaborator.user.id)}
        />
      ))}
    </div>
  );
}
