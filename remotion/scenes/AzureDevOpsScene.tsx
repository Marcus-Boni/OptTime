import { BarChart3, Lock, RefreshCw, Search } from "lucide-react";
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

const features = [
  {
    icon: RefreshCw,
    title: "Sync automático",
    desc: "Work items (Task, Bug, User Story) sincronizados em tempo real",
  },
  {
    icon: Search,
    title: "Autocomplete inteligente",
    desc: "Busque tarefas por ID (#123) ou título instantaneamente",
  },
  {
    icon: Lock,
    title: "PAT Criptografado",
    desc: "Token armazenado no PostgreSQL com criptografia AES-256",
  },
  {
    icon: BarChart3,
    title: "Completed Work Sync",
    desc: "Atualização automática de horas concluídas no Azure",
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
      <GlowDot x="50%" y="30%" size={650} opacity={0.1} color={theme.azure} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 120px",
          gap: 52,
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
            <Badge color={theme.azure}>Integração Nativa Azure</Badge>
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
                  background: `linear-gradient(135deg, ${theme.azureLight}, ${theme.info})`,
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
              gap: 48,
              padding: "36px 56px",
              borderRadius: 24,
              background: theme.bgCard,
              border: `1px solid ${theme.borderLight}`,
              boxShadow: `0 20px 60px ${theme.azureGlow}`,
            }}
          >
            {/* OptSolv side */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 22,
                  background: `linear-gradient(135deg, ${theme.brand}, ${theme.brandLight})`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  boxShadow: `0 12px 30px ${theme.brandGlow}`,
                }}
              >
                <OptSolvLogo size={36} color="#ffffff" />
              </div>
              <span
                style={{ fontSize: 18, fontWeight: 700, color: theme.white }}
              >
                OptSolv Time
              </span>
            </div>

            {/* Connection arrows & REST API indicator */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
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
                      width: 140,
                      height: 4,
                      borderRadius: 2,
                      background: `linear-gradient(90deg, ${theme.brand}, ${theme.azure})`,
                      opacity: progress,
                    }}
                  />
                );
              })}
              <span
                style={{
                  fontSize: 13,
                  color: theme.azureLight,
                  fontFamily: fonts.mono,
                  marginTop: 4,
                  fontWeight: 600,
                }}
              >
                REST API v7.1 + PAT AES-256
              </span>
            </div>

            {/* Azure DevOps side */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 22,
                  background: theme.bgCard,
                  border: `1px solid ${theme.azure}40`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  boxShadow: `0 12px 30px ${theme.azureGlow}`,
                }}
              >
                <AzureDevOpsLogo size={48} />
              </div>

              <span
                style={{ fontSize: 18, fontWeight: 700, color: theme.white }}
              >
                Azure DevOps
              </span>
            </div>
          </div>
        </FadeIn>

        {/* Feature cards */}
        <div style={{ display: "flex", gap: 24, width: "100%" }}>
          {features.map((feat, i) => {
            const cardDelay = 30 + i * 15;
            const s = spring({
              frame: frame - cardDelay,
              fps,
              config: { damping: 14, stiffness: 120 },
            });
            const FeatIcon = feat.icon;

            return (
              <div
                key={feat.title}
                style={{
                  flex: 1,
                  padding: "26px 20px",
                  borderRadius: 18,
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
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    background: `${theme.azure}18`,
                    border: `1px solid ${theme.azure}35`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FeatIcon size={26} color={theme.azureLight} />
                </div>

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
                    fontSize: 14,
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
