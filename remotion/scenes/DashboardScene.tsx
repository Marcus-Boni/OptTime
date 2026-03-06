import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BrowserFrame, Counter, FadeIn, GlowDot } from "../components/shared";
import { fonts, theme } from "../theme";

const recentEntries = [
  {
    project: "OptSolv Time Tracker",
    task: "Dashboard UI",
    hours: "2h30",
    color: theme.brand,
  },
  {
    project: "API Gateway",
    task: "Auth endpoints",
    hours: "1h45",
    color: theme.info,
  },
  {
    project: "OptSolv Time Tracker",
    task: "Reports module",
    hours: "3h00",
    color: theme.brand,
  },
  {
    project: "Mobile App",
    task: "Push notifications",
    hours: "1h15",
    color: theme.purple,
  },
];

const widgets = [
  { label: "Hoje", value: 6.5, max: 8, unit: "h" },
  { label: "Semana", value: 32, max: 40, unit: "h" },
  { label: "Projetos", value: 3, max: 5, unit: "" },
];

/** Scene 8 — Dashboard overview (frames 0–300 = 10s) */
export const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [270, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const browserSpring = spring({
    frame: frame - 5,
    fps,
    config: { damping: 14 },
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
      <GlowDot x="40%" y="15%" size={500} opacity={0.06} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 80px",
          gap: 32,
        }}
      >
        <FadeIn delay={0}>
          <h2
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: theme.white,
              fontFamily: fonts.display,
              textAlign: "center",
              margin: 0,
            }}
          >
            Tudo em um{" "}
            <span
              style={{
                background: `linear-gradient(135deg, ${theme.brand}, ${theme.brandLight})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              dashboard
            </span>
          </h2>
        </FadeIn>

        <div
          style={{
            width: "100%",
            maxWidth: 1200,
            transform: `scale(${browserSpring})`,
            opacity: browserSpring,
          }}
        >
          <BrowserFrame url="app.optsolv.com/dashboard">
            <div style={{ padding: 32 }}>
              {/* Top widgets */}
              <div
                style={{
                  display: "flex",
                  gap: 20,
                  marginBottom: 28,
                }}
              >
                {widgets.map((w, i) => {
                  const progress = interpolate(
                    frame,
                    [20 + i * 8, 50 + i * 8],
                    [0, w.value / w.max],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                  );

                  return (
                    <div
                      key={w.label}
                      style={{
                        flex: 1,
                        padding: "20px 24px",
                        borderRadius: 14,
                        background: theme.bgCard,
                        border: `1px solid ${theme.border}`,
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: theme.textDimmed,
                          textTransform: "uppercase",
                          letterSpacing: 1,
                        }}
                      >
                        {w.label}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 4,
                        }}
                      >
                        <Counter
                          from={0}
                          to={w.value}
                          startFrame={20 + i * 8}
                          durationFrames={30}
                          suffix={w.unit}
                          style={{
                            fontSize: 32,
                            fontWeight: 800,
                            color: theme.white,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 16,
                            color: theme.textDimmed,
                          }}
                        >
                          / {w.max}
                          {w.unit}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div
                        style={{
                          height: 6,
                          borderRadius: 3,
                          background: theme.border,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${progress * 100}%`,
                            borderRadius: 3,
                            background: `linear-gradient(90deg, ${theme.brand}, ${theme.brandLight})`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Timer widget */}
                <div
                  style={{
                    flex: 1,
                    padding: "20px 24px",
                    borderRadius: 14,
                    background: theme.bgCard,
                    border: `1px solid ${theme.brand}30`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: theme.success,
                        boxShadow: `0 0 10px ${theme.success}60`,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: theme.success,
                        fontWeight: 600,
                      }}
                    >
                      TIMER ATIVO
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      fontFamily: fonts.mono,
                      color: theme.brand,
                    }}
                  >
                    {`00:${String(Math.floor(Math.max(0, frame - 40) / 30)).padStart(2, "0")}:${String(Math.floor((Math.max(0, frame - 40) % 30) * (100 / 30))).padStart(2, "0")}`}
                  </span>
                  <span style={{ fontSize: 12, color: theme.textDimmed }}>
                    OptSolv Time Tracker
                  </span>
                </div>
              </div>

              {/* Recent entries */}
              <div
                style={{
                  borderRadius: 14,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "14px 24px",
                    background: theme.bgCard,
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: 14,
                    fontWeight: 700,
                    color: theme.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Últimas entradas
                </div>
                {recentEntries.map((entry, i) => {
                  const rowDelay = 50 + i * 12;
                  const rowOpacity = interpolate(
                    frame,
                    [rowDelay, rowDelay + 10],
                    [0, 1],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                  );

                  return (
                    <div
                      key={`${entry.project}-${entry.task}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "14px 24px",
                        borderBottom:
                          i < recentEntries.length - 1
                            ? `1px solid ${theme.border}`
                            : "none",
                        opacity: rowOpacity,
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: entry.color,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: 15,
                          color: theme.white,
                          fontWeight: 600,
                        }}
                      >
                        {entry.project}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontSize: 14,
                          color: theme.textMuted,
                        }}
                      >
                        {entry.task}
                      </span>
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          fontFamily: fonts.mono,
                          color: theme.brand,
                        }}
                      >
                        {entry.hours}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </BrowserFrame>
        </div>
      </div>
    </AbsoluteFill>
  );
};
