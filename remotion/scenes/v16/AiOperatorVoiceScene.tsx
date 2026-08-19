import {
  CheckCircle2,
  ListOrdered,
  Mic,
  RotateCcw,
  ShieldCheck,
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

/**
 * Scene 2 — TimeBot 2.0: AI Operator, Multi-Step Plans & Voice Commands (0–450 frames = 15s)
 */
export const AiOperatorVoiceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [420, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const micSpring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const planSpring = spring({
    frame: frame - 140,
    fps,
    config: { damping: 14, stiffness: 110 },
  });

  const step1Progress = interpolate(frame, [190, 240], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const step2Progress = interpolate(frame, [250, 300], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const speechText =
    "“Lance 3h no Projeto Horizon e envie meu timesheet”".slice(
      0,
      Math.floor(
        interpolate(frame, [35, 120], [0, 52], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      ),
    );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        opacity: fadeOut,
        overflow: "hidden",
      }}
    >
      <GlowDot x="30%" y="20%" size={750} opacity={0.16} color="#8b5cf6" />
      <GlowDot x="70%" y="60%" size={600} opacity={0.12} color={theme.brand} />

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
            <Badge color="#a855f7">TIMEBOT 2.0 · OPERADOR AUTÔNOMO</Badge>
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
              Comandos por Voz &{" "}
              <GradientText
                style={{
                  background: "linear-gradient(135deg, #c084fc, #f97316)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Planos Multi-Etapas
              </GradientText>
            </h2>
            <p
              style={{
                fontSize: 19,
                color: theme.textMuted,
                margin: 0,
                maxWidth: 820,
              }}
            >
              O assistente agora executa ações reais: dita lançamentos,
              orquestra planos compostos e respeita rigorosas regras de
              permissão.
            </p>
          </div>
        </FadeIn>

        {/* Content Split: Voice Mode + Execution Plan */}
        <div
          style={{
            display: "flex",
            gap: 32,
            width: 1100,
            alignItems: "stretch",
          }}
        >
          {/* Voice Command Card */}
          <div
            style={{
              flex: 1,
              transform: `scale(${micSpring})`,
              opacity: micSpring,
              background: "#15121e",
              borderRadius: 20,
              border: "1px solid rgba(168, 85, 247, 0.3)",
              boxShadow: "0 25px 60px rgba(139, 92, 246, 0.15)",
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 20,
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
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(168, 85, 247, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Mic size={20} color="#c084fc" />
                </div>
                <div>
                  <span
                    style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}
                  >
                    Modo Mãos-Livres
                  </span>
                  <span
                    style={{ display: "block", fontSize: 11, color: "#a855f7" }}
                  >
                    Web Speech API local
                  </span>
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: fonts.mono,
                  color: "#e9d5ff",
                  background: "rgba(168, 85, 247, 0.15)",
                  border: "1px solid rgba(168, 85, 247, 0.3)",
                  padding: "4px 8px",
                  borderRadius: 6,
                }}
              >
                Ctrl + Shift + V
              </span>
            </div>

            {/* Audio waveform */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                height: 54,
                background: "rgba(0,0,0,0.3)",
                borderRadius: 12,
                padding: "0 16px",
              }}
            >
              {[
                "w1",
                "w2",
                "w3",
                "w4",
                "w5",
                "w6",
                "w7",
                "w8",
                "w9",
                "w10",
                "w11",
                "w12",
                "w13",
                "w14",
                "w15",
                "w16",
                "w17",
                "w18",
              ].map((barId, i) => {
                const waveHeight = interpolate(
                  Math.sin((frame + i * 12) * 0.2),
                  [-1, 1],
                  [8, 38],
                );
                return (
                  <div
                    key={barId}
                    style={{
                      width: 4,
                      height: waveHeight,
                      borderRadius: 4,
                      background: i % 2 === 0 ? "#a855f7" : "#ec4899",
                      transition: "height 0.05s ease",
                    }}
                  />
                );
              })}
            </div>

            {/* Transcription output */}
            <div
              style={{
                background: "#1c172a",
                borderRadius: 12,
                border: "1px solid rgba(168, 85, 247, 0.2)",
                padding: "14px",
                minHeight: 68,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#a855f7",
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                TRANSCRIÇÃO AO VIVO
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: speechText ? "#faf5ff" : "#7e22ce",
                  fontStyle: speechText ? "italic" : "normal",
                  fontWeight: 500,
                }}
              >
                {speechText || "Ouvindo seu comando em português..."}
              </div>
            </div>
          </div>

          {/* Execution Plan Card */}
          <div
            style={{
              flex: 1.2,
              transform: `scale(${planSpring})`,
              opacity: planSpring,
              background: "#141414",
              borderRadius: 20,
              border: `1px solid ${theme.borderLight}`,
              boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 16,
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
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(249, 115, 22, 0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ListOrdered size={20} color={theme.brand} />
                </div>
                <div>
                  <span
                    style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}
                  >
                    Plano de Execução Estruturado
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 11,
                      color: theme.brand,
                    }}
                  >
                    2 etapas orquestradas
                  </span>
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: "#22c55e",
                  background: "rgba(34, 197, 94, 0.1)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  padding: "4px 10px",
                  borderRadius: 99,
                  fontWeight: 600,
                }}
              >
                Execução Segura
              </span>
            </div>

            {/* Plan steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Step 1 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: 12,
                  background:
                    step1Progress >= 1 ? "rgba(34, 197, 94, 0.08)" : "#1c1c1c",
                  border: `1px solid ${step1Progress >= 1 ? "rgba(34, 197, 94, 0.3)" : theme.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <CheckCircle2
                    size={20}
                    color={step1Progress >= 1 ? "#22c55e" : theme.textDimmed}
                  />
                  <div>
                    <div
                      style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}
                    >
                      1. Lançar 3h00 em Projeto Horizon
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      Work Item #2041 · Atividade: Desenvolvimento
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: fonts.mono,
                    color: step1Progress >= 1 ? "#22c55e" : theme.textDimmed,
                    fontWeight: 600,
                  }}
                >
                  {step1Progress >= 1 ? "CONCLUÍDO" : "EXECUTANDO..."}
                </span>
              </div>

              {/* Step 2 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: 12,
                  background:
                    step2Progress >= 1 ? "rgba(34, 197, 94, 0.08)" : "#1c1c1c",
                  border: `1px solid ${step2Progress >= 1 ? "rgba(34, 197, 94, 0.3)" : theme.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <CheckCircle2
                    size={20}
                    color={step2Progress >= 1 ? "#22c55e" : theme.textDimmed}
                  />
                  <div>
                    <div
                      style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}
                    >
                      2. Submeter Timesheet da Semana
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      Total recalculado com os novos lançamentos: 40h00
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: fonts.mono,
                    color: step2Progress >= 1 ? "#22c55e" : theme.textDimmed,
                    fontWeight: 600,
                  }}
                >
                  {step2Progress >= 1 ? "CONCLUÍDO" : "AGUARDANDO"}
                </span>
              </div>
            </div>

            {/* Bottom Undo Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 10,
                borderTop: `1px solid ${theme.border}`,
                fontSize: 12,
                color: theme.textDimmed,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={16} color="#3b82f6" />
                <span>Auditoria gravada em tempo real</span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: theme.brandLight,
                  fontWeight: 500,
                }}
              >
                <RotateCcw size={14} />
                <span>Desfazer ação (Undo)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
