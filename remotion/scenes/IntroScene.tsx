import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FadeIn, GlowDot, GradientText } from "../components/shared";
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
  const lineWidth = interpolate(frame, [30, 70], [0, 300], {
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
      }}
    >
      <GlowDot x="35%" y="25%" size={600} opacity={0.08} />
      <GlowDot x="55%" y="60%" size={400} opacity={0.06} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          transform: `scale(${logoScale})`,
        }}
      >
        {/* Logo icon */}
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 24,
            background: `linear-gradient(135deg, ${theme.brand}, ${theme.brandLight})`,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            boxShadow: `0 20px 60px ${theme.brandGlow}`,
          }}
        >
          <svg
            width="56"
            height="56"
            viewBox="0 0 24 24"
            fill="none"
            aria-label="OptSolv Time logo"
          >
            <title>OptSolv Time logo</title>
            <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2" />
            <path
              d="M12 7v5l3.5 3.5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <h1
            style={{
              fontSize: 72,
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
              height: 3,
              width: lineWidth,
              background: `linear-gradient(90deg, ${theme.brand}, transparent)`,
              borderRadius: 2,
            }}
          />
        </div>

        <FadeIn delay={25} durationFrames={20}>
          <p
            style={{
              fontSize: 28,
              color: theme.textMuted,
              margin: 0,
              fontFamily: fonts.body,
              fontWeight: 400,
            }}
          >
            Registro inteligente de tempo integrado ao Azure DevOps
          </p>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};
