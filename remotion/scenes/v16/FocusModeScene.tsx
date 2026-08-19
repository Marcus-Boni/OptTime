import {
  CloudRain,
  Coffee,
  Headphones,
  Volume2,
  Waves,
  Wind,
} from "lucide-react";
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

const ambientSounds = [
  { name: "Chuva Suave", icon: CloudRain, active: true },
  { name: "Ruído Rosa", icon: Wind, active: false },
  { name: "Ondas do Mar", icon: Waves, active: false },
  { name: "Cafeteria", icon: Coffee, active: false },
  { name: "Ruído Branco", icon: Headphones, active: false },
];

/**
 * Scene 4 — Focus Mode, Pomodoro & Procedural Ambient Sound (0–390 frames = 13s)
 */
export const FocusModeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [360, 390], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const focusSpring = spring({
    frame: frame - 20,
    fps,
    config: { damping: 14, stiffness: 110 },
  });

  // Animated countdown from 25:00 to 24:42
  const secondsElapsed = Math.floor(
    interpolate(frame, [40, 350], [0, 18], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const remainingSeconds = 25 * 60 - secondsElapsed;
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const timeDisplay = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const ringDashoffset = interpolate(frame, [40, 350], [0, 80], {
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
      <GlowDot x="35%" y="30%" size={750} opacity={0.16} color="#10b981" />
      <GlowDot x="75%" y="60%" size={600} opacity={0.12} color={theme.brand} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 32,
        }}
      >
        {/* Header */}
        <FadeIn delay={0}>
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
            }}
          >
            <Badge color="#10b981">IMERSÃO & CONCENTRAÇÃO</Badge>
            <h2
              style={{
                fontSize: 46,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.02em",
              }}
            >
              Modo Foco com{" "}
              <GradientText
                style={{
                  background: "linear-gradient(135deg, #34d399, #f97316)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Pomodoro & Som Ambiente
              </GradientText>
            </h2>
            <p
              style={{
                fontSize: 19,
                color: theme.textMuted,
                margin: 0,
                maxWidth: 850,
              }}
            >
              Temporizador de foco sincronizado ao apontamento de horas e 6
              paisagens sonoras sintetizadas diretamente pelo navegador.
            </p>
          </div>
        </FadeIn>

        {/* Focus Mode Central Stage */}
        <div
          style={{
            transform: `scale(${focusSpring})`,
            opacity: focusSpring,
            width: 980,
            background: "#0d1814",
            borderRadius: 24,
            border: "1px solid rgba(16, 185, 129, 0.3)",
            boxShadow: "0 30px 80px rgba(16, 185, 129, 0.12)",
            padding: "32px 40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 40,
          }}
        >
          {/* Circular Pomodoro Ring */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              width: 240,
              height: 240,
            }}
          >
            <svg
              width={240}
              height={240}
              style={{ transform: "rotate(-90deg)" }}
              aria-label="Pomodoro Progress Ring"
            >
              <title>Pomodoro Progress Ring</title>
              {/* Background ring */}
              <circle
                cx={120}
                cy={120}
                r={100}
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth={12}
              />
              {/* Progress ring */}
              <circle
                cx={120}
                cy={120}
                r={100}
                fill="none"
                stroke="#10b981"
                strokeWidth={12}
                strokeDasharray={628}
                strokeDashoffset={ringDashoffset}
                strokeLinecap="round"
              />
            </svg>

            {/* Inner Content */}
            <div
              style={{
                position: "absolute",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#10b981",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                BLOCO DE FOCO (1/4)
              </span>
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 44,
                  fontWeight: 800,
                  color: "#fff",
                  lineHeight: 1.1,
                  margin: "4px 0",
                }}
              >
                {timeDisplay}
              </span>
              <span style={{ fontSize: 12, color: theme.textMuted }}>
                Projeto Horizon · Task #2041
              </span>
            </div>
          </div>

          {/* Right Panel: Sound Controls & Presets */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {/* Active task badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                padding: "12px 18px",
                borderRadius: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#10b981",
                    boxShadow: "0 0 10px #10b981",
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                  Apontamento Ativo e Sincronizado
                </span>
              </div>
              <span style={{ fontSize: 12, color: "#34d399", fontWeight: 600 }}>
                Modo Pomodoro (25m / 5m)
              </span>
            </div>

            {/* Ambient Sound Selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#a1a1aa",
                    textTransform: "uppercase",
                  }}
                >
                  Paisagem Sonora Procedural (Web Audio API)
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#10b981",
                  }}
                >
                  <Volume2 size={14} /> 65% Volume
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                }}
              >
                {ambientSounds.map((sound) => (
                  <div
                    key={sound.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: sound.active
                        ? "rgba(16, 185, 129, 0.2)"
                        : "#141e1a",
                      border: `1px solid ${sound.active ? "rgba(16, 185, 129, 0.5)" : "rgba(255,255,255,0.06)"}`,
                      color: sound.active ? "#34d399" : "#a1a1aa",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    <sound.icon
                      size={16}
                      color={sound.active ? "#34d399" : "#71717a"}
                    />
                    <span style={{ color: sound.active ? "#fff" : "#a1a1aa" }}>
                      {sound.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom summary */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                paddingTop: 12,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                fontSize: 12,
                color: theme.textDimmed,
              }}
            >
              <span>✓ Sem arquivos pesados de áudio</span>
              <span>✓ Funciona 100% offline</span>
              <span>✓ Bloqueio de distrações</span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
