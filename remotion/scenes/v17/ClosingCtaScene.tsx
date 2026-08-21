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
  OptSolvLogo,
} from "../../components/shared";
import { fonts, theme } from "../../theme";

/**
 * Scene 6 — Closing CTA (0–210 frames = 7s)
 *
 * Leaves the viewer with the one thing they must remember: where to turn it on.
 */
export const ClosingCtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100 },
  });

  const fadeOut = interpolate(frame, [185, 210], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowPulse = interpolate(Math.sin(frame / 18), [-1, 1], [0.14, 0.24]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot
        x="50%"
        y="30%"
        size={900}
        opacity={glowPulse}
        color={theme.brand}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 30,
        }}
      >
        <div
          style={{
            transform: `scale(${logoSpring})`,
            opacity: logoSpring,
            display: "flex",
            alignItems: "center",
            gap: 22,
          }}
        >
          <OptSolvLogo size={64} color={theme.white} />
          <span
            style={{
              fontSize: 66,
              fontWeight: 700,
              color: theme.white,
              fontFamily: fonts.display,
              letterSpacing: "-0.03em",
            }}
          >
            OptSolv Time
          </span>
        </div>

        <FadeIn delay={22}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
            }}
          >
            <Badge color={theme.brand}>v1.7.0 · SERVIDOR MCP</Badge>

            <h2
              style={{
                fontSize: 44,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                textAlign: "center",
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}
            >
              Apontar horas virou <GradientText>parte da conversa</GradientText>
            </h2>
          </div>
        </FadeIn>

        <FadeIn delay={48}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: theme.bgCard,
              border: `1px solid ${theme.brand}35`,
              borderRadius: 999,
              padding: "16px 34px",
              fontFamily: fonts.mono,
              fontSize: 21,
              color: theme.textMuted,
            }}
          >
            Configurações <span style={{ color: theme.brand }}>→</span>{" "}
            Integrações <span style={{ color: theme.brand }}>→</span>{" "}
            <span style={{ color: theme.white }}>Agentes de IA (MCP)</span>
          </div>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};
