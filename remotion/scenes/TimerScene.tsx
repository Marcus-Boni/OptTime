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

/** Scene 3 — Timer demo (frames 0–450 = 15s) */
export const TimerScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Timer starts "running" at frame 60 and counts seconds
  const timerRunning = frame >= 60;
  const elapsed = timerRunning ? Math.floor((frame - 60) / 30) : 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timerDisplay = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(Math.floor(((frame - 60) % 30) * (100 / 30))).padStart(2, "0")}`;

  // Pulse for the red recording dot
  const pulse = interpolate(Math.sin(frame * 0.15), [-1, 1], [0.4, 1]);

  const fadeOut = interpolate(frame, [420, 450], [1, 0], {
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
      <GlowDot x="60%" y="10%" size={500} opacity={0.08} />

      <div
        style={{
          display: "flex",
          height: "100%",
          alignItems: "center",
          padding: "0 100px",
          gap: 80,
        }}
      >
        {/* Left: explanation */}
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", gap: 28 }}
        >
          <FadeIn delay={0}>
            <Badge>Timer em tempo real</Badge>
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
              Comece a registrar com <GradientText>um clique</GradientText>
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
              Cronômetro ao vivo persistido no banco — não perde em refresh,
              troca de aba ou queda de conexão. Visível na sidebar em qualquer
              página.
            </p>
          </FadeIn>
          <FadeIn delay={35}>
            <div style={{ display: "flex", gap: 16 }}>
              {[
                "Persistência total",
                "Projeto + Task AzDO",
                "Start / Pause / Stop",
              ].map((feat) => (
                <span
                  key={feat}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 16,
                    color: theme.textMuted,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: theme.brand,
                    }}
                  />
                  {feat}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>

        {/* Right: browser mock with timer */}
        <div
          style={{
            flex: 1,
            transform: `scale(${browserSpring})`,
            opacity: browserSpring,
          }}
        >
          <BrowserFrame url="app.optsolv.com/dashboard">
            <div
              style={{
                padding: 40,
                display: "flex",
                flexDirection: "column",
                gap: 28,
              }}
            >
              {/* Project selector */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: theme.brand,
                  }}
                />
                <span
                  style={{ color: theme.white, fontSize: 18, fontWeight: 600 }}
                >
                  OptSolv Time Tracker
                </span>
                <span
                  style={{
                    color: theme.textDimmed,
                    fontSize: 14,
                    marginLeft: 8,
                  }}
                >
                  — Task #4521: Implementar integração Azure
                </span>
              </div>

              {/* Timer display */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 24,
                  padding: "40px 0",
                }}
              >
                {timerRunning && (
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: theme.error,
                      opacity: pulse,
                      boxShadow: `0 0 20px ${theme.error}60`,
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: 80,
                    fontWeight: 700,
                    fontFamily: fonts.mono,
                    color: timerRunning ? theme.brand : theme.textDimmed,
                    letterSpacing: 4,
                  }}
                >
                  {timerRunning ? timerDisplay : "00:00:00"}
                </span>
              </div>

              {/* Action buttons */}
              <div
                style={{ display: "flex", gap: 16, justifyContent: "center" }}
              >
                {timerRunning ? (
                  <>
                    <MockButton label="⏸ Pausar" variant="secondary" />
                    <MockButton label="⏹ Parar" variant="danger" />
                  </>
                ) : (
                  <MockButton label="▶ Iniciar Timer" variant="primary" />
                )}
              </div>

              {/* Description */}
              <div
                style={{
                  padding: "16px 20px",
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.bgCard,
                  color: timerRunning ? theme.white : theme.textDimmed,
                  fontSize: 16,
                }}
              >
                {timerRunning
                  ? "Implementando endpoint de sync para work items do Azure DevOps..."
                  : "Descreva sua atividade..."}
              </div>
            </div>
          </BrowserFrame>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const MockButton: React.FC<{
  label: string;
  variant: "primary" | "secondary" | "danger";
}> = ({ label, variant }) => {
  const bg =
    variant === "primary"
      ? theme.brand
      : variant === "danger"
        ? theme.error
        : theme.bgCard;
  const border = variant === "secondary" ? `1px solid ${theme.border}` : "none";
  return (
    <div
      style={{
        padding: "12px 28px",
        borderRadius: 12,
        background: bg,
        color: theme.white,
        fontSize: 16,
        fontWeight: 600,
        border,
        cursor: "pointer",
      }}
    >
      {label}
    </div>
  );
};
