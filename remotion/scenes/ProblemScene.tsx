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

const problems = [
  {
    icon: "📋",
    title: "Planilhas manuais",
    desc: "Erros, inconsistências e zero rastreabilidade",
  },
  {
    icon: "🔌",
    title: "Sem integração",
    desc: "Horas desconectadas dos work items do Azure DevOps",
  },
  {
    icon: "⏳",
    title: "Aprovação lenta",
    desc: "Sem fluxo estruturado de submit e approve",
  },
  {
    icon: "📊",
    title: "Sem visibilidade",
    desc: "Gerentes sem dados em tempo real da equipe",
  },
];

/** Scene 2 — Problem statement (frames 0–300 = 10s) */
export const ProblemScene: React.FC = () => {
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
      <GlowDot x="-5%" y="30%" size={500} opacity={0.06} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 120px",
          gap: 60,
        }}
      >
        <FadeIn delay={0} durationFrames={20}>
          <h2
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: theme.white,
              fontFamily: fonts.display,
              textAlign: "center",
              margin: 0,
            }}
          >
            O problema que <GradientText>resolvemos</GradientText>
          </h2>
        </FadeIn>

        <div
          style={{
            display: "flex",
            gap: 32,
            width: "100%",
          }}
        >
          {problems.map((p, i) => {
            const delay = 20 + i * 18;
            const s = spring({
              frame: frame - delay,
              fps,
              config: { damping: 14, stiffness: 120 },
            });

            return (
              <div
                key={p.title}
                style={{
                  flex: 1,
                  padding: "36px 28px",
                  borderRadius: 20,
                  border: `1px solid ${theme.border}`,
                  background: theme.bgCard,
                  transform: `scale(${s}) translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
                  opacity: s,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <span style={{ fontSize: 40 }}>{p.icon}</span>
                <h3
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: theme.white,
                    margin: 0,
                    fontFamily: fonts.display,
                  }}
                >
                  {p.title}
                </h3>
                <p
                  style={{
                    fontSize: 17,
                    color: theme.textMuted,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {p.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
