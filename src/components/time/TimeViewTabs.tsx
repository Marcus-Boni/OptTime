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
      <TabsList className="h-11 w-full rounded-full bg-background/70 p-1 sm:w-auto">
        <TabsTrigger value="day" className="gap-2 rounded-full px-4">
          <Sun className="h-4 w-4" />
          Dia
        </TabsTrigger>
        <TabsTrigger value="week" className="gap-2 rounded-full px-4">
          <Rows3 className="h-4 w-4" />
          Semana
        </TabsTrigger>
        <TabsTrigger value="month" className="gap-2 rounded-full px-4">
          <CalendarDays className="h-4 w-4" />
          Mês
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
