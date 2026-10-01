import {
  ArrowRight,
  FileSpreadsheet,
  GitBranch,
  PhoneCall,
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
import {
  Badge,
  FadeIn,
  GlowDot,
  GradientText,
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 1 — Problem & Friction: O Trabalho Invisível (0–270 frames = 9s)
 *
 * Exposes the operational frictions prior to v1.9.0:
 * 1. Unscheduled Teams calls & ad-hoc meetings consuming unlogged hours
 * 2. Fragmented context across Git commits, PRs, and Microsoft 365 docs
 * 3. Management blind spots: budget drift & disconnected capacity
 *
 * Smoothly resolves into the v1.9.0 solution statement.
 */

const frictionPoints = [
  {
    icon: PhoneCall,
    title: "Chamadas Fora da Agenda",
    detail:
      "Alinhamentos no Teams sem convite no calendário que consomem horas sem registro",
    color: theme.warning,
  },
  {
    icon: GitBranch,
    title: "Trabalho Fragmentado",
    detail:
      "Commits, sessões e documentos M365 dispersos sem correlação com projetos",
    color: theme.error,
  },
  {
    icon: FileSpreadsheet,
    title: "Gestão Desconectada",
    detail:
      "Orçamento sem previsão de estouro, capacidade incerta e aprovações lentas",
    color: theme.azureLight,
  },
];

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [245, 270], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const showSolution = frame >= 150;
  const solutionSpring = spring({
    frame: frame - 150,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const frictionExit = interpolate(frame, [140, 165], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const frictionY = interpolate(frame, [140, 165], [0, -25], {
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
      <GlowDot x="50%" y="15%" size={760} opacity={0.15} color={theme.brand} />
      <GlowDot x="10%" y="75%" size={500} opacity={0.08} color={theme.azure} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 40,
        }}
      >
        <FadeIn delay={0}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              textAlign: "center",
            }}
          >
            <Badge color={theme.brand}>NOVA VERSÃO · v1.9.0</Badge>
            <h1
              style={{
                fontSize: 54,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              O Desafio do Trabalho Invisível.
              <br />
              <GradientText>
                Chamadas, contexto e decisões desconectados.
              </GradientText>
            </h1>
          </div>
        </FadeIn>

        {/* Friction Cards Stage (frames 0–150) */}
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 1200,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 24,
              width: "100%",
              opacity: frictionExit,
              transform: `translateY(${frictionY}px)`,
              pointerEvents: showSolution ? "none" : "auto",
            }}
          >
            {frictionPoints.map((pt, i) => {
              const cardSpring = spring({
                frame: frame - 25 - i * 15,
                fps,
                config: { damping: 14, stiffness: 120 },
              });
              const Icon = pt.icon;
              return (
                <div
                  key={pt.title}
                  style={{
                    backgroundColor: theme.bgCard,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 18,
                    padding: "30px 24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                    transform: `translateY(${interpolate(cardSpring, [0, 1], [30, 0])}px)`,
                    opacity: cardSpring,
                    boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                    minHeight: 200,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: `${pt.color}18`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: pt.color,
                    }}
                  >
                    <Icon size={24} />
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: 20,
                        fontWeight: 600,
                        color: theme.white,
                        margin: "0 0 8px 0",
                      }}
                    >
                      {pt.title}
                    </h3>
                    <p
                      style={{
                        fontSize: 15,
                        color: theme.textMuted,
                        margin: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      {pt.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Solution Banner Stage (frames 150–270) */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              opacity: solutionSpring,
              transform: `translateY(${interpolate(solutionSpring, [0, 1], [30, 0])}px)`,
              pointerEvents: showSolution ? "auto" : "none",
            }}
          >
            <div
              style={{
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.brand}60`,
                borderRadius: 20,
                padding: "36px 48px",
                display: "flex",
                alignItems: "center",
                gap: 32,
                boxShadow: `0 25px 60px ${theme.brandGlow}`,
                maxWidth: 1060,
                width: "100%",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 18,
                  backgroundColor: `${theme.brand}25`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: theme.brandLight,
                  flexShrink: 0,
                }}
              >
                <Sparkles size={34} />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: theme.brand,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  Chegou a v1.9.0
                </div>
                <h2
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: theme.white,
                    margin: "0 0 8px 0",
                    fontFamily: fonts.display,
                  }}
                >
                  Memória Microsoft 365, Meu Tempo & Decisões Claras.
                </h2>
                <p
                  style={{
                    fontSize: 16,
                    color: theme.textMuted,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Reconstrução auditável de horas, chamadas Teams verificadas e
                  visão executiva de orçamento e capacidade.
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 20px",
                  borderRadius: 12,
                  backgroundColor: theme.brand,
                  color: theme.white,
                  fontWeight: 600,
                  fontSize: 15,
                  flexShrink: 0,
                }}
              >
                <span>Conheça as novidades</span>
                <ArrowRight size={18} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
