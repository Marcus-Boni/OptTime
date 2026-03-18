"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};
const itemVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
};

const daysOfWeek = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getHeatmapColor(minutes: number): string {
  if (minutes === 0) return "bg-muted/30";
  const hours = minutes / 60;
  if (hours < 4) return "bg-brand-500/15";
  if (hours < 6) return "bg-brand-500/30";
  if (hours < 8) return "bg-brand-500/50";
  return "bg-brand-500/70";
}

function formatHours(minutes: number): string {
  if (minutes === 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

interface DaySummary {
  date: string;
  totalMinutes: number;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const firstDayOffset = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  const monthLabel = format(currentDate, "MMMM yyyy", { locale: ptBR });
  const fromStr = format(firstDayOfMonth, "yyyy-MM-dd");
  const toStr = format(lastDayOfMonth, "yyyy-MM-dd");

  // Build a map: dateStr → totalMinutes
  const minutesByDate: Record<string, number> = {};
  for (const s of daySummaries) {
    if (s.date) {
      const pureDate =
        typeof s.date === "string" ? s.date.split("T")[0] : String(s.date);
      minutesByDate[pureDate] = Number(s.totalMinutes) || 0;
    }
  }

  // Fetch real data when month changes
  useEffect(() => {
    setLoading(true);
    fetch(`/api/time-entries/summary?groupBy=day&from=${fromStr}&to=${toStr}`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        setDaySummaries(data.data ?? []);
      })
      .catch(() => {
        setDaySummaries([]);
      })
      .finally(() => setLoading(false));
  }, [fromStr, toStr]);

  const today = format(new Date(), "yyyy-MM-dd");

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={itemVariants}>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Calendário
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visualize suas horas registradas por dia.
        </p>
      </motion.div>

      {/* Month navigation */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={prevMonth}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-display text-lg font-semibold capitalize text-foreground">
          {monthLabel}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={nextMonth}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </motion.div>

      {/* Calendar grid */}
      <motion.div
        variants={itemVariants}
        className="rounded-xl border border-border/50 bg-card/80 p-4 backdrop-blur"
      >
        {/* Day headers */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {daysOfWeek.map((day) => (
            <div
              key={day}
              className="py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-7 gap-1"
          >
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: offset
              <div key={`empty-${i}`} className="aspect-square" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const minutes = minutesByDate[dateStr] ?? 0;
              const isToday = dateStr === today;

              return (
                <motion.div
                  key={day}
                  variants={itemVariants}
                  className={cn(
                    "group relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-all",
                    getHeatmapColor(minutes),
                    isToday && "ring-2 ring-brand-500",
                  )}
                  title={
                    minutes > 0
                      ? `${formatHours(minutes)} registradas`
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      "font-medium",
                      isToday ? "text-brand-500" : "text-foreground",
                    )}
                  >
                    {day}
                  </span>
                  {minutes > 0 && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatHours(minutes)}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </motion.div>

      {/* Legend */}
      <motion.div
        variants={itemVariants}
        className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground"
      >
        <span>Intensidade:</span>
        {[
          { label: "0h", cls: "bg-muted/30" },
          { label: "<4h", cls: "bg-brand-500/15" },
          { label: "4-6h", cls: "bg-brand-500/30" },
          { label: "6-8h", cls: "bg-brand-500/50" },
          { label: "8h+", cls: "bg-brand-500/70" },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={cn("h-3 w-3 rounded", cls)} />
            <span>{label}</span>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
