import { FileDown, Gauge, Globe, ShieldCheck, Zap } from "lucide-react";
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
  FadeIn,
  GlowDot,
  GradientText,
  OptSolvLogo,
} from "../../components/shared";
import { fonts, theme } from "../../theme";

/**
 * Scene 4 — Live Client Portal & Team Hours Optimization (0–390 frames = 13s)
 *
 * Demonstrates:
 * 1. Live Client Portal (/portal/[token]) — secure, white-label, scrypt auth, PDF export
 * 2. Re-engineered Team Hours screen — 99.8% lighter payload (75.4MB -> 117.8KB)
 */

export const PortalAndTeamHoursScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [365, 390], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const portalSpring = spring({
    frame: frame - 20,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const perfSpring = spring({
    frame: frame - 50,
    fps,
    config: { damping: 15, stiffness: 120 },
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
      <GlowDot x="25%" y="20%" size={700} opacity={0.14} color={theme.azure} />
      <GlowDot x="75%" y="70%" size={550} opacity={0.12} color={theme.brand} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 80px",
          gap: 34,
        }}
      >
        <FadeIn delay={0}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Badge color={theme.info}>PORTAL DO CLIENTE WHITE-LABEL</Badge>
              <Badge color={theme.success}>PERFORMANCE +99.8%</Badge>
            </div>
            <h1
              style={{
                fontSize: 52,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Transparência para Clientes.
              <br />
              <GradientText>Velocidade instantânea para a equipe.</GradientText>
            </h1>
          </div>
        </FadeIn>

        {/* 2 Big Cards: Client Portal vs Team Hours Perf */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.15fr 0.85fr",
            gap: 26,
            width: "100%",
            maxWidth: 1240,
          }}
        >
          {/* Card 1: Live Client Portal Preview */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: 20,
              padding: "26px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              opacity: portalSpring,
              transform: `translateY(${interpolate(portalSpring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              minHeight: 350,
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
                    borderRadius: 10,
                    backgroundColor: `${theme.info}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.info,
                  }}
                >
                  <Globe size={20} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: theme.white,
                    }}
                  >
                    Live Client Portal
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>
                    /portal/[token] · Acesso público seguro
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: `${theme.success}15`,
                  padding: "4px 10px",
                  borderRadius: 8,
                  color: theme.success,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <ShieldCheck size={14} />
                <span>Senha Scrypt & JWT</span>
              </div>
            </div>

            {/* Portal preview content */}
            <div
              style={{
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 14,
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <OptSolvLogo size={16} color={theme.brand} />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: theme.white,
                    }}
                  >
                    Projeto: Plataforma Enterprise
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: theme.textMuted,
                  }}
                >
                  <FileDown size={14} color={theme.brandLight} />
                  <span>PDF Executivo</span>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                }}
              >
                {[
                  { label: "Horas Alocadas", val: "200h" },
                  { label: "Executadas", val: "148h (74%)" },
                  { label: "Atualização", val: "Ao vivo (60s)" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    style={{
                      backgroundColor: theme.bgCard,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      {stat.label}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: theme.white,
                        fontFamily: fonts.mono,
                        marginTop: 2,
                      }}
                    >
                      {stat.val}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                fontSize: 12,
                color: theme.textMuted,
                marginTop: "auto",
              }}
            >
              <span>✓ Toggles de privacidade (budget/equipe)</span>
              <span>✓ Sanitização no servidor</span>
              <span>✓ Noindex</span>
            </div>
          </div>

          {/* Card 2: Team Hours Performance Boost */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: 20,
              padding: "26px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              opacity: perfSpring,
              transform: `translateY(${interpolate(perfSpring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              minHeight: 350,
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
                    borderRadius: 10,
                    backgroundColor: `${theme.success}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.success,
                  }}
                >
                  <Gauge size={20} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: theme.white,
                    }}
                  >
                    Horas da Equipe
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>
                    Reengenharia Completa
                  </div>
                </div>
              </div>

              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  backgroundColor: `${theme.success}20`,
                  color: theme.success,
                  fontWeight: 700,
                }}
              >
                -99.8% Payload
              </span>
            </div>

            {/* Performance Comparison Box */}
            <div
              style={{
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 14,
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: theme.error }}>
                    Antes (v1.7)
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: theme.textDimmed,
                      textDecoration: "line-through",
                      fontFamily: fonts.mono,
                    }}
                  >
                    75.4 MB
                  </div>
                </div>

                <Zap size={22} color={theme.brandLight} />

                <div>
                  <div style={{ fontSize: 11, color: theme.success }}>
                    Agora (v1.8)
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: theme.success,
                      fontFamily: fonts.mono,
                    }}
                  >
                    117.8 KB
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  lineHeight: 1.4,
                  borderTop: `1px solid ${theme.border}`,
                  paddingTop: 10,
                }}
              >
                Agregação SQL no Postgres · Avatares desduplicados · Container
                Queries @[1450px]
              </div>
            </div>

            <div
              style={{
                fontSize: 12,
                color: theme.textDimmed,
                marginTop: "auto",
              }}
            >
              • Carregamento instantâneo em conexões corporativas e notebooks
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
