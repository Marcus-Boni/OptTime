import { ArrowRight, Bot, Layers, ShieldCheck, Zap } from "lucide-react";
import type React from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Badge,
  GlowDot,
  GradientText,
  OptSolvLogo,
  TeamsLogoMark,
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 6 — Closing CTA & Enterprise Trust Pillars v1.10.0 (0–240 frames = 8s)
 *
 * Concludes the showcase with brand presence, technical trust pillars
 * and the call to action for v1.10.0.
 */

const TRUST_PILLARS = [
  { icon: Bot, label: "OptTime Nativo no Teams em Qualquer Canal" },
  { icon: Zap, label: "Lembretes Proativos com Duração Real de Chamada" },
  { icon: Layers, label: "Fases Segregadas com mesmo Azure DevOps" },
  { icon: ShieldCheck, label: "IA Multi-Provedor com Fallback Determinístico" },
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
          gap: 32,
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
            <OptSolvLogo size={46} color={theme.brand} />
          </div>

          <Badge color={theme.brand}>LANÇAMENTO OFICIAL · v1.10.0</Badge>
        </div>

        {/* Headline */}
        <div
          style={{
            transform: `scale(${titleSpring})`,
            opacity: titleSpring,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <h1
            style={{
              fontFamily: fonts.display,
              fontSize: 52,
              fontWeight: 800,
              color: theme.white,
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            OptSolv Time <GradientText>v1.10.0</GradientText>
          </h1>
          <p
            style={{
              fontSize: 22,
              color: theme.textMuted,
              maxWidth: 820,
              margin: 0,
            }}
          >
            A inteligência de horas que trabalha onde você trabalha. No
            Microsoft Teams, no Azure DevOps e em todo o seu dia.
          </p>
        </div>

        {/* 4 Trust Pillars */}
        <div
          style={{
            transform: `scale(${pillarsSpring})`,
            opacity: pillarsSpring,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            width: "100%",
            maxWidth: 1100,
          }}
        >
          {TRUST_PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.label}
                style={{
                  backgroundColor: theme.bgCard,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 14,
                  padding: "16px 14px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: `${theme.brand}15`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.brandLight,
                  }}
                >
                  <Icon size={20} />
                </div>
                <span
                  style={{
                    fontSize: 13,
                    color: theme.white,
                    fontWeight: 600,
                    lineHeight: 1.3,
                  }}
                >
                  {pillar.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Call to Action Button */}
        <div
          style={{
            transform: `scale(${ctaSpring})`,
            opacity: ctaSpring,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              backgroundColor: theme.brand,
              color: theme.white,
              padding: "16px 36px",
              borderRadius: 14,
              fontSize: 18,
              fontWeight: 700,
              fontFamily: fonts.display,
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: `0 10px 30px ${theme.brandGlow}`,
            }}
          >
            <TeamsLogoMark size={22} />
            <span>Experimente a v1.10.0 no Microsoft Teams</span>
            <ArrowRight size={20} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
