import {
  ArrowRight,
  CalendarDays,
  Database,
  FileText,
  Mic,
} from "lucide-react";
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
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 6 — Closing CTA & Enterprise Trust Pillars v1.12.0 (0–240 frames = 8s)
 *
 * Concludes the showcase with brand presence, technical trust pillars
 * and the call to action for v1.12.0.
 */

const TRUST_PILLARS = [
  {
    icon: Mic,
    label: "Espectro Vocal de 44 Barras & Silêncio VAD",
  },
  {
    icon: Database,
    label: "Nuvem PostgreSQL com Imunidade a Replay",
  },
  {
    icon: CalendarDays,
    label: "Calendário Automático de Feriados & Metas",
  },
  {
    icon: FileText,
    label: "Aprovações Ágeis & Relatórios M2M (PDF/JSON)",
  },
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
              boxShadow: `0 0 50px ${theme.brandGlow}`,
            }}
          >
            <OptSolvLogo size={48} color={theme.brand} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Badge color={theme.brand}>Versão Oficial 1.12.0</Badge>
          </div>
        </div>

        {/* Main Headline */}
        <div
          style={{
            transform: `scale(${titleSpring})`,
            opacity: titleSpring,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h1
            style={{
              fontFamily: fonts.display,
              fontSize: 56,
              fontWeight: 800,
              color: theme.white,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            Inteligência Conversacional,{" "}
            <GradientText>Feriados & Continuidade</GradientText>
          </h1>
          <p
            style={{
              fontSize: 22,
              color: theme.textMuted,
              maxWidth: 900,
              lineHeight: 1.45,
            }}
          >
            A plataforma definitiva de apontamento, produtividade e governança
            em tempo real para times de engenharia
          </p>
        </div>

        {/* 4 Pillars Grid */}
        <div
          style={{
            transform: `scale(${pillarsSpring})`,
            opacity: pillarsSpring,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 18,
            width: "100%",
            maxWidth: 1280,
          }}
        >
          {TRUST_PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.label}
                style={{
                  backgroundColor: theme.bgCard,
                  border: `1px solid ${theme.borderLight}`,
                  borderRadius: 16,
                  padding: "20px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "left",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: `${theme.brand}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={20} color={theme.brand} />
                </div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: theme.white,
                    lineHeight: 1.35,
                  }}
                >
                  {pillar.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <div
          style={{
            transform: `scale(${ctaSpring})`,
            opacity: ctaSpring,
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginTop: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 38px",
              borderRadius: 14,
              backgroundColor: theme.brand,
              color: theme.white,
              fontSize: 18,
              fontWeight: 700,
              boxShadow: `0 0 35px ${theme.brandGlow}`,
            }}
          >
            <span>Experimente as Novidades na v1.12.0</span>
            <ArrowRight size={22} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
