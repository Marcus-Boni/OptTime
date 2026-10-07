import {
  ArrowRight,
  Clock,
  Layers,
  MessageSquare,
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
  TeamsLogoMark,
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 1 — Problem & Friction: O Atrito do Apontamento Tradicional (0–270 frames = 9s)
 *
 * Exposes the operational frictions prior to v1.10.0:
 * 1. Constant context-switching between Microsoft Teams and browser to log time.
 * 2. Ad-hoc and calendar meetings forgotten after ending.
 * 3. Contract renewals mixing budgets under the same Azure DevOps project.
 *
 * Smoothly resolves into the v1.10.0 solution statement.
 */

const frictionPoints = [
  {
    icon: MessageSquare,
    title: "Quebra de Contexto",
    detail:
      "Trocar de janela e interromper o fluxo de trabalho só para abrir o apontador de horas",
    color: theme.warning,
  },
  {
    icon: Clock,
    title: "Reuniões Esquecidas",
    detail:
      "Chamadas e alinhamentos que terminam no Teams e ficam sem lançamento na correria do dia",
    color: theme.error,
  },
  {
    icon: Layers,
    title: "Fases Misturadas",
    detail:
      "Projetos renovados no mesmo Azure DevOps acumulando horas e orçamentos na mesma conta",
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

  const showSolution = frame >= 145;
  const solutionSpring = spring({
    frame: frame - 145,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const frictionExit = interpolate(frame, [135, 160], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const frictionY = interpolate(frame, [135, 160], [0, -25], {
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
          padding: "0 120px",
          textAlign: "center",
          gap: 36,
        }}
      >
        {/* Header Pill & Title */}
        <FadeIn delay={10}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <Badge color={theme.brand}>NOVA VERSÃO · v1.10.0</Badge>
            <h1
              style={{
                fontFamily: fonts.display,
                fontSize: 54,
                fontWeight: 700,
                color: theme.white,
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              O tempo que você gasta{" "}
              <GradientText>apontando seu próprio tempo</GradientText>
            </h1>
            <p
              style={{
                fontSize: 22,
                color: theme.textMuted,
                maxWidth: 820,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Registrar horas não deveria custar foco, nem exigir caçar telas no
              navegador enquanto seu dia acontece no Microsoft Teams.
            </p>
          </div>
        </FadeIn>

        {/* Dynamic Center Area: Friction Cards or Solution Hero */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 280,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Phase 1: 3 Operational Friction Cards */}
          <div
            style={{
              position: "absolute",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 24,
              width: "100%",
              opacity: frictionExit,
              transform: `translateY(${frictionY}px)`,
              pointerEvents: frictionExit <= 0.05 ? "none" : "auto",
            }}
          >
            {frictionPoints.map((point, index) => {
              const cardSpring = spring({
                frame: frame - (25 + index * 12),
                fps,
                config: { damping: 14, stiffness: 100 },
              });
              const Icon = point.icon;

              return (
                <div
                  key={point.title}
                  style={{
                    backgroundColor: theme.bgCard,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 20,
                    padding: "32px 28px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    textAlign: "left",
                    gap: 16,
                    transform: `scale(${cardSpring})`,
                    opacity: cardSpring,
                    minHeight: 220,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
                  }}
                >
                  <div
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 14,
                      backgroundColor: `${point.color}15`,
                      border: `1px solid ${point.color}40`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: point.color,
                    }}
                  >
                    <Icon size={26} />
                  </div>
                  <h3
                    style={{
                      fontFamily: fonts.display,
                      fontSize: 22,
                      fontWeight: 600,
                      color: theme.white,
                      margin: 0,
                    }}
                  >
                    {point.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 15,
                      color: theme.textMuted,
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {point.detail}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Phase 2: Solution Resolution Banner */}
          {showSolution && (
            <div
              style={{
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 22,
                opacity: solutionSpring,
                transform: `scale(${solutionSpring})`,
                maxWidth: 960,
                padding: "36px 48px",
                borderRadius: 24,
                backgroundColor: `${theme.bgCard}cc`,
                border: `1px solid ${theme.brand}40`,
                backdropFilter: "blur(20px)",
                boxShadow: `0 20px 60px ${theme.brandGlow}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 20px",
                  borderRadius: 999,
                  backgroundColor: `${theme.brand}15`,
                  border: `1px solid ${theme.brand}40`,
                }}
              >
                <TeamsLogoMark size={24} />
                <span
                  style={{
                    color: theme.white,
                    fontWeight: 600,
                    fontSize: 16,
                  }}
                >
                  OptSolv Time Nativo no Microsoft Teams
                </span>
                <Sparkles size={16} color={theme.brand} />
              </div>

              <h2
                style={{
                  fontFamily: fonts.display,
                  fontSize: 38,
                  fontWeight: 700,
                  color: theme.white,
                  letterSpacing: "-0.02em",
                  margin: 0,
                  lineHeight: 1.25,
                }}
              >
                Chegou a v1.10.0: Registre horas diretamente no Teams,{" "}
                <GradientText>de qualquer canal ou chat</GradientText>
              </h2>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: theme.brandLight,
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                <span>Veja na prática como funciona</span>
                <ArrowRight size={20} />
              </div>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
