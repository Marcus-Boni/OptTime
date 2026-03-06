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

/** Scene 9 — CTA / Closing (frames 0–240 = 8s) */
export const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80 },
  });

  const pulseScale = interpolate(Math.sin(frame * 0.08), [-1, 1], [1, 1.04]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.display,
        overflow: "hidden",
      }}
    >
      <GlowDot x="30%" y="20%" size={700} opacity={0.1} />
      <GlowDot x="60%" y="60%" size={500} opacity={0.08} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 36,
        }}
      >
        {/* Logo */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: `linear-gradient(135deg, ${theme.brand}, ${theme.brandLight})`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              boxShadow: `0 20px 60px ${theme.brandGlow}`,
            }}
          >
            <svg
              width="44"
              height="44"
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
        </div>

        <FadeIn delay={10} durationFrames={20}>
          <h2
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: theme.white,
              margin: 0,
              textAlign: "center",
              lineHeight: 1.2,
              letterSpacing: -2,
            }}
          >
            Registre tempo em <GradientText>menos de 2 min/dia</GradientText>
          </h2>
        </FadeIn>

        <FadeIn delay={25} durationFrames={20}>
          <p
            style={{
              fontSize: 24,
              color: theme.textMuted,
              margin: 0,
              textAlign: "center",
              fontFamily: fonts.body,
              maxWidth: 700,
              lineHeight: 1.5,
            }}
          >
            Timer, aprovação, relatórios e integração Azure DevOps. Tudo em uma
            única plataforma.
          </p>
        </FadeIn>

        <FadeIn delay={40} durationFrames={15}>
          <div
            style={{
              display: "flex",
              gap: 20,
              alignItems: "center",
              marginTop: 12,
            }}
          >
            <div
              style={{
                padding: "18px 44px",
                borderRadius: 14,
                background: `linear-gradient(135deg, ${theme.brand}, ${theme.brandDark})`,
                color: "white",
                fontSize: 20,
                fontWeight: 700,
                boxShadow: `0 12px 40px ${theme.brandGlow}`,
                transform: `scale(${pulseScale})`,
              }}
            >
              Comece agora →
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={55} durationFrames={15}>
          <div
            style={{
              display: "flex",
              gap: 32,
              marginTop: 20,
            }}
          >
            {[
              { stat: "< 2 min", label: "por dia" },
              { stat: "100%", label: "conformidade" },
              { stat: "Azure", label: "integrado" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: theme.brand,
                    fontFamily: fonts.mono,
                  }}
                >
                  {item.stat}
                </span>
                <span style={{ fontSize: 14, color: theme.textDimmed }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Watermark */}
        <FadeIn delay={70}>
          <span
            style={{
              fontSize: 14,
              color: theme.textDimmed,
              fontFamily: fonts.body,
              marginTop: 20,
            }}
          >
            OptSolv © 2026 — Hackathon Interno
          </span>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};
