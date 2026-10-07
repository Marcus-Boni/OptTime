import { Cpu, Shield, Users } from "lucide-react";
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
 * Scene 5 — Capacidade Sob Medida & Resiliência de IA com NVIDIA NIM (0–330 frames = 11s)
 *
 * Demonstrates:
 * 1. Weekly contractual capacity (20h, 30h, 40h) respected across goals, heatmaps and balance.
 * 2. Enterprise multi-provider AI resilience chain:
 *    Groq -> NVIDIA NIM -> OpenRouter -> Deterministic Regex Fallback.
 * 3. Circuit breaker protecting against downtime and rate-limits.
 */

const AI_CHAIN = [
  { name: "Groq", model: "GPT-OSS 120B", role: "Baixa latência", active: true },
  {
    name: "NVIDIA NIM",
    model: "NVIDIA Nemotron",
    role: "Alta precisão",
    active: true,
  },
  {
    name: "OpenRouter",
    model: "Nemotron 3 Super",
    role: "Fallback IA",
    active: true,
  },
  {
    name: "Regras Regex",
    model: "Parser Determinístico",
    role: "100% Offline",
    active: true,
  },
];

export const CapacityAndAiChainScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [305, 330], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cardSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const circuitPulse = Math.sin(frame / 10) * 0.15 + 0.85;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot
        x="20%"
        y="25%"
        size={700}
        opacity={0.15}
        color={theme.success}
      />
      <GlowDot x="75%" y="65%" size={650} opacity={0.14} color="#76B900" />

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
        {/* Header Pill */}
        <FadeIn delay={5}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Badge color={theme.success}>JORNADAS JUSTAS</Badge>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 16px",
                borderRadius: 999,
                backgroundColor: "#76B90020",
                border: "1px solid #76B90050",
              }}
            >
              <Cpu size={18} color="#76B900" />
              <span
                style={{
                  color: "#8AE600",
                  fontWeight: 600,
                  fontSize: 14,
                  fontFamily: fonts.mono,
                }}
              >
                CADEIA DE IA COM NVIDIA NIM
              </span>
            </div>
          </div>
        </FadeIn>

        {/* Title */}
        <FadeIn delay={12}>
          <div style={{ textAlign: "center", maxWidth: 960 }}>
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
              Jornadas sob medida e{" "}
              <GradientText>IA à prova de falhas</GradientText>
            </h2>
            <p
              style={{
                fontSize: 18,
                color: theme.textMuted,
                marginTop: 8,
                marginBottom: 0,
              }}
            >
              Metas semanais ajustadas a contratos de 20h, 30h e 40h, combinadas
              com arquitetura multi-provedor com disjuntor automático.
            </p>
          </div>
        </FadeIn>

        {/* Main 2-Panel Display */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1.3fr",
            gap: 24,
            width: 1040,
            marginTop: 6,
            transform: `scale(${cardSpring})`,
            opacity: cardSpring,
          }}
        >
          {/* Panel 1: Capacidade Semanal */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              borderRadius: 20,
              border: `1px solid ${theme.border}`,
              padding: "26px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: `${theme.success}20`,
                  border: `1px solid ${theme.success}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: theme.success,
                }}
              >
                <Users size={18} />
              </div>
              <span
                style={{
                  color: theme.white,
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                Capacidade Semanal Flexível
              </span>
            </div>

            <p style={{ fontSize: 13, color: theme.textMuted, margin: 0 }}>
              A plataforma respeita jornadas menores em alertas, metas e
              relatórios, sem cobrar 40h de quem possui contrato reduzido.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                {
                  label: "Contrato 20h / semana",
                  meta: "4h / dia",
                  badge: "Estágio / Meio período",
                  color: theme.azureLight,
                },
                {
                  label: "Contrato 30h / semana",
                  meta: "6h / dia",
                  badge: "Jornada 6 Horas",
                  color: theme.warning,
                },
                {
                  label: "Contrato 40h / semana",
                  meta: "8h / dia",
                  badge: "Padrão Integral",
                  color: theme.brand,
                },
              ].map((tier) => (
                <div
                  key={tier.label}
                  style={{
                    backgroundColor: "#111116",
                    border: "1px solid #252532",
                    borderRadius: 12,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: theme.white,
                        fontWeight: 600,
                        fontSize: 14,
                      }}
                    >
                      {tier.label}
                    </div>
                    <div
                      style={{
                        color: tier.color,
                        fontSize: 12,
                        fontFamily: fonts.mono,
                        fontWeight: 700,
                        marginTop: 2,
                      }}
                    >
                      Meta: {tier.meta}
                    </div>
                  </div>
                  <span
                    style={{
                      backgroundColor: `${tier.color}15`,
                      color: tier.color,
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontWeight: 600,
                      fontFamily: fonts.mono,
                    }}
                  >
                    {tier.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Panel 2: AI Resilience Chain */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              borderRadius: 20,
              border: `1px solid ${theme.border}`,
              padding: "26px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
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
                    backgroundColor: "#76B90020",
                    border: "1px solid #76B90050",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#8AE600",
                  }}
                >
                  <Cpu size={18} />
                </div>
                <span
                  style={{
                    color: theme.white,
                    fontWeight: 700,
                    fontSize: 16,
                  }}
                >
                  Cadeia de IA & Disjuntor
                </span>
              </div>
              <span
                style={{
                  backgroundColor: "#76B90020",
                  color: "#8AE600",
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  fontWeight: 600,
                  fontFamily: fonts.mono,
                }}
              >
                TOLERÂNCIA A FALHAS
              </span>
            </div>

            <p style={{ fontSize: 13, color: theme.textMuted, margin: 0 }}>
              Circuit breaker inteligente: oscilações de um provedor acionam
              imediatamente o próximo nó em milissegundos.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {AI_CHAIN.map((node, idx) => (
                <div
                  key={node.name}
                  style={{
                    backgroundColor: "#111116",
                    border: `1px solid ${idx === 1 ? "#76B90060" : "#252532"}`,
                    borderRadius: 12,
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    boxShadow:
                      idx === 1 ? "0 4px 15px rgba(118, 185, 0, 0.15)" : "none",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: idx === 1 ? "#76B900" : theme.success,
                        opacity: idx === 1 ? circuitPulse : 1,
                      }}
                    />
                    <div>
                      <span
                        style={{
                          color: theme.white,
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {node.name}
                      </span>
                      <span
                        style={{
                          color: theme.textMuted,
                          fontSize: 12,
                          marginLeft: 8,
                          fontFamily: fonts.mono,
                        }}
                      >
                        {node.model}
                      </span>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 11,
                      color: idx === 3 ? theme.brandLight : theme.textMuted,
                      fontFamily: fonts.mono,
                      fontWeight: 600,
                    }}
                  >
                    {node.role}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: theme.textDimmed,
                paddingTop: 4,
              }}
            >
              <Shield size={14} color={theme.success} />
              <span>
                Zero indisponibilidade: se as IAs caírem, as regras assumem
                100%.
              </span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
