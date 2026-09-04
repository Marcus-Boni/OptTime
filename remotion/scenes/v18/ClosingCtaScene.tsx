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
} from "../../components/shared";
import { fonts, theme } from "../../theme";

/**
 * Scene 6 — Closing CTA & Governance Badges (0–240 frames = 8s)
 *
 * Concludes the showcase with brand presence, technical trust pillars
 * and the call to action for v1.8.0.
 */

const TRUST_PILLARS = [
  { icon: ShieldCheck, label: "Segurança Scrypt & HMAC" },
  { icon: Zap, label: "Sync Azure DevOps & Outlook" },
  { icon: Sparkles, label: "Zero Alucinação de IA" },
  { icon: Lock, label: "Role-gate & Governança" },
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
          gap: 36,
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
          <Badge color={theme.brand}>LANÇAMENTO OFICIAL · v1.8.0</Badge>
        </div>

        {/* Title & Headline */}
        <div
          style={{
            transform: `translateY(${interpolate(titleSpring, [0, 1], [30, 0])}px)`,
            opacity: titleSpring,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <h1
            style={{
              fontSize: 58,
              fontWeight: 700,
              color: theme.white,
              margin: 0,
              fontFamily: fonts.display,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            O Futuro da Gestão de Horas.
            <br />
            <GradientText>Disponível hoje no OptSolv Time.</GradientText>
          </h1>
          <p
            style={{
              fontSize: 18,
              color: theme.textMuted,
              maxWidth: 720,
              margin: 0,
            }}
          >
            Central HQ · Microsoft Teams · Live Portal do Cliente · Magic
            Reconstructor
          </p>
        </div>

        {/* Trust Badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: 900,
          }}
        >
          {TRUST_PILLARS.map((pillar, idx) => {
            const pillarSpring = spring({
              frame: frame - (45 + idx * 10),
              fps,
              config: { damping: 15, stiffness: 120 },
            });
            const Icon = pillar.icon;

            return (
              <div
                key={pillar.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: theme.bgCard,
                  border: `1px solid ${theme.border}`,
                  padding: "8px 16px",
                  borderRadius: 12,
                  fontSize: 13.5,
                  color: theme.white,
                  opacity: pillarSpring,
                  transform: `translateY(${interpolate(pillarSpring, [0, 1], [20, 0])}px)`,
                }}
              >
                <Icon size={16} color={theme.brandLight} />
                <span>{pillar.label}</span>
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
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              backgroundColor: theme.brand,
              borderRadius: 16,
              padding: "16px 36px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              color: theme.white,
              fontWeight: 700,
              fontSize: 18,
              boxShadow: `0 10px 40px ${theme.brandGlow}, 0 0 0 1px ${theme.brandLight}50`,
            }}
          >
            <span>Acesse agora: app.optsolv.com</span>
            <ArrowRight size={20} />
          </div>
          <div style={{ fontSize: 13, color: theme.textDimmed }}>
            Disponível para todos os colaboradores e gestores da organização.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
