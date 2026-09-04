import { ArrowRight, BarChart3, Clock, Users } from "lucide-react";
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
 * Scene 1 — Problem & Friction (0–270 frames = 9s)
 *
 * Highlights the three major operational bottlenecks before v1.8.0:
 * 1. Blind management (budget overruns & scope creep)
 * 2. End-of-day time gap (forgotten hours & friction)
 * 3. Client communication gap (manual reports)
 *
 * Then transitions into the solution statement that anchors the release.
 */

const frictionPoints = [
  {
    icon: BarChart3,
    title: "Gestão no Escuro",
    detail: "Burn-down atrasado, riscos não detectados e scope creep invisível",
    color: theme.error,
  },
  {
    icon: Clock,
    title: "Horas Esquecidas",
    detail: "Final do dia com 6h registradas e a dúvida do que faltou apontar",
    color: theme.warning,
  },
  {
    icon: Users,
    title: "Clientes sem Visão",
    detail:
      "Relatórios manuais em PDF e clientes pedindo status a todo momento",
    color: theme.info,
  },
];

export const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [245, 270], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const showSolution = frame >= 155;
  const solutionSpring = spring({
    frame: frame - 155,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const frictionExit = interpolate(frame, [145, 170], [1, 0], {
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
      <GlowDot x="10%" y="75%" size={500} opacity={0.08} color={theme.purple} />

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
            <Badge color={theme.brand}>NOVA VERSÃO · v1.8.0</Badge>
            <h1
              style={{
                fontSize: 60,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Gestão de Projetos & Apontamento de Horas.
              <br />
              <GradientText>Agora sob controle absoluto.</GradientText>
            </h1>
          </div>
        </FadeIn>

        {/* 3 Friction Cards (fades into solution) */}
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 1180,
            minHeight: 180,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* Friction Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 20,
              width: "100%",
              opacity: frictionExit,
              transform: `scale(${interpolate(frame, [145, 170], [1, 0.96], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})`,
              pointerEvents: showSolution ? "none" : "auto",
            }}
          >
            {frictionPoints.map((item, i) => {
              const Icon = item.icon;
              const cardSpring = spring({
                frame: frame - (25 + i * 14),
                fps,
                config: { damping: 15, stiffness: 120 },
              });

              return (
                <div
                  key={item.title}
                  style={{
                    backgroundColor: theme.bgCard,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 16,
                    padding: "26px 22px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    minHeight: 180,
                    opacity: cardSpring,
                    transform: `translateY(${interpolate(cardSpring, [0, 1], [30, 0])}px)`,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: `${item.color}15`,
                      border: `1px solid ${item.color}30`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: item.color,
                    }}
                  >
                    <Icon size={22} />
                  </div>
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 20,
                        fontWeight: 600,
                        color: theme.white,
                        fontFamily: fonts.display,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {item.title}
                    </h2>
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 14,
                        color: theme.textMuted,
                        lineHeight: 1.45,
                      }}
                    >
                      {item.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Solution Promise Overlay */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: solutionSpring,
              transform: `scale(${interpolate(solutionSpring, [0, 1], [0.94, 1])}) translateY(${interpolate(solutionSpring, [0, 1], [20, 0])}px)`,
              pointerEvents: showSolution ? "auto" : "none",
            }}
          >
            <div
              style={{
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.brand}50`,
                borderRadius: 20,
                padding: "30px 48px",
                display: "flex",
                alignItems: "center",
                gap: 28,
                boxShadow: `0 20px 60px ${theme.brandGlow}, 0 0 0 1px ${theme.brand}30`,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  backgroundColor: `${theme.brand}20`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: theme.brandLight,
                }}
              >
                <ArrowRight size={28} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    color: theme.white,
                    fontFamily: fonts.display,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Central HQ · Microsoft Teams · Portal do Cliente ·
                  Reconstructor IA
                </div>
                <div
                  style={{
                    fontSize: 16,
                    color: theme.textMuted,
                    marginTop: 4,
                  }}
                >
                  Previsibilidade executiva para gestores e facilidade em 1
                  clique para a equipe.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
