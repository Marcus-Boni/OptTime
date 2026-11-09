import {
  ArrowUpRight,
  Bot,
  Check,
  Clock,
  FolderGit2,
  Mic,
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
import { Badge, GlowDot, GradientText } from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 2 — Payoff Principal: Espectro Vocal em Tempo Real e TimeBot (0–450 frames = 15s)
 *
 * Demonstrates the flagship voice capabilities in v1.12.0:
 * 1. Web Audio API Acoustic Analyzer with 44 symmetric bars reacting live at 60fps.
 * 2. Perimetral SVG countdown ring for silence-detection (VAD) auto-send.
 * 3. Real-time transcription stream with inline `@projeto` and `#workitem` recognition.
 * 4. KokonutUI AI Tool Approval card with 1-click execution and zero reflow.
 */

export const TimeBotVoiceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [425, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Modal entrance
  const modalSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  // Transcription typing simulation: frames 45 to 155
  const fullTranscript =
    "Lancei 2h no projeto @OptSolv Mobile analisando o card #1042 hoje";
  const typedLength = Math.floor(
    interpolate(frame, [45, 155], [0, fullTranscript.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const currentTranscript = fullTranscript.slice(0, typedLength);

  // VAD Countdown circle progress: frames 140 to 190
  const vadProgress = interpolate(frame, [140, 190], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const isAutoSent = frame >= 190;

  // Proposal card entrance: frame 215
  const proposalSpring = spring({
    frame: frame - 215,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  // Click confirmation at frame 340
  const clickAt = 340;
  const isConfirmed = frame >= clickAt;
  const confirmSpring = spring({
    frame: frame - clickAt,
    fps,
    config: { damping: 12, stiffness: 180 },
  });

  // 44 symmetric spectrum bars
  const SPECTRUM_BARS = Array.from({ length: 44 }, (_, i) => ({
    id: `spectrum-bar-v112-${i}`,
    index: i,
  }));

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot x="50%" y="20%" size={850} opacity={0.16} color={theme.brand} />
      <GlowDot x="85%" y="75%" size={500} opacity={0.08} color={theme.azure} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 28,
        }}
      >
        {/* Scene Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Badge color={theme.brand}>TimeBot v1.12.0</Badge>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: theme.brandLight,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Sparkles size={16} /> Ditado por Voz & Espectro Acústico
            </span>
          </div>

          <h2
            style={{
              fontFamily: fonts.display,
              fontSize: 46,
              fontWeight: 700,
              color: theme.white,
              letterSpacing: "-0.02em",
            }}
          >
            Espectro Vocal em Tempo Real &{" "}
            <GradientText>Envio Inteligente (VAD)</GradientText>
          </h2>
        </div>

        {/* High-Fidelity Voice Interaction Stage */}
        <div
          style={{
            transform: `scale(${modalSpring})`,
            opacity: modalSpring,
            width: "100%",
            maxWidth: 1100,
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.borderLight}`,
            borderRadius: 24,
            padding: "36px 44px",
            boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px ${theme.borderLight}`,
            display: "flex",
            flexDirection: "column",
            gap: 28,
            position: "relative",
          }}
        >
          {/* Top Bar: Assistant Identity & Live Voice Status */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: `1px solid ${theme.border}`,
              paddingBottom: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: `${theme.brand}25`,
                  border: `1px solid ${theme.brand}50`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 0 20px ${theme.brandGlow}`,
                }}
              >
                <Bot size={24} color={theme.brand} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontFamily: fonts.display,
                      fontSize: 20,
                      fontWeight: 700,
                      color: theme.white,
                    }}
                  >
                    TimeBot Voice
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 999,
                      backgroundColor: isAutoSent
                        ? `${theme.azure}25`
                        : `${theme.brand}25`,
                      color: isAutoSent ? theme.azureLight : theme.brandLight,
                      border: `1px solid ${
                        isAutoSent ? theme.azure : theme.brand
                      }50`,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        backgroundColor: isAutoSent
                          ? theme.azureLight
                          : theme.brand,
                      }}
                    />
                    {isAutoSent
                      ? "Processando plano de ação..."
                      : "Gravando em tempo real"}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 14,
                    color: theme.textMuted,
                  }}
                >
                  Fale naturalmente — envio automático após uma breve pausa
                </span>
              </div>
            </div>

            {/* VAD Countdown Ring Indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ position: "relative", width: 44, height: 44 }}>
                <svg width="44" height="44" viewBox="0 0 44 44">
                  <title>Indicador de silêncio VAD</title>
                  <circle
                    cx="22"
                    cy="22"
                    r="18"
                    fill="none"
                    stroke={theme.border}
                    strokeWidth="3"
                  />
                  <circle
                    cx="22"
                    cy="22"
                    r="18"
                    fill="none"
                    stroke={theme.brand}
                    strokeWidth="3"
                    strokeDasharray={113}
                    strokeDashoffset={113 * (1 - vadProgress)}
                    strokeLinecap="round"
                    transform="rotate(-90 22 22)"
                  />
                </svg>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Mic size={18} color={theme.brand} />
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 15,
                    fontWeight: 700,
                    color: theme.white,
                  }}
                >
                  00:04
                </div>
                <div style={{ fontSize: 12, color: theme.textDimmed }}>
                  {isAutoSent ? "Disparado" : "Silêncio VAD"}
                </div>
              </div>
            </div>
          </div>

          {/* 44-Bar Symmetrical Audio Visualizer Spectrum */}
          <div
            style={{
              height: 76,
              backgroundColor: "rgba(0,0,0,0.45)",
              border: `1px solid ${theme.border}`,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "0 24px",
              boxShadow: "inset 0 4px 12px rgba(0,0,0,0.5)",
            }}
          >
            {SPECTRUM_BARS.map((bar) => {
              // Symmetrical distance from center
              const distFromCenter = Math.abs(
                bar.index - (SPECTRUM_BARS.length - 1) / 2,
              );
              const normalizedDist =
                distFromCenter / (SPECTRUM_BARS.length / 2);

              // Wave calculation based on deterministic frame
              const isVoiceActive = frame >= 40 && frame <= 180;
              const wavePhase = frame * 0.22 + bar.index * 0.38;
              const secondaryPhase = frame * 0.12 - bar.index * 0.24;

              const waveAmp = isVoiceActive
                ? 0.45 * Math.sin(wavePhase) + 0.35 * Math.cos(secondaryPhase)
                : 0.1;

              // Center bars are taller, tapering smoothly to edges
              const baseHeight = Math.max(
                6,
                Math.round((1 - normalizedDist * 0.75) * (waveAmp * 54 + 20)),
              );

              return (
                <div
                  key={bar.id}
                  style={{
                    width: 6,
                    height: `${baseHeight}px`,
                    borderRadius: 3,
                    backgroundColor:
                      normalizedDist < 0.4 ? theme.brand : theme.brandLight,
                    opacity: isVoiceActive
                      ? 0.5 + (1 - normalizedDist) * 0.5
                      : 0.3,
                    boxShadow:
                      isVoiceActive && normalizedDist < 0.3
                        ? `0 0 10px ${theme.brand}`
                        : "none",
                  }}
                />
              );
            })}
          </div>

          {/* Live Transcript Bubble */}
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              border: `1px solid ${theme.border}`,
              borderRadius: 16,
              padding: "20px 24px",
              minHeight: 74,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 18,
                color: theme.white,
                lineHeight: 1.5,
              }}
            >
              {currentTranscript}
              {frame < 160 && (
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: 20,
                    backgroundColor: theme.brand,
                    marginLeft: 4,
                    verticalAlign: "middle",
                    opacity: frame % 16 < 8 ? 1 : 0,
                  }}
                />
              )}
            </span>
          </div>

          {/* KokonutUI AI Tool Approval Card (Plan Proposal) */}
          <div
            style={{
              transform: `scale(${proposalSpring})`,
              opacity: proposalSpring,
              backgroundColor: "rgba(249, 115, 22, 0.06)",
              border: `1px solid ${
                isConfirmed ? theme.success : `${theme.brand}60`
              }`,
              borderRadius: 18,
              padding: "24px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              boxShadow: isConfirmed
                ? `0 10px 30px rgba(34, 197, 94, 0.15)`
                : `0 10px 30px ${theme.brandGlow}`,
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
                <FolderGit2
                  size={20}
                  color={isConfirmed ? theme.success : theme.brand}
                />
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 18,
                    fontWeight: 700,
                    color: theme.white,
                  }}
                >
                  Plano: Apontamento de Horas Detectado
                </span>
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: 999,
                  backgroundColor: isConfirmed
                    ? `${theme.success}20`
                    : `${theme.brand}20`,
                  color: isConfirmed ? theme.success : theme.brandLight,
                  border: `1px solid ${
                    isConfirmed ? theme.success : theme.brand
                  }40`,
                }}
              >
                {isConfirmed ? "Ação Executada" : "Requer Confirmação"}
              </span>
            </div>

            {/* Proposal Details Row */}
            <div
              style={{
                display: "flex",
                gap: 20,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 8,
                  backgroundColor: theme.bgCardHover,
                  fontSize: 14,
                  color: theme.white,
                }}
              >
                <span style={{ color: theme.textMuted }}>Projeto:</span>
                <span style={{ fontWeight: 600, color: theme.brandLight }}>
                  OptSolv Mobile
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 8,
                  backgroundColor: theme.bgCardHover,
                  fontSize: 14,
                  color: theme.white,
                }}
              >
                <span style={{ color: theme.textMuted }}>Card:</span>
                <span style={{ fontWeight: 600, color: theme.azureLight }}>
                  #1042 Fix layout drawer
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 8,
                  backgroundColor: theme.bgCardHover,
                  fontSize: 14,
                  color: theme.white,
                }}
              >
                <Clock size={16} color={theme.textMuted} />
                <span style={{ fontWeight: 700, fontFamily: fonts.mono }}>
                  02:00
                </span>
                <span style={{ color: theme.success, fontSize: 13 }}>
                  • Faturável
                </span>
              </div>
            </div>

            {/* Action Row */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 12,
                marginTop: 4,
              }}
            >
              <button
                type="button"
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  border: `1px solid ${theme.borderLight}`,
                  backgroundColor: "transparent",
                  color: theme.textMuted,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Editar detalhes
              </button>

              <button
                type="button"
                style={{
                  transform: `scale(${isConfirmed ? confirmSpring : 1})`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 24px",
                  borderRadius: 10,
                  backgroundColor: isConfirmed ? theme.success : theme.brand,
                  border: "none",
                  color: theme.white,
                  fontSize: 14,
                  fontWeight: 700,
                  boxShadow: isConfirmed
                    ? `0 0 20px rgba(34, 197, 94, 0.4)`
                    : `0 0 20px ${theme.brandGlow}`,
                }}
              >
                {isConfirmed ? (
                  <>
                    <Check size={18} /> Lançamento Confirmado com Sucesso!
                  </>
                ) : (
                  <>
                    <ArrowUpRight size={18} /> Confirmar Lançamento (1-Clique)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
