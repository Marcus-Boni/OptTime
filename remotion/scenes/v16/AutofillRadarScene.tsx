import {
  CheckCheck,
  Clock,
  GitCommit,
  GitPullRequest,
  Radar,
  Sparkles,
} from "lucide-react";
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

const suggestions = [
  {
    type: "PR Concluído",
    icon: GitPullRequest,
    color: "#22c55e",
    title: "PR #412: feat(core) migração de componentes",
    evidence: "4 commits · Mesclado na main",
    duration: "4h00",
    project: "OptSolv Platform",
  },
  {
    type: "Dia Esquecido",
    icon: GitCommit,
    color: theme.brand,
    title: "Terça-feira: 7 commits registrados e 0h lançadas",
    evidence: "Atividade entre 09:15 e 16:45",
    duration: "3h30",
    project: "Projeto Horizon",
  },
  {
    type: "Work Item Ativo",
    icon: Clock,
    color: "#38bdf8",
    title: "Task #3019: Implementação de filtros",
    evidence: "Em andamento no Azure Boards",
    duration: "1h30",
    project: "Portal Cliente",
  },
];

/**
 * Scene 3 — Predictive Radar & Zero-Friction Logging (0–450 frames = 15s)
 */
export const AutofillRadarScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [420, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const radarSpring = spring({
    frame: frame - 20,
    fps,
    config: { damping: 14, stiffness: 110 },
  });

  // Action trigger frame (click on Preencher Tudo)
  const isFilled = frame >= 240;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        opacity: fadeOut,
        overflow: "hidden",
      }}
    >
      <GlowDot x="50%" y="20%" size={750} opacity={0.15} color="#0078D4" />
      <GlowDot x="80%" y="70%" size={550} opacity={0.1} color={theme.brand} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 32,
        }}
      >
        {/* Header */}
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
            <Badge color="#0078D4">ZERO-FRICTION LOGGING</Badge>
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
              Apontamento Preditivo com{" "}
              <GradientText
                style={{
                  background: "linear-gradient(135deg, #38bdf8, #f97316)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Radar de Atividades
              </GradientText>
            </h2>
            <p
              style={{
                fontSize: 19,
                color: theme.textMuted,
                margin: 0,
                maxWidth: 850,
              }}
            >
              O sistema monitora Pull Requests e commits no Azure DevOps e
              propõe o preenchimento de horas pendentes em 1 clique.
            </p>
          </div>
        </FadeIn>

        {/* Radar Widget Container */}
        <div
          style={{
            transform: `scale(${radarSpring})`,
            opacity: radarSpring,
            width: 1040,
            background: "#111622",
            borderRadius: 22,
            border: "1px solid rgba(0, 120, 212, 0.35)",
            boxShadow: "0 30px 80px rgba(0, 120, 212, 0.15)",
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Radar top banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: 16,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: "rgba(0, 120, 212, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <Radar size={24} color="#38bdf8" />
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#22c55e",
                  }}
                />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}
                  >
                    Radar de Atividades Azure DevOps
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#38bdf8",
                      background: "rgba(56, 189, 248, 0.15)",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontWeight: 600,
                    }}
                  >
                    3 SUGESTÕES
                  </span>
                </div>
                <span style={{ fontSize: 13, color: theme.textMuted }}>
                  Detectamos 9h00 de trabalho real não lançado nesta semana
                </span>
              </div>
            </div>

            {/* Autofill button */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: isFilled
                  ? "rgba(34, 197, 94, 0.2)"
                  : "linear-gradient(135deg, #0078D4, #0284c7)",
                border: `1px solid ${isFilled ? "rgba(34, 197, 94, 0.5)" : "transparent"}`,
                color: "#fff",
                padding: "10px 22px",
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 14,
                boxShadow: isFilled
                  ? "none"
                  : "0 8px 24px rgba(0, 120, 212, 0.35)",
              }}
            >
              {isFilled ? (
                <>
                  <CheckCheck size={18} color="#22c55e" />
                  <span style={{ color: "#86efac" }}>
                    9h00 Lançadas com Sucesso!
                  </span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Preencher Tudo (1 Clique)</span>
                </>
              )}
            </div>
          </div>

          {/* Suggestion Cards list */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 16,
            }}
          >
            {suggestions.map((item, idx) => {
              const cardProgress = interpolate(
                frame,
                [40 + idx * 25, 75 + idx * 25],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
              const cardFilled = isFilled;

              return (
                <div
                  key={item.title}
                  style={{
                    opacity: cardProgress,
                    transform: `translateY(${interpolate(cardProgress, [0, 1], [20, 0])}px)`,
                    background: cardFilled
                      ? "rgba(34, 197, 94, 0.06)"
                      : "#161c2b",
                    borderRadius: 14,
                    border: `1px solid ${cardFilled ? "rgba(34, 197, 94, 0.3)" : "rgba(255,255,255,0.08)"}`,
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: item.color,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {item.type}
                    </span>
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 14,
                        fontWeight: 700,
                        color: cardFilled ? "#22c55e" : "#fff",
                        background: cardFilled
                          ? "rgba(34, 197, 94, 0.15)"
                          : "#212a3d",
                        padding: "2px 8px",
                        borderRadius: 6,
                      }}
                    >
                      {item.duration}
                    </span>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#fff",
                        lineHeight: 1.4,
                        marginBottom: 4,
                      }}
                    >
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      {item.evidence}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: 8,
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: "#94a3b8" }}>{item.project}</span>
                    <span
                      style={{
                        color: cardFilled ? "#22c55e" : "#38bdf8",
                        fontWeight: 600,
                      }}
                    >
                      {cardFilled ? "✓ Apontado" : "Aprovar →"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
