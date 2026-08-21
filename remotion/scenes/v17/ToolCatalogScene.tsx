import { BookOpen, Eye, MessageSquareText, Pencil, Wrench } from "lucide-react";
import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Badge,
  Counter,
  FadeIn,
  GlowDot,
  GradientText,
} from "../../components/shared";
import { fonts, theme } from "../../theme";

/**
 * Scene 3 — The catalog (0–420 frames = 14s)
 *
 * Shows the actual surface area rather than claiming it: every tool name, split
 * by whether it reads or writes, because that distinction is what determines
 * how much trust a user has to extend.
 */

type Kind = "read" | "write" | "submit";

const tools: Array<{ name: string; kind: Kind }> = [
  { name: "whoami", kind: "read" },
  { name: "list_projects", kind: "read" },
  { name: "get_active_timer", kind: "read" },
  { name: "list_time_entries", kind: "read" },
  { name: "get_today_summary", kind: "read" },
  { name: "get_timesheet_status", kind: "read" },
  { name: "search_work_items", kind: "read" },
  { name: "suggest_daily_entries", kind: "read" },
  { name: "start_timer", kind: "write" },
  { name: "stop_timer", kind: "write" },
  { name: "pause_timer", kind: "write" },
  { name: "resume_timer", kind: "write" },
  { name: "log_time", kind: "write" },
  { name: "update_time_entry", kind: "write" },
  { name: "delete_time_entry", kind: "write" },
  { name: "submit_timesheet", kind: "submit" },
];

const kindStyle: Record<Kind, { color: string; label: string }> = {
  read: { color: theme.info, label: "leitura" },
  write: { color: theme.warning, label: "escrita" },
  submit: { color: theme.purple, label: "timesheet" },
};

const counters = [
  { icon: Wrench, to: 16, label: "ferramentas", color: theme.brand },
  { icon: BookOpen, to: 4, label: "recursos", color: theme.info },
  { icon: MessageSquareText, to: 3, label: "prompts", color: theme.purple },
];

export const ToolCatalogScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [395, 420], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const urisOpacity = interpolate(frame, [250, 272], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot x="50%" y="12%" size={720} opacity={0.13} color={theme.brand} />
      <GlowDot x="82%" y="76%" size={480} opacity={0.09} color={theme.info} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 30,
        }}
      >
        <FadeIn delay={0}>
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
            }}
          >
            <Badge color={theme.brand}>CATÁLOGO COMPLETO</Badge>
            <h2
              style={{
                fontSize: 46,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.02em",
              }}
            >
              Tudo que o agente <GradientText>consegue fazer</GradientText>
            </h2>
          </div>
        </FadeIn>

        {/* Counters */}
        <div style={{ display: "flex", gap: 46 }}>
          {counters.map((item, index) => {
            const itemIn = spring({
              frame: frame - (25 + index * 12),
              fps,
              config: { damping: 15, stiffness: 130 },
            });
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  transform: `scale(${itemIn})`,
                  opacity: itemIn,
                }}
              >
                <Icon size={30} color={item.color} />
                <div
                  style={{ display: "flex", alignItems: "baseline", gap: 9 }}
                >
                  <Counter
                    from={0}
                    to={item.to}
                    startFrame={30 + index * 12}
                    durationFrames={34}
                    style={{
                      fontSize: 46,
                      fontWeight: 700,
                      color: theme.white,
                    }}
                  />
                  <span style={{ fontSize: 21, color: theme.textMuted }}>
                    {item.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tool grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            width: 1200,
          }}
        >
          {tools.map((tool, index) => {
            const chipIn = spring({
              frame: frame - (85 + index * 7),
              fps,
              config: { damping: 17, stiffness: 140, mass: 0.5 },
            });
            const meta = kindStyle[tool.kind];

            return (
              <div
                key={tool.name}
                style={{
                  background: theme.bgCard,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 13,
                  padding: "13px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  transform: `scale(${chipIn})`,
                  opacity: chipIn,
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 16,
                    color: theme.white,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  <span style={{ color: theme.textDimmed }}>opt_time_</span>
                  {tool.name}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 13,
                    color: meta.color,
                  }}
                >
                  {tool.kind === "read" ? (
                    <Eye size={12} />
                  ) : (
                    <Pencil size={12} />
                  )}
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Resource URIs — mounted from frame 0 so the grid above keeps its
            position; only the opacity animates in. */}
        <div
          style={{
            display: "flex",
            gap: 12,
            fontFamily: fonts.mono,
            fontSize: 17,
            color: theme.textMuted,
            opacity: urisOpacity,
          }}
        >
          {[
            "opt-time://projects/active",
            "opt-time://user/today",
            "opt-time://timesheets/current",
            "opt-time://guide/usage",
          ].map((uri) => (
            <span
              key={uri}
              style={{
                background: `${theme.info}12`,
                border: `1px solid ${theme.info}28`,
                borderRadius: 9,
                padding: "7px 13px",
              }}
            >
              {uri}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
