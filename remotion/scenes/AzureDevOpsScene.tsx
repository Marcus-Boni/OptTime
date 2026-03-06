import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Badge, FadeIn, GlowDot, GradientText } from "../components/shared";
import { fonts, theme } from "../theme";

const features = [
  {
    icon: "🔄",
    title: "Sync automático",
    desc: "Work items sincronizados periodicamente",
  },
  {
    icon: "🔍",
    title: "Autocomplete",
    desc: "Busque tarefas por ID ou título",
  },
  {
    icon: "🔒",
    title: "PAT criptografado",
    desc: "Token armazenado com criptografia AES-256",
  },
  {
    icon: "📊",
    title: "Rastreabilidade",
    desc: "Horas vinculadas a work items de verdade",
  },
];

/** Scene 6 — Azure DevOps integration (frames 0–300 = 10s) */
export const AzureDevOpsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [270, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        opacity: fadeOut,
        overflow: "hidden",
      }}
    >
      <GlowDot x="50%" y="30%" size={600} opacity={0.06} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 120px",
          gap: 56,
        }}
      >
        {/* Header */}
        <FadeIn delay={0}>
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              alignItems: "center",
            }}
          >
            <Badge color={theme.info}>Integração nativa</Badge>
            <h2
              style={{
                fontSize: 52,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
              }}
            >
              Conectado ao{" "}
              <GradientText
                style={{
                  background: `linear-gradient(135deg, ${theme.info}, #60a5fa)`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Azure DevOps
              </GradientText>
            </h2>
          </div>
        </FadeIn>

        {/* Connection diagram */}
        <FadeIn delay={15}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 40,
              padding: "32px 48px",
              borderRadius: 20,
              background: theme.bgCard,
              border: `1px solid ${theme.border}`,
            }}
          >
            {/* OptSolv side */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 18,
                  background: `linear-gradient(135deg, ${theme.brand}, ${theme.brandLight})`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-label="OptSolv Time logo"
                >
                  <title>OptSolv Time logo</title>
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 7v5l3.5 3.5"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <span
                style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
              >
                OptSolv Time
              </span>
            </div>

            {/* Connection arrows */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((i) => {
                const arrowDelay = 25 + i * 12;
                const progress = interpolate(
                  frame,
                  [arrowDelay, arrowDelay + 20],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );
                return (
                  <div
                    key={`arrow-${i}`}
                    style={{
                      width: 120,
                      height: 3,
                      borderRadius: 2,
                      background: `linear-gradient(90deg, ${theme.brand}${Math.round(
                        progress * 255,
                      )
                        .toString(16)
                        .padStart(2, "0")}, ${theme.info}${Math.round(
                        progress * 255,
                      )
                        .toString(16)
                        .padStart(2, "0")})`,
                    }}
                  />
                );
              })}
              <span
                style={{
                  fontSize: 12,
                  color: theme.textDimmed,
                  fontFamily: fonts.mono,
                  marginTop: 4,
                }}
              >
                REST API + PAT
              </span>
            </div>

            {/* Azure DevOps side */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 18,
                  background: `linear-gradient(135deg, ${theme.info}, #60a5fa)`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 36,
                }}
              >
                ⓐ
              </div>
              <span
                style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
              >
                Azure DevOps
              </span>
            </div>
          </div>
        </FadeIn>

        {/* Feature cards */}
        <div style={{ display: "flex", gap: 24 }}>
          {features.map((feat, i) => {
            const cardDelay = 30 + i * 15;
            const s = spring({
              frame: frame - cardDelay,
              fps,
              config: { damping: 14, stiffness: 120 },
            });

            return (
              <div
                key={feat.title}
                style={{
                  flex: 1,
                  padding: "28px 24px",
                  borderRadius: 16,
                  background: theme.bgCard,
                  border: `1px solid ${theme.border}`,
                  transform: `scale(${s})`,
                  opacity: s,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  alignItems: "center",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: 36 }}>{feat.icon}</span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: theme.white,
                    fontFamily: fonts.display,
                  }}
                >
                  {feat.title}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    color: theme.textMuted,
                    lineHeight: 1.4,
                  }}
                >
                  {feat.desc}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
