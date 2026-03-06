import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Badge, FadeIn, GlowDot, GradientText } from "../components/shared";
import { fonts, theme } from "../theme";

/** Mock chart data — bar chart for weekly hours by project */
const chartData = [
  {
    day: "Seg",
    projects: [
      { name: "Time Tracker", hours: 5, color: theme.brand },
      { name: "API Gateway", hours: 3, color: theme.info },
    ],
  },
  {
    day: "Ter",
    hours: 7.5,
    projects: [
      { name: "Time Tracker", hours: 4, color: theme.brand },
      { name: "API Gateway", hours: 2, color: theme.info },
      { name: "Mobile App", hours: 1.5, color: theme.purple },
    ],
  },
  {
    day: "Qua",
    projects: [
      { name: "Time Tracker", hours: 6, color: theme.brand },
      { name: "API Gateway", hours: 2.5, color: theme.info },
    ],
  },
  {
    day: "Qui",
    projects: [
      { name: "Time Tracker", hours: 3, color: theme.brand },
      { name: "Mobile App", hours: 3, color: theme.purple },
    ],
  },
  {
    day: "Sex",
    projects: [
      { name: "Time Tracker", hours: 5, color: theme.brand },
      { name: "API Gateway", hours: 3, color: theme.info },
    ],
  },
];

/** Scene 7 — Reports & Export (frames 0–300 = 10s) */
export const ReportsScene: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeOut = interpolate(frame, [270, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        opacity: fadeOut,
        overflow: "hidden",
      }}
    >
      <GlowDot x="20%" y="60%" size={500} opacity={0.06} />

      <div
        style={{
          display: "flex",
          height: "100%",
          alignItems: "center",
          padding: "0 100px",
          gap: 80,
        }}
      >
        {/* Left: text */}
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: 28 }}
        >
          <FadeIn delay={0}>
            <Badge color={theme.purple}>Relatórios & Export</Badge>
          </FadeIn>
          <FadeIn delay={10}>
            <h2
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                lineHeight: 1.2,
              }}
            >
              Dados que geram <GradientText>decisões</GradientText>
            </h2>
          </FadeIn>
          <FadeIn delay={20}>
            <p
              style={{
                fontSize: 20,
                color: theme.textMuted,
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              Gráficos interativos, filtros avançados e exportação em Excel e
              PDF com layout profissional e logo OptSolv.
            </p>
          </FadeIn>

          {/* Export buttons */}
          <FadeIn delay={35}>
            <div style={{ display: "flex", gap: 16 }}>
              {[
                { label: "📊 Export Excel", color: "#22c55e" },
                { label: "📄 Export PDF", color: "#ef4444" },
              ].map((btn) => (
                <div
                  key={btn.label}
                  style={{
                    padding: "14px 28px",
                    borderRadius: 12,
                    background: `${btn.color}15`,
                    border: `1px solid ${btn.color}40`,
                    color: btn.color,
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  {btn.label}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>

        {/* Right: chart mock */}
        <div style={{ flex: 1 }}>
          <FadeIn delay={12} durationFrames={20}>
            <div
              style={{
                padding: 32,
                borderRadius: 20,
                background: theme.bgCard,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 24,
                }}
              >
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: theme.white,
                    fontFamily: fonts.display,
                  }}
                >
                  Horas por projeto — Semana atual
                </span>
                <span
                  style={{
                    fontSize: 14,
                    color: theme.textDimmed,
                    fontFamily: fonts.mono,
                  }}
                >
                  03–07 Mar 2026
                </span>
              </div>

              {/* Stacked bar chart */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 24,
                  height: 220,
                }}
              >
                {chartData.map((day, i) => {
                  const barDelay = 25 + i * 10;
                  const growth = interpolate(
                    frame,
                    [barDelay, barDelay + 30],
                    [0, 1],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                  );
                  const total = day.projects.reduce((s, p) => s + p.hours, 0);

                  return (
                    <div
                      key={day.day}
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          fontFamily: fonts.mono,
                          color: theme.textMuted,
                        }}
                      >
                        {Math.round(total * growth * 10) / 10}h
                      </span>
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "column-reverse",
                          gap: 2,
                          borderRadius: 8,
                          overflow: "hidden",
                        }}
                      >
                        {day.projects.map((p) => (
                          <div
                            key={p.name}
                            style={{
                              width: "100%",
                              height: p.hours * 22 * growth,
                              background: p.color,
                              borderRadius: 4,
                            }}
                          />
                        ))}
                      </div>
                      <span style={{ fontSize: 14, color: theme.textMuted }}>
                        {day.day}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  marginTop: 20,
                  justifyContent: "center",
                }}
              >
                {[
                  { name: "Time Tracker", color: theme.brand },
                  { name: "API Gateway", color: theme.info },
                  { name: "Mobile App", color: theme.purple },
                ].map((p) => (
                  <span
                    key={p.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      color: theme.textMuted,
                    }}
                  >
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: p.color,
                      }}
                    />
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </AbsoluteFill>
  );
};
