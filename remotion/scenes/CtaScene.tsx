import type React from "react";
import { ArrowRight } from "lucide-react";
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
      <GlowDot x="30%" y="20%" size={700} opacity={0.12} />
      <GlowDot x="60%" y="60%" size={500} opacity={0.08} color={theme.azure} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 32,
        }}
      >
        {/* Logos container */}
        <div
          style={{
            transform: `scale(${logoScale})`,
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 22,
              background: `linear-gradient(135deg, ${theme.brand}, ${theme.brandLight})`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              boxShadow: `0 20px 60px ${theme.brandGlow}`,
            }}
          >
            <OptSolvLogo size={44} color="#ffffff" />
          </div>

          <span
            style={{
              fontSize: 32,
              color: theme.textDimmed,
              fontWeight: 300,
            }}
          >
            +
          </span>

          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 22,
              background: theme.bgCard,
              border: `1px solid ${theme.azure}40`,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              boxShadow: `0 20px 60px ${theme.azureGlow}`,
            }}
          >
            <AzureDevOpsLogo size={52} />
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
              marginTop: 8,
            }}
          >
            <div
              style={{
                padding: "18px 48px",
                borderRadius: 16,
                background: `linear-gradient(135deg, ${theme.brand}, ${theme.brandDark})`,
                color: "white",
                fontSize: 20,
                fontWeight: 700,
                boxShadow: `0 12px 40px ${theme.brandGlow}`,
                transform: `scale(${pulseScale})`,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              Comece a usar agora
              <ArrowRight size={22} color="white" />
            </div>

          </div>
        </FadeIn>

        <FadeIn delay={55} durationFrames={15}>
          <div
            style={{
              display: "flex",
              gap: 36,
              marginTop: 16,
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
              marginTop: 16,
            }}
          >
            OptSolv Time Tracker © 2026 — Hackathon Interno
          </span>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};

