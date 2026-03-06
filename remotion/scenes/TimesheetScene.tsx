import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Badge, FadeIn, GlowDot, GradientText } from "../components/shared";
import { fonts, theme } from "../theme";

const flowSteps = [
  { label: "DRAFT", color: theme.textDimmed, icon: "📝" },
  { label: "SUBMITTED", color: theme.warning, icon: "📤" },
  { label: "APPROVED", color: theme.success, icon: "✅" },
];

const weekDays = [
  { day: "Seg", hours: 8.0, entries: 3 },
  { day: "Ter", hours: 7.5, entries: 2 },
  { day: "Qua", hours: 8.5, entries: 4 },
  { day: "Qui", hours: 6.0, entries: 2 },
  { day: "Sex", hours: 8.0, entries: 3 },
];

/** Scene 5 — Timesheet approval flow (frames 0–360 = 12s) */
export const TimesheetScene: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeOut = interpolate(frame, [330, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Which step is highlighted
  const activeStep = frame < 80 ? 0 : frame < 160 ? 1 : 2;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        opacity: fadeOut,
        overflow: "hidden",
      }}
    >
      <GlowDot x="70%" y="20%" size={500} opacity={0.07} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 48,
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
            <Badge>Timesheets &amp; Aprovação</Badge>
            <h2
              style={{
                fontSize: 52,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
              }}
            >
              Fluxo de aprovação <GradientText>automatizado</GradientText>
            </h2>
          </div>
        </FadeIn>

        {/* Flow diagram */}
        <FadeIn delay={15} durationFrames={20}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              padding: "24px 48px",
              borderRadius: 20,
              background: theme.bgCard,
              border: `1px solid ${theme.border}`,
            }}
          >
            {flowSteps.map((step, i) => {
              const isActive = i === activeStep;
              const isPast = i < activeStep;
              return (
                <div
                  key={step.label}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 10,
                      padding: "16px 40px",
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 16,
                        background: isActive
                          ? `${step.color}25`
                          : isPast
                            ? `${theme.success}15`
                            : `${theme.border}`,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        fontSize: 28,
                        border: isActive
                          ? `2px solid ${step.color}`
                          : "2px solid transparent",
                        transform: isActive ? "scale(1.1)" : "scale(1)",
                        transition: "all 0.3s",
                      }}
                    >
                      {step.icon}
                    </div>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: isActive
                          ? step.color
                          : isPast
                            ? theme.success
                            : theme.textDimmed,
                        fontFamily: fonts.mono,
                        letterSpacing: 1,
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < flowSteps.length - 1 && (
                    <div
                      style={{
                        width: 60,
                        height: 3,
                        background: isPast ? theme.success : theme.border,
                        borderRadius: 2,
                      }}
                    />
                  )}
                </div>
              );
            })}

            {/* Rejected branch */}
            <div
              style={{ display: "flex", alignItems: "center", marginLeft: 20 }}
            >
              <span
                style={{
                  fontSize: 14,
                  color: theme.textDimmed,
                  fontFamily: fonts.mono,
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px dashed ${theme.error}40`,
                  background: `${theme.error}08`,
                }}
              >
                ❌ REJECTED → volta a DRAFT
              </span>
            </div>
          </div>
        </FadeIn>

        {/* Weekly summary table */}
        <FadeIn delay={30} durationFrames={20}>
          <div
            style={{
              display: "flex",
              gap: 20,
              padding: "28px 40px",
              borderRadius: 20,
              background: theme.bgCard,
              border: `1px solid ${theme.border}`,
            }}
          >
            {weekDays.map((d, i) => {
              const barDelay = 40 + i * 10;
              const barHeight = interpolate(
                frame,
                [barDelay, barDelay + 25],
                [0, d.hours * 16],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
              const isFull = d.hours >= 8;

              return (
                <div
                  key={d.day}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    width: 100,
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      fontFamily: fonts.mono,
                      color: isFull ? theme.success : theme.warning,
                    }}
                  >
                    {d.hours}h
                  </span>
                  <div
                    style={{
                      width: 40,
                      height: 140,
                      borderRadius: 8,
                      background: theme.border,
                      display: "flex",
                      flexDirection: "column-reverse",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: barHeight,
                        borderRadius: 8,
                        background: isFull
                          ? `linear-gradient(to top, ${theme.brand}, ${theme.brandLight})`
                          : `linear-gradient(to top, ${theme.warning}, ${theme.warning}80)`,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: theme.textMuted,
                    }}
                  >
                    {d.day}
                  </span>
                </div>
              );
            })}

            {/* Total */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                paddingLeft: 32,
                borderLeft: `1px solid ${theme.border}`,
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  color: theme.textDimmed,
                  fontWeight: 600,
                }}
              >
                TOTAL
              </span>
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  fontFamily: fonts.mono,
                  color: theme.brand,
                }}
              >
                38h
              </span>
              <div
                style={{
                  padding: "8px 20px",
                  borderRadius: 10,
                  background: theme.brand,
                  color: "white",
                  fontSize: 14,
                  fontWeight: 700,
                  marginTop: 8,
                }}
              >
                Submeter Semana →
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};
