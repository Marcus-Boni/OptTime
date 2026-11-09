import { ArrowRight, CalendarDays, Database, Mic } from "lucide-react";
import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Badge, GlowDot, GradientText } from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 1 — Problem & Friction: O Atrito do Apontamento Sem Voz e Contexto Disperso (0–270 frames = 9s)
 *
 * Exposes the operational frictions prior to v1.12.0:
 * 1. Sem Feedback Vocal Real: Comandos falados sem visualização de ondas ou certeza de envio.
 * 2. Conversas Presas ao Aparelho: Contexto perdido ao trocar entre desktop, notebook e smartphone.
 * 3. Feriados e Emendas Manuais: Capacidade e metas distorcidas sem atualização automática de feriados.
 *
 * Resolves into the v1.12.0 core value proposition at frame 145.
 */

const frictionPoints = [
  {
    icon: Mic,
    title: "Comandos sem Feedback Vocal",
    detail:
      "Falar com o assistente sem saber se a voz está sendo captada e sem previsibilidade do auto-envio.",
    color: theme.warning,
  },
  {
    icon: Database,
    title: "Contexto Preso ao Aparelho",
    detail:
      "Conversas e planos iniciados no desktop que desaparecem ao alternar para o notebook ou celular.",
    color: theme.error,
  },
  {
    icon: CalendarDays,
    title: "Feriados Distorcendo Metas",
    detail:
      "Feriados nacionais e municipais calculados à mão, gerando inconsistências na capacidade semanal.",
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
          position: "relative",
        }}
      >
        {/* Phase 1: The Friction Points */}
        <div
          style={{
            opacity: frictionExit,
            transform: `translateY(${frictionY}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div style={{ marginBottom: 18 }}>
            <Badge color={theme.error}>O Atrito Antes da v1.12.0</Badge>
          </div>

          <h1
            style={{
              fontFamily: fonts.display,
              fontSize: 54,
              fontWeight: 700,
              color: theme.white,
              lineHeight: 1.15,
              marginBottom: 16,
              maxWidth: 1200,
            }}
          >
            Falta de feedback acústico e{" "}
            <span style={{ color: theme.error }}>contexto disperso</span>
          </h1>

          <p
            style={{
              fontSize: 22,
              color: theme.textMuted,
              maxWidth: 900,
              lineHeight: 1.45,
              marginBottom: 48,
            }}
          >
            Trabalho fragmentado entre múltiplos dispositivos e esforço manual
            para ajustar metas em dias de feriado
          </p>

          <div
            style={{
              display: "flex",
              gap: 24,
              width: "100%",
              maxWidth: 1280,
              justifyContent: "center",
            }}
          >
            {frictionPoints.map((item, index) => {
              const itemSpring = spring({
                frame: frame - 15 - index * 12,
                fps,
                config: { damping: 14, stiffness: 120 },
              });
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  style={{
                    flex: 1,
                    minHeight: 220,
                    backgroundColor: theme.bgCard,
                    border: `1px solid ${theme.borderLight}`,
                    borderRadius: 20,
                    padding: "32px 28px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    textAlign: "left",
                    transform: `scale(${itemSpring})`,
                    opacity: itemSpring,
                    boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      backgroundColor: `${item.color}20`,
                      border: `1px solid ${item.color}40`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 20,
                    }}
                  >
                    <Icon size={26} color={item.color} />
                  </div>
                  <h3
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: theme.white,
                      marginBottom: 10,
                      fontFamily: fonts.display,
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 16,
                      color: theme.textMuted,
                      lineHeight: 1.45,
                    }}
                  >
                    {item.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Phase 2: The v1.12.0 Solution Transition */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            transform: `translateY(-50%) scale(${solutionSpring})`,
            opacity: solutionSpring,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
            pointerEvents: "none",
          }}
        >
          <div style={{ marginBottom: 20 }}>
            <Badge color={theme.brand}>Apresentando OptSolv v1.12.0</Badge>
          </div>

          <h2
            style={{
              fontFamily: fonts.display,
              fontSize: 64,
              fontWeight: 800,
              color: theme.white,
              lineHeight: 1.15,
              marginBottom: 20,
              maxWidth: 1200,
            }}
          >
            Inteligência Conversacional,{" "}
            <GradientText>Feriados & Continuidade</GradientText>
          </h2>

          <p
            style={{
              fontSize: 24,
              color: theme.textMuted,
              maxWidth: 960,
              lineHeight: 1.45,
              marginBottom: 36,
            }}
          >
            Espectro vocal de 44 barras em tempo real, nuvem PostgreSQL com
            imunidade a replay e ajuste automático de capacidade por feriados
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 28px",
              backgroundColor: `${theme.brand}15`,
              border: `1px solid ${theme.brand}40`,
              borderRadius: 999,
              color: theme.brandLight,
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            <span>Assista à demonstração completa</span>
            <ArrowRight size={20} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
