import {
  CheckCircle2,
  Clock,
  Focus,
  Layers,
  PhoneCall,
  Sparkles,
  Zap,
} from "lucide-react";
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
  FadeIn,
  GlowDot,
  GradientText,
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 3 — Meu Tempo & Assistente do Período (/dashboard/my-time) (0–420 frames = 14s)
 *
 * Demonstrates:
 * 1. The new executive & individual view: period metrics, project vs meeting vs call distribution.
 * 2. Day-by-day stacked chart tracking daily 8h target with real categories.
 * 3. The deterministic period assistant detecting unlogged events with 1-click batch registration.
 */

const DAYS_DATA = [
  { day: "Seg", project: 5.5, meeting: 2.0, calls: 0.5, total: 8.0 },
  { day: "Ter", project: 6.0, meeting: 1.5, calls: 0.5, total: 8.0 },
  { day: "Qua", project: 4.5, meeting: 2.5, calls: 1.0, total: 8.0 },
  { day: "Qui", project: 5.0, meeting: 2.0, calls: 1.0, total: 8.0 },
  { day: "Sex", project: 4.5, meeting: 1.0, calls: 1.0, total: 6.5 },
];

export const MyTimeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [395, 420], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const dashboardSpring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  // Batch action trigger at frame 230
  const actionAt = 230;
  const isBatchDone = frame >= actionAt;
  const clickScale = interpolate(
    frame,
    [actionAt - 8, actionAt, actionAt + 8],
    [1, 0.94, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot x="20%" y="15%" size={700} opacity={0.15} color={theme.brand} />
      <GlowDot x="80%" y="75%" size={600} opacity={0.12} color={theme.azure} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 70px",
          gap: 24,
        }}
      >
        <FadeIn delay={0}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Badge color={theme.brand}>NOVA TELA · /dashboard/my-time</Badge>
              <Badge color={theme.azureLight}>ASSISTENTE DO PERÍODO</Badge>
            </div>
            <h1
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Meu Tempo: O Raio-X do Período.
              <br />
              <GradientText>
                Agenda, projetos e chamadas com ações em lote.
              </GradientText>
            </h1>
          </div>
        </FadeIn>

        {/* Dashboard Surface */}
        <div
          style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: 20,
            padding: "24px 28px",
            width: "100%",
            maxWidth: 1180,
            boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
            opacity: dashboardSpring,
            transform: `translateY(${interpolate(dashboardSpring, [0, 1], [30, 0])}px)`,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Top KPI Metrics Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
            }}
          >
            {[
              {
                label: "Horas Registradas",
                value: isBatchDone ? "39.5h" : "36.8h",
                sub: "Meta: 40h semanais",
                color: theme.brand,
                icon: Clock,
              },
              {
                label: "Trabalho em Projetos",
                value: "25.5h",
                sub: "65% do tempo útil",
                color: theme.white,
                icon: Layers,
              },
              {
                label: "Reuniões & Chamadas",
                value: "13.0h",
                sub: "Microsoft Graph sync",
                color: theme.azureLight,
                icon: PhoneCall,
              },
              {
                label: "Maior Janela Foco",
                value: "3h 45m",
                sub: "Sem interrupções",
                color: theme.success,
                icon: Focus,
              },
            ].map((kpi, idx) => {
              const kpiSpring = spring({
                frame: frame - 20 - idx * 10,
                fps,
                config: { damping: 14, stiffness: 120 },
              });
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  style={{
                    backgroundColor: theme.bg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 14,
                    padding: "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    opacity: kpiSpring,
                    transform: `translateY(${interpolate(kpiSpring, [0, 1], [15, 0])}px)`,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      backgroundColor: `${kpi.color}15`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: kpi.color,
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      {kpi.label}
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        fontFamily: fonts.mono,
                        color: theme.white,
                      }}
                    >
                      {kpi.value}
                    </div>
                    <div style={{ fontSize: 10, color: theme.textDimmed }}>
                      {kpi.sub}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Main 2-Column Split: Stacked Chart & Assistant */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.95fr",
              gap: 20,
            }}
          >
            {/* Left: Stacked Day Chart */}
            <div
              style={{
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 14,
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: 260,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: theme.white,
                    }}
                  >
                    Distribuição Diária vs Meta (8h)
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>
                    Projetos, reuniões normalizadas e chamadas diretas
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 4,
                      backgroundColor: `${theme.brand}20`,
                      color: theme.brand,
                      fontWeight: 600,
                    }}
                  >
                    ■ Projetos
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 4,
                      backgroundColor: `${theme.azureLight}20`,
                      color: theme.azureLight,
                      fontWeight: 600,
                    }}
                  >
                    ■ Reuniões
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "3px 8px",
                      borderRadius: 4,
                      backgroundColor: "rgba(123, 131, 235, 0.2)",
                      color: "#7B83EB",
                      fontWeight: 600,
                    }}
                  >
                    ■ Chamadas
                  </span>
                </div>
              </div>

              {/* Stacked Bars Container */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "space-around",
                  height: 140,
                  borderBottom: `1px solid ${theme.border}`,
                  paddingBottom: 8,
                  position: "relative",
                }}
              >
                {/* 8h Target Guide Line */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: "80%",
                    borderTop: `1px dashed ${theme.borderLight}`,
                    pointerEvents: "none",
                  }}
                />

                {DAYS_DATA.map((d, i) => {
                  const barGrow = interpolate(
                    frame,
                    [30 + i * 10, 80 + i * 10],
                    [0, 1],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                  );
                  const isToday = i === 4;
                  const finalCalls =
                    isToday && isBatchDone ? d.calls + 1.2 : d.calls;
                  const currentTotal = d.project + d.meeting + finalCalls;
                  const barHeightPercent =
                    Math.min((currentTotal / 10.0) * 100, 100) * barGrow;

                  return (
                    <div
                      key={d.day}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        height: "100%",
                        justifyContent: "flex-end",
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: `${barHeightPercent}%`,
                          borderRadius: "6px 6px 0 0",
                          overflow: "hidden",
                          display: "flex",
                          flexDirection: "column-reverse",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        }}
                      >
                        {/* Project (Brand Orange) */}
                        <div
                          style={{
                            height: `${(d.project / currentTotal) * 100}%`,
                            backgroundColor: theme.brand,
                          }}
                        />
                        {/* Meeting (Azure) */}
                        <div
                          style={{
                            height: `${(d.meeting / currentTotal) * 100}%`,
                            backgroundColor: theme.azureLight,
                          }}
                        />
                        {/* Calls (Purple) */}
                        <div
                          style={{
                            height: `${(finalCalls / currentTotal) * 100}%`,
                            backgroundColor: "#7B83EB",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: isToday ? theme.brand : theme.textMuted,
                        }}
                      >
                        {d.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Assistente do Período */}
            <div
              style={{
                backgroundColor: theme.bg,
                border: `1px solid ${isBatchDone ? `${theme.success}80` : theme.border}`,
                borderRadius: 14,
                padding: "20px 22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: isBatchDone
                  ? `0 10px 30px rgba(34, 197, 94, 0.15)`
                  : "none",
                minHeight: 260,
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Sparkles size={16} color={theme.brand} />
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: theme.white,
                      }}
                    >
                      Assistente do Período
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      backgroundColor: isBatchDone
                        ? `${theme.success}20`
                        : `${theme.warning}20`,
                      color: isBatchDone ? theme.success : theme.warning,
                      fontWeight: 600,
                    }}
                  >
                    {isBatchDone ? "Regularizado" : "Ação Pendente"}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: 12,
                    color: theme.textMuted,
                    margin: "0 0 12px 0",
                  }}
                >
                  {isBatchDone
                    ? "Todas as reuniões e chamadas foram vinculadas ao projeto."
                    : "Identificadas 3 reuniões e 1 chamada Teams sem apontamento no projeto."}
                </p>

                {/* Micro Item List */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  {[
                    {
                      title: "Daily Standup Squad",
                      dur: "30m",
                      src: "Outlook",
                    },
                    {
                      title: "Call Arquitetura Teams",
                      dur: "45m",
                      src: "Teams Call",
                    },
                    {
                      title: "Refinamento Sprint 12",
                      dur: "1h 30m",
                      src: "Outlook",
                    },
                  ].map((subItem) => (
                    <div
                      key={subItem.title}
                      style={{
                        fontSize: 11,
                        padding: "6px 10px",
                        borderRadius: 6,
                        backgroundColor: theme.bgCard,
                        border: `1px solid ${theme.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ color: theme.white, fontWeight: 500 }}>
                        {subItem.title}
                      </span>
                      <span
                        style={{
                          color: isBatchDone ? theme.success : theme.textMuted,
                          fontFamily: fonts.mono,
                        }}
                      >
                        {isBatchDone ? "✓ Vinculado" : subItem.dur}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div
                style={{
                  marginTop: 14,
                  transform: `scale(${clickScale})`,
                }}
              >
                {isBatchDone ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "10px 16px",
                      borderRadius: 10,
                      backgroundColor: `${theme.success}20`,
                      border: `1px solid ${theme.success}`,
                      color: theme.success,
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Lote de 2h 45m Registrado no Harvest</span>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: "10px 16px",
                      borderRadius: 10,
                      backgroundColor: theme.brand,
                      color: theme.white,
                      fontWeight: 700,
                      fontSize: 13,
                      boxShadow: `0 6px 20px ${theme.brandGlow}`,
                    }}
                  >
                    <Zap size={16} />
                    <span>Registrar Eventos em Lote (+2h 45m)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
