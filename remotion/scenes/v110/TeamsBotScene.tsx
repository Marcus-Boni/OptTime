import { Bot, Check, CheckCircle2, Lock, Sparkles, Undo2 } from "lucide-react";
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
  TeamsLogoMark,
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 2 — Payoff Principal: Chamar o OptTime no Microsoft Teams em Qualquer Canal (0–450 frames = 15s)
 *
 * Demonstrates the core v1.10.0 workflow:
 * 1. Invoking @OptSolv Time directly in a channel or chat with natural language:
 *    "@OptSolv Time registre 1 hora de reunião com meu líder no projeto Marca Ambiental"
 * 2. Instant Adaptive Card proposal with AI project matching, manager resolution and billing.
 * 3. 1-Click interactive confirm with spring physics, undo support and total privacy guarantee.
 */

export const TeamsBotScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [425, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Modal appearance
  const windowSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  // Typing simulation: frames 30 to 110
  const promptText =
    "@OptSolv Time registre 1 hora de reunião com meu líder no projeto Marca Ambiental";
  const typedLength = Math.floor(
    interpolate(frame, [30, 110], [0, promptText.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const currentTyped = promptText.slice(0, typedLength);

  // Message sent at frame 120
  const messageSent = frame >= 120;

  // Bot response card appears at frame 135
  const botCardSpring = spring({
    frame: frame - 135,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  // Click action at frame 270
  const clickedAt = 270;
  const isConfirmed = frame >= clickedAt;
  const _clickSpring = spring({
    frame: frame - clickedAt,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  // Cursor click position
  const _cursorOpacity = interpolate(
    frame,
    [clickedAt - 25, clickedAt - 5, clickedAt + 20, clickedAt + 35],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot x="25%" y="20%" size={700} opacity={0.16} color="#5059C9" />
      <GlowDot x="75%" y="60%" size={650} opacity={0.12} color={theme.brand} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          height: "100%",
          padding: "40px 100px",
          gap: 22,
        }}
      >
        {/* Top Feature Pill */}
        <FadeIn delay={5}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 16px",
                borderRadius: 999,
                backgroundColor: "#5059C920",
                border: "1px solid #5059C950",
              }}
            >
              <TeamsLogoMark size={20} />
              <span
                style={{
                  color: "#9FA6F5",
                  fontWeight: 600,
                  fontSize: 15,
                  fontFamily: fonts.mono,
                }}
              >
                MICROSOFT TEAMS APP & BOT
              </span>
            </div>
            <Badge color={theme.brand}>PAYOFF INSTANTÂNEO</Badge>
          </div>
        </FadeIn>

        {/* Scene Title */}
        <FadeIn delay={12}>
          <div style={{ textAlign: "center", maxWidth: 1040 }}>
            <h2
              style={{
                fontFamily: fonts.display,
                fontSize: 38,
                fontWeight: 700,
                color: theme.white,
                letterSpacing: "-0.02em",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Chame o <GradientText>@OptSolv Time</GradientText> diretamente no
              Teams, de qualquer canal
            </h2>
          </div>
        </FadeIn>

        {/* Main Teams Mock Window */}
        <div
          style={{
            width: 1040,
            borderRadius: 20,
            border: `1px solid ${theme.border}`,
            backgroundColor: "#16161c",
            boxShadow: "0 25px 70px rgba(0,0,0,0.6), 0 0 40px #5059C915",
            overflow: "hidden",
            transform: `scale(${windowSpring})`,
            opacity: windowSpring,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Teams Header Bar */}
          <div
            style={{
              height: 48,
              backgroundColor: "#1f1f28",
              borderBottom: `1px solid ${theme.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <TeamsLogoMark size={22} />
              <span
                style={{
                  color: theme.white,
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                Canal: Geral · Projeto Marca Ambiental
              </span>
              <span
                style={{
                  backgroundColor: "#2a2a38",
                  color: "#9FA6F5",
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontWeight: 600,
                }}
              >
                Canal Público
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: theme.success,
                }}
              />
              <span
                style={{
                  color: theme.textMuted,
                  fontSize: 12,
                  fontFamily: fonts.mono,
                }}
              >
                Bot Ativo & Conectado
              </span>
            </div>
          </div>

          {/* Conversation Stream Area */}
          <div
            style={{
              padding: "24px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 20,
              minHeight: 380,
            }}
          >
            {/* User Message */}
            <div
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  backgroundColor: theme.brand,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: theme.white,
                  fontWeight: 700,
                  fontSize: 15,
                  flexShrink: 0,
                }}
              >
                MB
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      color: theme.white,
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    Marcus Boni
                  </span>
                  <span
                    style={{
                      color: theme.textDimmed,
                      fontSize: 12,
                      fontFamily: fonts.mono,
                    }}
                  >
                    14:32
                  </span>
                </div>

                <div
                  style={{
                    backgroundColor: "#22222e",
                    border: "1px solid #323246",
                    borderRadius: 14,
                    padding: "12px 18px",
                    color: theme.white,
                    fontSize: 15,
                    lineHeight: 1.4,
                    display: "inline-block",
                    maxWidth: 720,
                  }}
                >
                  <span style={{ color: "#9FA6F5", fontWeight: 600 }}>
                    {currentTyped.slice(0, 13)}
                  </span>
                  <span>{currentTyped.slice(13)}</span>
                  {frame < 120 && (
                    <span
                      style={{
                        display: "inline-block",
                        width: 2,
                        height: 16,
                        backgroundColor: theme.brand,
                        marginLeft: 4,
                        verticalAlign: "middle",
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Bot Response Adaptive Card */}
            {messageSent && (
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  transform: `scale(${botCardSpring})`,
                  opacity: botCardSpring,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: "#5059C9",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.white,
                    flexShrink: 0,
                    boxShadow: "0 4px 12px #5059C940",
                  }}
                >
                  <Bot size={22} />
                </div>

                <div style={{ flex: 1, maxWidth: 640 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        color: theme.white,
                        fontWeight: 600,
                        fontSize: 14,
                      }}
                    >
                      OptSolv Time
                    </span>
                    <span
                      style={{
                        backgroundColor: "#5059C930",
                        color: "#9FA6F5",
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontFamily: fonts.mono,
                        fontWeight: 700,
                      }}
                    >
                      APP
                    </span>
                    <span
                      style={{
                        color: theme.textDimmed,
                        fontSize: 12,
                        fontFamily: fonts.mono,
                      }}
                    >
                      14:32
                    </span>
                  </div>

                  {/* Adaptive Card Body */}
                  <div
                    style={{
                      backgroundColor: isConfirmed ? "#13231a" : "#1a1a24",
                      border: `1px solid ${isConfirmed ? `${theme.success}60` : "#35354a"}`,
                      borderRadius: 16,
                      padding: "20px 24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      boxShadow: isConfirmed
                        ? `0 10px 30px ${theme.success}20`
                        : "0 10px 30px rgba(0,0,0,0.3)",
                      transition: "background-color 0.3s, border-color 0.3s",
                    }}
                  >
                    {/* Card Header Status */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingBottom: 12,
                        borderBottom: `1px solid ${isConfirmed ? `${theme.success}30` : "#29293a"}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {isConfirmed ? (
                          <CheckCircle2 size={18} color={theme.success} />
                        ) : (
                          <Sparkles size={18} color={theme.brand} />
                        )}
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 15,
                            color: isConfirmed ? theme.success : theme.white,
                          }}
                        >
                          {isConfirmed
                            ? "Horas Registradas com Sucesso!"
                            : "Proposta de Apontamento Detectada"}
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
                        <Lock size={12} color="#9FA6F5" />
                        <span style={{ color: "#9FA6F5" }}>
                          Privacidade Garantida
                        </span>
                      </div>
                    </div>

                    {/* Proposal Fields */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 1fr",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          backgroundColor: "#111118",
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "1px solid #232332",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: theme.textMuted,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Projeto Reconhecido
                        </span>
                        <div
                          style={{
                            color: theme.white,
                            fontWeight: 600,
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        >
                          Marca Ambiental — Fase 1
                        </div>
                      </div>

                      <div
                        style={{
                          backgroundColor: "#111118",
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "1px solid #232332",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: theme.textMuted,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          Duração & Tipo
                        </span>
                        <div
                          style={{
                            color: theme.brandLight,
                            fontWeight: 700,
                            fontSize: 14,
                            fontFamily: fonts.mono,
                            marginTop: 2,
                          }}
                        >
                          1h 00m · Faturável
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        backgroundColor: "#111118",
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid #232332",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: theme.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        Descrição Gerada pelo Assistente
                      </span>
                      <div
                        style={{
                          color: theme.white,
                          fontSize: 13,
                          marginTop: 2,
                        }}
                      >
                        Reunião de alinhamento com liderança técnica (Marcus
                        Boni)
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        paddingTop: 4,
                      }}
                    >
                      {!isConfirmed ? (
                        <>
                          <div
                            style={{
                              flex: 1,
                              backgroundColor: theme.brand,
                              color: theme.white,
                              padding: "10px 18px",
                              borderRadius: 10,
                              fontWeight: 700,
                              fontSize: 14,
                              textAlign: "center",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 8,
                              boxShadow: `0 4px 15px ${theme.brandGlow}`,
                              transform:
                                frame >= clickedAt - 8 && frame <= clickedAt + 8
                                  ? "scale(0.96)"
                                  : "scale(1)",
                            }}
                          >
                            <Check size={16} />
                            <span>Confirmar Registro</span>
                          </div>
                          <div
                            style={{
                              backgroundColor: "#222230",
                              color: theme.textMuted,
                              padding: "10px 16px",
                              borderRadius: 10,
                              fontWeight: 600,
                              fontSize: 13,
                              border: "1px solid #333348",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Undo2 size={14} />
                            <span>Editar</span>
                          </div>
                        </>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                          }}
                        >
                          <span
                            style={{
                              color: theme.success,
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            ✓ Lançamento sincronizado na plataforma
                          </span>
                          <div
                            style={{
                              backgroundColor: "#203328",
                              color: "#86efac",
                              padding: "6px 12px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              border: `1px solid ${theme.success}40`,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <Undo2 size={12} />
                            <span>Desfazer</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
