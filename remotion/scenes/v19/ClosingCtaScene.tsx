import { ArrowRight, Lock, ShieldCheck, Sparkles, Zap } from "lucide-react";
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
  GlowDot,
  GradientText,
  OptSolvLogo,
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 6 — Closing CTA & Enterprise Trust Pillars (0–240 frames = 8s)
 *
 * Concludes the showcase with brand presence, technical trust pillars
 * and the call to action for v1.9.0.
 */

const TRUST_PILLARS = [
  { icon: ShieldCheck, label: "Privacidade: Zero Áudio ou Transcrição" },
  { icon: Zap, label: "Microsoft Graph & Call Records" },
  { icon: Sparkles, label: "Reconstrução sem Alucinação" },
  { icon: Lock, label: "Governança & Controle RBAC" },
];

export const ClosingCtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const titleSpring = spring({
    frame: frame - 25,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const pillarsSpring = spring({
    frame: frame - 45,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const ctaSpring = spring({
    frame: frame - 70,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
      }}
    >
      <GlowDot x="50%" y="30%" size={800} opacity={0.18} color={theme.brand} />
      <GlowDot x="20%" y="70%" size={500} opacity={0.1} color={theme.azure} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 34,
          textAlign: "center",
        }}
      >
        {/* OptSolv Logo Mark */}
        <div
          style={{
            transform: `scale(${logoSpring})`,
            opacity: logoSpring,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 24,
              backgroundColor: `${theme.brand}20`,
              border: `1px solid ${theme.brand}50`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 15px 40px ${theme.brandGlow}`,
            }}
          >
            <OptSolvLogo size={42} color={theme.brand} />
          </div>
          <Badge color={theme.brand}>LANÇAMENTO OFICIAL · v1.9.0</Badge>
        </div>

        {/* Heading & Subtitle */}
        <div
          style={{
            opacity: titleSpring,
            transform: `translateY(${interpolate(titleSpring, [0, 1], [25, 0])}px)`,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
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
            Mais contexto no seu dia.
            <br />
            <GradientText>Decisões mais claras na sua gestão.</GradientText>
          </h1>
          <p
            style={{
              fontSize: 20,
              color: theme.textMuted,
              margin: 0,
              maxWidth: 780,
              lineHeight: 1.5,
            }}
          >
            Meu Tempo, Memória Microsoft 365, Chamadas Teams Verificadas e
            Central de Gestão Preditiva.
          </p>
        </div>

        {/* 4 Trust Pillars */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 14,
            opacity: pillarsSpring,
            transform: `translateY(${interpolate(pillarsSpring, [0, 1], [20, 0])}px)`,
          }}
        >
          {TRUST_PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 18px",
                  borderRadius: 12,
                  backgroundColor: theme.bgCard,
                  border: `1px solid ${theme.border}`,
                  fontSize: 14,
                  fontWeight: 600,
                  color: theme.white,
                }}
              >
                <Icon size={16} color={theme.brand} />
                <span>{p.label}</span>
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <div
          style={{
            opacity: ctaSpring,
            transform: `scale(${ctaSpring})`,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 36px",
              borderRadius: 14,
              backgroundColor: theme.brand,
              color: theme.white,
              fontSize: 18,
              fontWeight: 700,
              fontFamily: fonts.body,
              boxShadow: `0 15px 35px ${theme.brandGlow}`,
            }}
          >
            <span>Explore a v1.9.0 no Dashboard</span>
            <ArrowRight size={20} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
