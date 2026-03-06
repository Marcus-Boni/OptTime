/** Design tokens matching OptSolv brand — used across all video scenes */
export const theme = {
  bg: "#0a0a0a",
  bgCard: "#171717",
  bgCardHover: "#1e1e1e",
  brand: "#f97316",
  brandLight: "#fb923c",
  brandDark: "#ea580c",
  brandGlow: "rgba(249, 115, 22, 0.15)",
  white: "#fafafa",
  textMuted: "#a3a3a3",
  textDimmed: "#737373",
  border: "#262626",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
  purple: "#8b5cf6",
} as const;

export const fonts = {
  display: "Sora, system-ui, sans-serif",
  body: "DM Sans, system-ui, sans-serif",
  mono: "JetBrains Mono, monospace",
} as const;
