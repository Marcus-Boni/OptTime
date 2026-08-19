"use client";

import { CalendarDays, Layers, Rows3, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type TimeView = "day" | "week" | "month" | "timesheets";

const TIME_VIEWS: readonly TimeView[] = ["day", "week", "month", "timesheets"];

/** Narrows a raw `?view=` value coming from a deep link. */
export function isTimeView(value: unknown): value is TimeView {
  return TIME_VIEWS.includes(value as TimeView);
}

interface TimeViewTabsProps {
  activeView: TimeView;
  onViewChange: (view: TimeView) => void;
  pendingSubmitWeeksCount?: number;
}

export function TimeViewTabs({
  activeView,
  onViewChange,
  pendingSubmitWeeksCount = 0,
}: TimeViewTabsProps) {
  return (
    <Tabs
      value={activeView}
      onValueChange={(value) => {
        if (
          value === "day" ||
          value === "week" ||
          value === "month" ||
          value === "timesheets"
        ) {
          onViewChange(value);
        }
      }}
    >
      <TabsList className="h-11 w-full rounded-full bg-neutral-200/60 p-1 sm:w-auto dark:bg-neutral-900/80 border border-neutral-300/50 dark:border-white/5">
        <TabsTrigger
          value="day"
          className="gap-2 rounded-full px-5 transition-all data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-black/5 dark:data-[state=active]:bg-neutral-800 dark:data-[state=active]:text-orange-400 dark:data-[state=active]:ring-white/10"
        >
          <Sun className="h-4 w-4" />
          Dia
        </TabsTrigger>
        <TabsTrigger
          value="week"
          className="gap-2 rounded-full px-5 transition-all data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-black/5 dark:data-[state=active]:bg-neutral-800 dark:data-[state=active]:text-orange-400 dark:data-[state=active]:ring-white/10"
        >
          <Rows3 className="h-4 w-4" />
          Semana
        </TabsTrigger>
        <TabsTrigger
          value="month"
          className="gap-2 rounded-full px-5 transition-all data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-black/5 dark:data-[state=active]:bg-neutral-800 dark:data-[state=active]:text-orange-400 dark:data-[state=active]:ring-white/10"
        >
          <CalendarDays className="h-4 w-4" />
          Mês
        </TabsTrigger>
        <TabsTrigger
          value="timesheets"
          className="gap-2 rounded-full px-5 flex items-center transition-all data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-black/5 dark:data-[state=active]:bg-neutral-800 dark:data-[state=active]:text-orange-400 dark:data-[state=active]:ring-white/10"
        >
          <Layers className="h-4 w-4" />
          Semanas
          {pendingSubmitWeeksCount > 0 ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="ml-1.5 h-5 min-w-5 cursor-help justify-center bg-brand-500 px-1.5 text-[10px] font-bold text-white hover:bg-brand-600 focus-visible:ring-offset-0 focus-visible:ring-0"
                  >
                    {pendingSubmitWeeksCount}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span>
                    {pendingSubmitWeeksCount === 1
                      ? "1 Semana pendente de submit"
                      : `${pendingSubmitWeeksCount} Semanas pendentes de submit`}
                  </span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
