"use client";

import { CalendarDays, Rows3, Sun } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type TimeView = "day" | "week" | "month";

interface TimeViewTabsProps {
  activeView: TimeView;
  onViewChange: (view: TimeView) => void;
}

export function TimeViewTabs({ activeView, onViewChange }: TimeViewTabsProps) {
  return (
    <Tabs
      value={activeView}
      onValueChange={(value) => {
        if (value === "day" || value === "week" || value === "month") {
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
      </TabsList>
    </Tabs>
  );
}
