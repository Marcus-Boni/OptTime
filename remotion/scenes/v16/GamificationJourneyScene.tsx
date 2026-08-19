import { CalendarCheck, Flame, Medal, Trophy, Users } from "lucide-react";
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

// Confetti particle generation helper
const CONFETTI_PARTICLES = Array.from({ length: 48 }).map((_, i) => ({
  id: i,
  x: (i * 23) % 100,
  speedY: 2 + (i % 4) * 1.5,
  size: 8 + (i % 6) * 3,
  color: ["#f97316", "#fbbf24", "#22c55e", "#38bdf8", "#a855f7", "#ec4899"][
    i % 6
  ],
  rotationSpeed: 3 + (i % 5),
}));

/**
 * Scene 5 — Gamification, "Minha Jornada", Streaks & Celebration (0–390 frames = 13s)
 */
export const GamificationJourneyScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [360, 390], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const celebrationSpring = spring({
    frame: frame - 20,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const xpProgress = interpolate(frame, [40, 200], [1300, 1450], {
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
      <GlowDot x="40%" y="20%" size={750} opacity={0.16} color="#f59e0b" />
      <GlowDot x="80%" y="60%" size={600} opacity={0.12} color={theme.brand} />

      {/* Falling Confetti Layer */}
      {CONFETTI_PARTICLES.map((p) => {
        const fallY = ((frame * p.speedY * 4 + p.id * 30) % 1200) - 100;
        const rotate = frame * p.rotationSpeed * 5;
        const opacity = interpolate(fallY, [0, 900, 1100], [1, 0.9, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${fallY}px`,
              width: p.size,
              height: p.size * 0.6,
              background: p.color,
              borderRadius: 2,
              transform: `rotate(${rotate}deg)`,
              opacity,
              pointerEvents: "none",
              zIndex: 5,
            }}
          />
        );
      })}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 30,
          position: "relative",
          zIndex: 10,
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
            <Badge color="#f59e0b">NOVA ÁREA · MINHA JORNADA</Badge>
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
              Constância, Cultura &{" "}
              <GradientText
                style={{
                  background: "linear-gradient(135deg, #fbbf24, #f97316)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Bem-Estar
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
              Um motor de XP e conquistas que valoriza a disciplina,
              pontualidade e o equilíbrio da rotina semanal — com celebração de
              confetes ao fechar a semana.
            </p>
          </div>
        </FadeIn>

        {/* Central Gamification Dashboard Cards */}
        <div
          style={{
            transform: `scale(${celebrationSpring})`,
            opacity: celebrationSpring,
            display: "flex",
            gap: 24,
            width: 1040,
          }}
        >
          {/* Main Hero Card */}
          <div
            style={{
              flex: 1.2,
              background: "linear-gradient(145deg, #1f1811, #141210)",
              borderRadius: 22,
              border: "1px solid rgba(245, 158, 11, 0.35)",
              boxShadow: "0 25px 70px rgba(245, 158, 11, 0.15)",
              padding: "26px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 18,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: "rgba(245, 158, 11, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Trophy size={20} color="#fbbf24" />
                </div>
                <div>
                  <span
                    style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}
                  >
                    Semana Fechada no Prazo! 🎉
                  </span>
                  <span
                    style={{ display: "block", fontSize: 12, color: "#fbbf24" }}
                  >
                    +150 XP de Bônus de Pontualidade
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#f87171",
                  padding: "6px 12px",
                  borderRadius: 99,
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                <Flame size={16} color="#ef4444" />
                <span>5 Semanas Seguidas</span>
              </div>
            </div>

            {/* Level & XP Progress Bar */}
            <div
              style={{
                background: "#171412",
                padding: "16px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 8,
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 700, color: "#fff" }}>
                  Nível 6: Mestre do Tempo
                </span>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    color: "#fbbf24",
                    fontWeight: 700,
                  }}
                >
                  {Math.round(xpProgress)} / 2.000 XP
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 10,
                  borderRadius: 99,
                  background: "#26221d",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(xpProgress / 2000) * 100}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #f59e0b, #f97316)",
                    borderRadius: 99,
                  }}
                />
              </div>
            </div>

            {/* Unlocked Achievement Callout */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                padding: "12px 16px",
                borderRadius: 12,
              }}
            >
              <Medal size={28} color="#fbbf24" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                  🏆 Conquista Desbloqueada: Relógio Suíço (Ouro)
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted }}>
                  5 semanas consecutivas submetidas antes do prazo limite.
                </div>
              </div>
            </div>
          </div>

          {/* Right Cards: Team Mural & Balance */}
          <div
            style={{
              flex: 0.9,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Team Mural Card */}
            <div
              style={{
                background: "#141414",
                borderRadius: 18,
                border: `1px solid ${theme.borderLight}`,
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={18} color="#38bdf8" />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                  Mural de Cultura da Equipe
                </span>
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                Pulso coletivo: <strong>94% das semanas fechadas</strong> no
                prazo.
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {["Marcus B.", "Camila R.", "Lucas M.", "Beatriz S."].map(
                  (name) => (
                    <span
                      key={name}
                      style={{
                        fontSize: 10,
                        background: "#222",
                        border: "1px solid #333",
                        color: "#ccc",
                        padding: "4px 8px",
                        borderRadius: 6,
                      }}
                    >
                      ✓ {name}
                    </span>
                  ),
                )}
              </div>
            </div>

            {/* Work-Life Balance Insight */}
            <div
              style={{
                background: "#141414",
                borderRadius: 18,
                border: `1px solid ${theme.borderLight}`,
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CalendarCheck size={18} color="#22c55e" />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
                  Relatório de Equilíbrio
                </span>
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                Distribuição saudável: <strong>8h/dia regulares</strong> de seg
                a sex sem sobrecarga.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
