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
  BrowserFrame,
  FadeIn,
  GlowDot,
  GradientText,
} from "../components/shared";
import { fonts, theme } from "../theme";

const formFields = [
  { label: "Projeto", value: "OptSolv Time Tracker", icon: "🔶" },
  { label: "Work Item", value: "#4521 — Implementar dashboard", icon: "🔗" },
  { label: "Data", value: "06/03/2026", icon: "📅" },
  { label: "Duração", value: "2h30m", icon: "⏱" },
  {
    label: "Descrição",
    value: "Desenvolvimento do módulo de relatórios",
    icon: "📝",
  },
];

/** Scene 4 — Manual entry form showcase (frames 0–300 = 10s) */
export const ManualEntryScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [270, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const browserSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14 },
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
      <GlowDot x="10%" y="50%" size={500} opacity={0.06} />

      <div
        style={{
          display: "flex",
          height: "100%",
          alignItems: "center",
          padding: "0 100px",
          gap: 80,
        }}
      >
        {/* Left: browser mock */}
        <div
          style={{
            flex: 1,
            transform: `scale(${browserSpring})`,
            opacity: browserSpring,
          }}
        >
          <BrowserFrame url="app.optsolv.com/time/new">
            <div
              style={{
                padding: 36,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <h3
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: theme.white,
                  margin: 0,
                  fontFamily: fonts.display,
                }}
              >
                Nova entrada de tempo
              </h3>

              {formFields.map((field, i) => {
                const fieldDelay = 30 + i * 20;
                const typed = interpolate(
                  frame,
                  [fieldDelay, fieldDelay + 15],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                );
                const charsToShow = Math.floor(typed * field.value.length);

                return (
                  <div
                    key={field.label}
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: theme.textDimmed,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}
                    >
                      {field.icon} {field.label}
                    </span>
                    <div
                      style={{
                        padding: "12px 16px",
                        borderRadius: 10,
                        border: `1px solid ${typed > 0 ? theme.brand + "60" : theme.border}`,
                        background: theme.bgCard,
                        color: typed > 0 ? theme.white : theme.textDimmed,
                        fontSize: 16,
                        fontFamily:
                          field.label === "Duração" ? fonts.mono : fonts.body,
                        transition: "border-color 0.3s",
                      }}
                    >
                      {charsToShow > 0
                        ? field.value.slice(0, charsToShow)
                        : "..."}
                      {typed > 0 && typed < 1 && (
                        <span
                          style={{
                            display: "inline-block",
                            width: 2,
                            height: 18,
                            background: theme.brand,
                            marginLeft: 2,
                            verticalAlign: "text-bottom",
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Billable toggle + Submit */}
              <FadeIn delay={140} durationFrames={15}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        background: theme.brand,
                        display: "flex",
                        alignItems: "center",
                        padding: 2,
                        justifyContent: "flex-end",
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          background: "white",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 14, color: theme.textMuted }}>
                      Billable
                    </span>
                  </div>

                  <div
                    style={{
                      padding: "12px 32px",
                      borderRadius: 12,
                      background: theme.brand,
                      color: "white",
                      fontSize: 16,
                      fontWeight: 700,
                    }}
                  >
                    Salvar entrada
                  </div>
                </div>
              </FadeIn>
            </div>
          </BrowserFrame>
        </div>

        {/* Right: explanation */}
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: 28 }}
        >
          <FadeIn delay={0}>
            <Badge>Entrada manual</Badge>
          </FadeIn>
          <FadeIn delay={10}>
            <h2
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                lineHeight: 1.2,
              }}
            >
              Registro <GradientText>flexível</GradientText>
            </h2>
          </FadeIn>
          <FadeIn delay={20}>
            <p
              style={{
                fontSize: 20,
                color: theme.textMuted,
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              Aceita formatos naturais como "2h30", "150m" ou "2.5". Vincule
              opcionalmente a work items do Azure DevOps com autocomplete
              inteligente.
            </p>
          </FadeIn>
          <FadeIn delay={35}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Formatos naturais de duração",
                "Duplicar entrada do dia anterior",
                "Vinculação com Azure DevOps",
              ].map((feat) => (
                <span
                  key={feat}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 17,
                    color: theme.textMuted,
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      background: `${theme.success}20`,
                      color: theme.success,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                  {feat}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>
      </div>
    </AbsoluteFill>
  );
};
