import {
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  MoreHorizontal,
  PhoneCall,
  Sparkles,
} from "lucide-react";
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
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 3 — Lembretes Pós-Reunião & Vespertino Proativo (0–420 frames = 14s)
 *
 * Demonstrates the proactive intelligence in Microsoft Teams:
 * 1. Automatic post-meeting nudge delivered 10m after meeting ends.
 * 2. Real call duration measured via Teams Call Records (e.g. 42 min).
 * 3. 1-Click register or ignore, plus 17:30 evening digest delivered in private chat.
 */

export const TeamsNudgeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [395, 420], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const card1Spring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 14, stiffness: 110 },
  });

  const card2Spring = spring({
    frame: frame - 120,
    fps,
    config: { damping: 14, stiffness: 110 },
  });

  // Action on Meeting card at frame 220
  const actionAt = 220;
  const isMeetingLogged = frame >= actionAt;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot x="15%" y="30%" size={700} opacity={0.14} color="#5059C9" />
      <GlowDot x="85%" y="65%" size={600} opacity={0.12} color={theme.brand} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          height: "100%",
          padding: "40px 100px",
          gap: 24,
        }}
      >
        {/* Header Pill */}
        <FadeIn delay={5}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Badge color="#7B83EB">PROATIVIDADE & ZERO ESQUECIMENTO</Badge>
            <Badge color={theme.brand}>MICROSOFT GRAPH CALL RECORDS</Badge>
          </div>
        </FadeIn>

        {/* Title */}
        <FadeIn delay={12}>
          <div style={{ textAlign: "center", maxWidth: 940 }}>
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
              Lembretes proativos que{" "}
              <GradientText>acompanham sua rotina</GradientText>
            </h2>
            <p
              style={{
                fontSize: 18,
                color: theme.textMuted,
                marginTop: 8,
                marginBottom: 0,
              }}
            >
              Ao fim de cada chamada e no fechamento do dia, o OptTime avisa no
              chat privado com durações reais e ações rápidas.
            </p>
          </div>
        </FadeIn>

        {/* 2-Column Cards Display */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 28,
            width: 1040,
            marginTop: 10,
          }}
        >
          {/* Column 1: Post-Meeting Nudge */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              borderRadius: 20,
              border: `1px solid ${isMeetingLogged ? `${theme.success}50` : theme.border}`,
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              transform: `scale(${card1Spring})`,
              opacity: card1Spring,
              minHeight: 380,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: "#5059C920",
                    border: "1px solid #5059C950",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#9FA6F5",
                  }}
                >
                  <PhoneCall size={18} />
                </div>
                <div>
                  <span
                    style={{
                      color: theme.white,
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  >
                    Lembrete Pós-Reunião
                  </span>
                  <div
                    style={{
                      color: theme.textDimmed,
                      fontSize: 12,
                      fontFamily: fonts.mono,
                    }}
                  >
                    Disparado 10 min após a chamada
                  </div>
                </div>
              </div>
              <span
                style={{
                  backgroundColor: "#5059C925",
                  color: "#9FA6F5",
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontFamily: fonts.mono,
                }}
              >
                AUTOMÁTICO
              </span>
            </div>

            {/* Notification Card */}
            <div
              style={{
                backgroundColor: "#111117",
                border: "1px solid #28283a",
                borderRadius: 14,
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: theme.white,
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                <Calendar size={16} color={theme.brand} />
                <span>Sua reunião terminou — registrar?</span>
              </div>

              <div
                style={{
                  backgroundColor: "#181824",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #2e2e42",
                }}
              >
                <div
                  style={{
                    color: theme.white,
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  Alinhamento Técnico de Arquitetura
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 6,
                    fontSize: 12,
                    color: theme.textMuted,
                  }}
                >
                  <span
                    style={{
                      color: theme.brandLight,
                      fontWeight: 700,
                      fontFamily: fonts.mono,
                    }}
                  >
                    ⏱️ 42 min (Duração Real Medida)
                  </span>
                  <span>•</span>
                  <span>Marca Ambiental (Fase 1)</span>
                </div>
              </div>

              {/* Action buttons */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                {!isMeetingLogged ? (
                  <>
                    <div
                      style={{
                        flex: 1,
                        backgroundColor: theme.brand,
                        color: theme.white,
                        padding: "9px 14px",
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: 13,
                        textAlign: "center",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        boxShadow: `0 4px 12px ${theme.brandGlow}`,
                      }}
                    >
                      <Check size={14} />
                      <span>Registrar 45 min</span>
                    </div>
                    <div
                      style={{
                        backgroundColor: "#20202e",
                        color: theme.textMuted,
                        padding: "9px 12px",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 12,
                        border: "1px solid #333346",
                      }}
                    >
                      Ignorar
                    </div>
                    <div
                      style={{
                        backgroundColor: "#20202e",
                        color: theme.textMuted,
                        padding: "9px 10px",
                        borderRadius: 8,
                        border: "1px solid #333346",
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: theme.success,
                      fontWeight: 600,
                      fontSize: 13,
                      padding: "8px 0",
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Reunião registrada · Saldo do dia atualizado</span>
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                fontSize: 13,
                color: theme.textMuted,
                lineHeight: 1.4,
              }}
            >
              Duração aferida via telemetria Microsoft Graph. Não invade
              privacidade: sem áudio, vídeo ou transcrição.
            </div>
          </div>

          {/* Column 2: Evening Digest */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              borderRadius: 20,
              border: `1px solid ${theme.border}`,
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              transform: `scale(${card2Spring})`,
              opacity: card2Spring,
              minHeight: 380,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${theme.brand}20`,
                    border: `1px solid ${theme.brand}50`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.brandLight,
                  }}
                >
                  <Bell size={18} />
                </div>
                <div>
                  <span
                    style={{
                      color: theme.white,
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  >
                    Lembrete Vespertino (17h30)
                  </span>
                  <div
                    style={{
                      color: theme.textDimmed,
                      fontSize: 12,
                      fontFamily: fonts.mono,
                    }}
                  >
                    Chat privado do Teams
                  </div>
                </div>
              </div>
              <span
                style={{
                  backgroundColor: `${theme.brand}20`,
                  color: theme.brandLight,
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontFamily: fonts.mono,
                }}
              >
                PROATIVO
              </span>
            </div>

            {/* Notification Card */}
            <div
              style={{
                backgroundColor: "#111117",
                border: "1px solid #28283a",
                borderRadius: 14,
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    color: theme.white,
                    fontWeight: 600,
                    fontSize: 15,
                  }}
                >
                  Fechamento do seu dia
                </div>
                <span
                  style={{
                    color: theme.brandLight,
                    fontWeight: 700,
                    fontSize: 14,
                    fontFamily: fonts.mono,
                  }}
                >
                  6h 30m / 8h 00m
                </span>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  width: "100%",
                  height: 10,
                  backgroundColor: "#20202c",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: "81%",
                    height: "100%",
                    backgroundColor: theme.brand,
                    borderRadius: 999,
                  }}
                />
              </div>

              <p
                style={{
                  fontSize: 13,
                  color: theme.textMuted,
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                Você já registrou 6h 30m hoje. Faltam{" "}
                <strong style={{ color: theme.white }}>1h 30m</strong> para
                completar sua meta contratual de 8h.
              </p>

              <div
                style={{
                  backgroundColor: "#1c2233",
                  border: `1px solid ${theme.azure}40`,
                  color: theme.azureLight,
                  padding: "9px 14px",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Sparkles size={14} />
                <span>Preencher pendências com 1 clique</span>
              </div>
            </div>

            <div
              style={{
                fontSize: 13,
                color: theme.textMuted,
                lineHeight: 1.4,
              }}
            >
              Zero configuração de Power Automate: quem instalou o app recebe
              automaticamente no privado às 17h30.
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
