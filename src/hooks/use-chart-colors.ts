import { useUIStore } from "@/stores/ui.store";

export interface ChartColors {
  tickFill: string;
  gridStroke: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipColor: string;
  tooltipLabelColor: string;
  cursorFill: string;
  ghostBarFill: string;
  pieLabelFill: string;
}

/**
 * Returns Recharts color tokens that adapt to the active theme.
 * All values come directly from the design tokens in globals.css,
 * keeping the chart visuals consistent with the UI system.
 */
export function useChartColors(): ChartColors {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  return {
    tickFill: isDark ? "#d4d4d4" : "#525252",
    gridStroke: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
    tooltipBg: isDark ? "#171717" : "#ffffff",
    tooltipBorder: isDark ? "#262626" : "#e5e5e5",
    tooltipColor: isDark ? "#ffffff" : "#0a0a0a",
    tooltipLabelColor: isDark ? "#e5e5e5" : "#404040",
    cursorFill: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
    ghostBarFill: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    pieLabelFill: isDark ? "#ffffff" : "#171717",
  };
}
