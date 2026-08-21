import { ArrowRight, Check, Code2, MousePointer2, Timer } from "lucide-react";
import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Badge, FadeIn, GlowDot, GradientText } from "../../components/shared";
import { fonts, theme } from "../../theme";

/**
 * Scene 1 — The context switch problem (0–300 frames = 10s)
 *
 * Opens on the friction everyone recognises: the work is done, and only then
 * does the bookkeeping start. The three steps fade in one by one, then collapse
 * into the promise that replaces them.
 */

const frictionSteps = [
  { icon: MousePointer2, label: "Sair do editor", detail: "abrir o navegador" },
  { icon: Timer, label: "Lembrar o que fez", detail: "e por quanto tempo" },
  {
    icon: Code2,
    label: "Achar o Work Item",
    detail: "e preencher o formulário",
  },
];

export const ContextSwitchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [275, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // The friction list dominates the first half, then yields to the promise.
  const showPromise = frame >= 170;
  const promiseSpring = spring({
    frame: frame - 170,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const frictionExit = interpolate(frame, [160, 185], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot x="50%" y="20%" size={760} opacity={0.14} color={theme.brand} />
      <GlowDot x="12%" y="72%" size={460} opacity={0.08} color={theme.purple} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 110px",
          gap: 44,
        }}
      >
        <FadeIn delay={0}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              textAlign: "center",
            }}
          >
            <Badge color={theme.brand}>NOVIDADE · v1.7.0</Badge>
            <h1
              style={{
                fontSize: 62,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
              }}
            >
              A feature ficou pronta.
              <br />
              <GradientText>Agora vem a parte chata.</GradientText>
            </h1>
          </div>
        </FadeIn>

        {!showPromise ? (
          <div
            style={{
              display: "flex",
              gap: 22,
              opacity: frictionExit,
              transform: `translateY(${(1 - frictionExit) * -20}px)`,
            }}
          >
            {frictionSteps.map((step, index) => {
              const stepIn = spring({
                frame: frame - (40 + index * 26),
                fps,
                config: { damping: 16, stiffness: 120 },
              });
              const Icon = step.icon;

              return (
                <div
                  key={step.label}
                  style={{
                    width: 300,
                    background: theme.bgCard,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 20,
                    padding: "26px 28px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    transform: `scale(${stepIn})`,
                    opacity: stepIn,
                  }}
                >
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      background: "rgba(239, 68, 68, 0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={24} color={theme.error} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 600,
                        color: theme.white,
                        fontFamily: fonts.display,
                      }}
                    >
                      {step.label}
                    </div>
                    <div
                      style={{
                        fontSize: 17,
                        color: theme.textMuted,
                        marginTop: 4,
                      }}
                    >
                      {step.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              transform: `scale(${promiseSpring})`,
              opacity: promiseSpring,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 26,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                background: theme.bgCard,
                border: `1px solid ${theme.brand}40`,
                borderRadius: 999,
                padding: "18px 38px",
                boxShadow: `0 24px 70px ${theme.brandGlow}`,
              }}
            >
              <Check size={30} color={theme.success} />
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 600,
                  color: theme.white,
                  fontFamily: fonts.display,
                }}
              >
                Ou você só{" "}
                <GradientText style={{ fontWeight: 700 }}>fala</GradientText> —
                e pronto.
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontSize: 20,
                color: theme.textMuted,
              }}
            >
              <span>Do seu editor</span>
              <ArrowRight size={20} color={theme.brand} />
              <span>Direto no OptSolv</span>
              <ArrowRight size={20} color={theme.brand} />
              <span>Sem abrir o navegador</span>
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
