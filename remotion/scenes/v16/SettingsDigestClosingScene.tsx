import { Mail, Settings } from "lucide-react";
import type React from "react";
import {
  AbsoluteFill,
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
 * Scene 6 — Weekly Digest, Advanced Settings & Final CTA (0–270 frames = 9s)
 */
export const SettingsDigestClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Switch between features preview (0-160 frames) and Final Logo CTA (160-270 frames)
  const isFinalCta = frame >= 150;
  const ctaScale = spring({
    frame: frame - 150,
    fps,
    config: { damping: 14, stiffness: 100 },
  });

  const previewSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 110 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
      }}
    >
      <GlowDot x="50%" y="25%" size={800} opacity={0.18} color={theme.brand} />
      <GlowDot x="20%" y="70%" size={500} opacity={0.1} color="#a855f7" />

      {!isFinalCta ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            padding: "0 100px",
            gap: 30,
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
              <Badge color={theme.brand}>DIGEST POR IA & CONFIGURAÇÕES</Badge>
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
                Resumo Executivo & <GradientText>Controle Total</GradientText>
              </h2>
              <p
                style={{
                  fontSize: 19,
                  color: theme.textMuted,
                  margin: 0,
                  maxWidth: 850,
                }}
              >
                Digest semanal inteligente toda segunda-feira e uma central
                completa para configurar IA, servidor SMTP e preferências de
                produtividade.
              </p>
            </div>
          </FadeIn>

          {/* Cards Split: Digest Preview + Settings */}
          <div
            style={{
              transform: `scale(${previewSpring})`,
              opacity: previewSpring,
              display: "flex",
              gap: 24,
              width: 1040,
            }}
          >
            {/* Digest Card */}
            <div
              style={{
                flex: 1,
                background: "#141418",
                borderRadius: 20,
                border: `1px solid ${theme.borderLight}`,
                padding: "22px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Mail size={20} color={theme.brand} />
                  <span
                    style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}
                  >
                    Weekly Digest (E-mail & In-App)
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: "#22c55e",
                    background: "rgba(34, 197, 94, 0.15)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  TODA SEGUNDA-FEIRA
                </span>
              </div>

              <div style={{ fontSize: 12, color: "#d4d4d8", lineHeight: 1.5 }}>
                “Na semana anterior você registrou <strong>40h00</strong> (100%
                da meta). Seu pico produtivo foi na quarta-feira com 8h30
                dedicadas ao Projeto Horizon.”
              </div>

              {/* Progress categories */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginTop: 4,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: theme.textMuted,
                  }}
                >
                  <span>Desenvolvimento Core</span>
                  <span style={{ fontFamily: fonts.mono, color: "#fff" }}>
                    75% (30h)
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 6,
                    borderRadius: 99,
                    background: "#27272a",
                  }}
                >
                  <div
                    style={{
                      width: "75%",
                      height: "100%",
                      borderRadius: 99,
                      background: theme.brand,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Settings Card */}
            <div
              style={{
                flex: 1,
                background: "#141418",
                borderRadius: 20,
                border: `1px solid ${theme.borderLight}`,
                padding: "22px 24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Settings size={20} color="#a855f7" />
                  <span
                    style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}
                  >
                    Central de Configurações
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: "#a855f7",
                    background: "rgba(168, 85, 247, 0.15)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontWeight: 600,
                  }}
                >
                  SINCRONIZADO
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  {
                    label: "Autonomia do Operador IA",
                    val: "Semi-Automático (Seguro)",
                  },
                  {
                    label: "Servidor SMTP Próprio",
                    val: "Configurado e Testado ✓",
                  },
                  {
                    label: "Digest Semanal Opcional",
                    val: "Ativado com Prévia",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#1a1a20",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: theme.textMuted }}>{s.label}</span>
                    <span style={{ color: "#fff", fontWeight: 600 }}>
                      {s.val}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Final CTA Screen */
        <div
          style={{
            transform: `scale(${ctaScale})`,
            opacity: ctaScale,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 28,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 28,
              background: "rgba(249, 115, 22, 0.12)",
              border: "1px solid rgba(249, 115, 22, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 20px 60px rgba(249, 115, 22, 0.25)",
            }}
          >
            <OptSolvLogo size={46} color={theme.brand} />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontSize: 52,
                  fontWeight: 800,
                  color: "#fff",
                  fontFamily: fonts.display,
                  letterSpacing: "-0.02em",
                }}
              >
                OptSolv Time
              </span>
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 22,
                  fontWeight: 700,
                  color: theme.brandLight,
                  background: "rgba(249, 115, 22, 0.15)",
                  border: "1px solid rgba(249, 115, 22, 0.35)",
                  padding: "4px 14px",
                  borderRadius: 99,
                }}
              >
                v1.6.0
              </span>
            </div>

            <p
              style={{
                fontSize: 24,
                color: theme.textMuted,
                margin: 0,
                fontWeight: 500,
              }}
            >
              Uma nova forma de trabalhar com o seu tempo.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 20,
              marginTop: 10,
            }}
          >
            {[
              "Operador IA com Voz",
              "Apontamento Preditivo",
              "Modo Foco & Pomodoro",
              "Gamificação & Streaks",
            ].map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 13,
                  color: "#e4e4e7",
                  background: "#18181b",
                  border: "1px solid rgba(255,255,255,0.1)",
                  padding: "8px 16px",
                  borderRadius: 99,
                  fontWeight: 500,
                }}
              >
                ✓ {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
