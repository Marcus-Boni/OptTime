import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  AzureDevOpsLogo,
  Badge,
  FadeIn,
  GlowDot,
  GradientText,
  OptSolvLogo,
} from "../components/shared";
import { fonts, theme } from "../theme";

/** Scene 1 — Intro with logo and tagline (0–5s = 150 frames) */
export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });
  const lineWidth = interpolate(frame, [30, 70], [0, 360], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [120, 150], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: fonts.display,
        opacity: fadeOut,
        overflow: "hidden",
      }}
    >
      <GlowDot x="35%" y="25%" size={650} opacity={0.12} />
      <GlowDot x="55%" y="60%" size={450} opacity={0.08} color={theme.azure} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          transform: `scale(${logoScale})`,
        }}
      >
        {/* Official OptSolv Logo icon container */}
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: 28,
            background: `linear-gradient(135deg, ${theme.brand}, ${theme.brandLight})`,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            boxShadow: `0 24px 70px ${theme.brandGlow}, inset 0 1px 1px rgba(255,255,255,0.4)`,
          }}
        >
          <OptSolvLogo size={52} color="#ffffff" />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <h1
            style={{
              fontSize: 76,
              fontWeight: 800,
              color: theme.white,
              margin: 0,
              letterSpacing: -2,
            }}
          >
            OptSolv <GradientText>Time</GradientText>
          </h1>

          {/* Animated underline */}
          <div
            style={{
              height: 4,
              width: lineWidth,
              background: `linear-gradient(90deg, ${theme.brand}, ${theme.azure})`,
              borderRadius: 2,
            }}
          />
        </div>

        <FadeIn delay={25} durationFrames={20}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Badge color={theme.azure}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <AzureDevOpsLogo size={20} />
                Azure DevOps Integrated
              </span>
            </Badge>
          </div>
        </FadeIn>

        <FadeIn delay={40} durationFrames={20}>
          <p
            style={{
              fontSize: 28,
              color: theme.textMuted,
              margin: 0,
              fontFamily: fonts.body,
              fontWeight: 400,
              textAlign: "center",
              maxWidth: 720,
              lineHeight: 1.4,
            }}
          >
            Gestão inteligente de tempo, aprovação de timesheets e analytics
            em tempo real.
          </p>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};

