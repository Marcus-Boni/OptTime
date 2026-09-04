import { CheckCircle2, Sparkles, TrendingUp, Users } from "lucide-react";
import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Badge, FadeIn, GlowDot, GradientText } from "../../components/shared";
import { fonts, theme } from "../../theme";

/**
 * Scene 3 — Executive & Manager HQ (/dashboard/hq) (0–420 frames = 14s)
 *
 * Demonstrates the management headquarters:
 * 1. Predictive burn-down radar & scope creep analysis
 * 2. FTE Capacity heatmap & drag-and-drop allocation
 * 3. 1-Click approval batching with anomaly detection
 */

export const ExecutiveHqScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [395, 420], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const card1Spring = spring({
    frame: frame - 20,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const card2Spring = spring({
    frame: frame - 45,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const card3Spring = spring({
    frame: frame - 70,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  // Burn-down animated progress
  const burndownProgress = interpolate(frame, [50, 160], [45, 78], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Batch approve button click simulation at frame 230
  const approveDone = frame >= 240;
  const approveSpring = spring({
    frame: frame - 240,
    fps,
    config: { damping: 14, stiffness: 130 },
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
      <GlowDot x="50%" y="15%" size={750} opacity={0.15} color={theme.brand} />
      <GlowDot x="85%" y="60%" size={550} opacity={0.1} color={theme.azure} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 70px",
          gap: 32,
        }}
      >
        <FadeIn delay={0}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              textAlign: "center",
            }}
          >
            <Badge color={theme.brand}>
              EXECUTIVE & MANAGER HQ · /dashboard/hq
            </Badge>
            <h1
              style={{
                fontSize: 52,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Central de Gestão Executiva.
              <br />
              <GradientText>
                Visão preditiva de projetos e capacidade.
              </GradientText>
            </h1>
          </div>
        </FadeIn>

        {/* 3 HQ Feature Pillars */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 22,
            width: "100%",
            maxWidth: 1240,
          }}
        >
          {/* Pillar 1: Radar de Projetos Preditivo */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: 18,
              padding: "24px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              opacity: card1Spring,
              transform: `translateY(${interpolate(card1Spring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 15px 40px rgba(0,0,0,0.5)",
              minHeight: 330,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${theme.brand}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.brandLight,
                  }}
                >
                  <TrendingUp size={20} />
                </div>
                <div
                  style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
                >
                  Radar Preditivo
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  backgroundColor: `${theme.warning}20`,
                  color: theme.warning,
                  fontWeight: 600,
                }}
              >
                Atenção
              </span>
            </div>

            <div
              style={{
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ color: theme.textMuted }}>
                  Consumo de Orçamento
                </span>
                <span
                  style={{
                    color: theme.white,
                    fontWeight: 700,
                    fontFamily: fonts.mono,
                  }}
                >
                  {Math.round(burndownProgress)}% (156h / 200h)
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  backgroundColor: theme.bgCard,
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${burndownProgress}%`,
                    height: "100%",
                    backgroundColor: theme.warning,
                  }}
                />
              </div>
            </div>

            <div
              style={{
                fontSize: 12.5,
                color: theme.textMuted,
                lineHeight: 1.5,
                backgroundColor: `${theme.warning}10`,
                borderLeft: `3px solid ${theme.warning}`,
                padding: "10px 12px",
                borderRadius: 8,
              }}
            >
              No ritmo atual (~38h/sem), o orçamento esgota em{" "}
              <strong>25 de ago</strong> — 36 dias antes da entrega.
            </div>

            <div
              style={{
                fontSize: 12,
                color: theme.textDimmed,
                marginTop: "auto",
              }}
            >
              • Drill-down de Scope Creep vs. OriginalEstimate do Azure DevOps
            </div>
          </div>

          {/* Pillar 2: Capacidade FTE Heatmap */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: 18,
              padding: "24px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              opacity: card2Spring,
              transform: `translateY(${interpolate(card2Spring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 15px 40px rgba(0,0,0,0.5)",
              minHeight: 330,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${theme.azure}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.azureLight,
                  }}
                >
                  <Users size={20} />
                </div>
                <div
                  style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
                >
                  Capacidade & FTE
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  backgroundColor: `${theme.azure}20`,
                  color: theme.azureLight,
                  fontWeight: 600,
                }}
              >
                Heatmap
              </span>
            </div>

            {/* Heatmap Mini Rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                {
                  name: "Marcus B.",
                  pct: "105%",
                  status: "Sobrecarga",
                  color: theme.error,
                },
                {
                  name: "Ana Souza",
                  pct: "95%",
                  status: "Ideal",
                  color: theme.success,
                },
                {
                  name: "Lucas Lima",
                  pct: "50%",
                  status: "Ocioso",
                  color: theme.info,
                },
              ].map((row) => (
                <div
                  key={row.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: theme.bg,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: theme.white, fontWeight: 600 }}>
                    {row.name}
                  </span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        color: row.color,
                        fontWeight: 700,
                        fontFamily: fonts.mono,
                      }}
                    >
                      {row.pct}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        backgroundColor: `${row.color}20`,
                        color: row.color,
                      }}
                    >
                      {row.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                fontSize: 12,
                color: theme.textDimmed,
                marginTop: "auto",
              }}
            >
              • Drag-and-drop de projetos para planejamento em semanas futuras
            </div>
          </div>

          {/* Pillar 3: Aprovação em 1 Clique */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${approveDone ? theme.success : theme.border}`,
              borderRadius: 18,
              padding: "24px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              opacity: card3Spring,
              transform: `translateY(${interpolate(card3Spring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 15px 40px rgba(0,0,0,0.5)",
              minHeight: 330,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${theme.success}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.success,
                  }}
                >
                  <CheckCircle2 size={20} />
                </div>
                <div
                  style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
                >
                  Aprovações em 1 Clique
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  backgroundColor: `${theme.success}20`,
                  color: theme.success,
                  fontWeight: 600,
                }}
              >
                Auditoria 100%
              </span>
            </div>

            {/* Anomaly detection chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["18 Conformes", "1 Fim de semana", "1 Sem Work Item"].map(
                (chip, idx) => (
                  <span
                    key={chip}
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 6,
                      backgroundColor:
                        idx === 0 ? `${theme.success}20` : `${theme.warning}20`,
                      color: idx === 0 ? theme.success : theme.warning,
                      fontWeight: 600,
                    }}
                  >
                    {chip}
                  </span>
                ),
              )}
            </div>

            <div
              style={{
                backgroundColor: approveDone ? theme.success : theme.brand,
                borderRadius: 12,
                padding: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: theme.white,
                fontWeight: 700,
                fontSize: 13.5,
                transform: `scale(${approveDone ? approveSpring : 1})`,
                boxShadow: `0 4px 18px ${approveDone ? "rgba(34,197,94,0.3)" : theme.brandGlow}`,
                marginTop: "auto",
              }}
            >
              {approveDone ? (
                <>
                  <CheckCircle2 size={16} />
                  <span>18 Timesheets Aprovados!</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  <span>Aprovar 18 Conformes (1 Clique)</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
