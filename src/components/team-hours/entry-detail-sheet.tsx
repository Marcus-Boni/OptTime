"use client";

import { format } from "date-fns";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn, formatDuration, parseLocalDate } from "@/lib/utils";
import type { TeamHourEntry } from "@/types/team-hours";

export interface EntryDetailSheetProps {
  entry: TeamHourEntry | null;
  onOpenChange: (open: boolean) => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/** Read-only detail of a single time entry, opened from any list on the page. */
export function EntryDetailSheet({
  entry,
  onOpenChange,
}: EntryDetailSheetProps) {
  return (
    <Sheet open={entry !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {entry ? (
          <>
            <SheetHeader className="space-y-3 border-b border-border/60 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-md text-xs",
                    entry.billable
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-border/60 text-muted-foreground",
                  )}
                >
                  {entry.billable ? "Faturável" : "Interno"}
                </Badge>
                <Badge className="rounded-md bg-brand-500/10 font-mono text-xs tabular-nums text-brand-500">
                  {formatDuration(entry.duration)}
                </Badge>
              </div>

              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.project.color }}
                />
                <div className="min-w-0">
                  <SheetTitle className="text-lg leading-tight">
                    {entry.project.name}
                  </SheetTitle>
                  <SheetDescription className="text-sm">
                    {entry.project.clientName || "Projeto interno"}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="space-y-3 overflow-y-auto px-4 pb-6">
              <Field label="Colaborador">
                <div className="flex items-center gap-2.5">
                  <UserAvatar
                    name={entry.user.name}
                    image={entry.user.image}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {entry.user.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.user.email}
                    </p>
                  </div>
                </div>
              </Field>

              <Field label="Registro">
                <p className="font-mono text-sm text-foreground tabular-nums">
                  {format(parseLocalDate(entry.date), "dd/MM/yyyy")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Criado em{" "}
                  {format(new Date(entry.createdAt), "dd/MM/yyyy 'às' HH:mm")}
                </p>
              </Field>

              <Field label="Tarefa registrada">
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">
                  {entry.description || "Sem descrição informada."}
                </p>
              </Field>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
