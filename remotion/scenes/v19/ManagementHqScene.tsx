import {
  ArrowUpRight,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  Users,
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
 * Scene 4 — Central de Gestão & Decisões Acionáveis (/dashboard/hq) (0–390 frames = 13s)
 *
 * Highlights the v1.9.0 management upgrade:
 * 1. Predictive Project Budget Radar (Contracted vs Consumed vs Balance vs Forecast)
 * 2. Team Capacity Heatmap (separating historical logs from future allocations)
 * 3. 1-Click Explicit Batch Approval with instant validation
 */

export const ManagementHqScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [365, 390], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const card1Spring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const card2Spring = spring({
    frame: frame - 35,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const card3Spring = spring({
    frame: frame - 55,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  // Animated burndown progress from 52% to 78%
  const burndownPercent = interpolate(frame, [40, 150], [52, 78], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Batch approve action trigger at frame 225
  const approveAt = 225;
  const isApproved = frame >= approveAt;
  const clickScale = interpolate(
    frame,
    [approveAt - 6, approveAt, approveAt + 6],
    [1, 0.94, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
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
      <GlowDot x="50%" y="15%" size={750} opacity={0.15} color={theme.brand} />
      <GlowDot x="85%" y="60%" size={550} opacity={0.1} color={theme.azure} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 70px",
          gap: 28,
        }}
      >
        <FadeIn delay={0}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Badge color={theme.brand}>
                CENTRAL DE GESTÃO · /dashboard/hq
              </Badge>
              <Badge color={theme.success}>ORÇAMENTO & CAPACIDADE</Badge>
            </div>
            <h1
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Decisões de Gestão Claras & Acionáveis.
              <br />
              <GradientText>
                Orçamento visível, capacidade futura e aprovação em lote.
              </GradientText>
            </h1>
          </div>
        </FadeIn>

        {/* 3 HQ Feature Pillars */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 22,
            width: "100%",
            maxWidth: 1240,
          }}
        >
          {/* Pillar 1: Radar de Projetos Preditivo */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: 18,
              padding: "24px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              opacity: card1Spring,
              transform: `translateY(${interpolate(card1Spring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 15px 40px rgba(0,0,0,0.5)",
              minHeight: 330,
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
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${theme.brand}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.brandLight,
                  }}
                >
                  <TrendingUp size={20} />
                </div>
                <div
                  style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
                >
                  Radar de Projetos
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  backgroundColor: `${theme.success}20`,
                  color: theme.success,
                  fontWeight: 600,
                }}
              >
                No Prazo
              </span>
            </div>

            <div
              style={{
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                }}
              >
                <span style={{ color: theme.textMuted }}>
                  Contratado / Consumido
                </span>
                <span
                  style={{
                    color: theme.white,
                    fontWeight: 700,
                    fontFamily: fonts.mono,
                  }}
                >
                  195h / 250h ({Math.round(burndownPercent)}%)
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: theme.border,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${burndownPercent}%`,
                    backgroundColor: theme.brand,
                    borderRadius: 999,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: theme.textMuted,
                }}
              >
                <span>
                  Saldo: <strong style={{ color: theme.success }}>55h</strong>
                </span>
                <span>
                  Previsão Término:{" "}
                  <strong style={{ color: theme.white }}>242h</strong>
                </span>
              </div>
            </div>

            <p
              style={{
                fontSize: 13,
                color: theme.textMuted,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Projetos sem orçamento são tratados com precisão e alertas
              preditivos antecipam estouros de escopo.
            </p>
          </div>

          {/* Pillar 2: Capacidade & Alocação Futura */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: 18,
              padding: "24px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              opacity: card2Spring,
              transform: `translateY(${interpolate(card2Spring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 15px 40px rgba(0,0,0,0.5)",
              minHeight: 330,
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
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${theme.azure}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.azureLight,
                  }}
                >
                  <Users size={20} />
                </div>
                <div
                  style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
                >
                  Capacidade Futura
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 6,
                  backgroundColor: `${theme.azure}20`,
                  color: theme.azureLight,
                  fontWeight: 600,
                }}
              >
                Próx. Semana
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                {
                  name: "Marcus Boni",
                  role: "Tech Lead",
                  load: 92,
                  tag: "Equilibrado",
                  color: theme.success,
                },
                {
                  name: "Sarah Lima",
                  role: "Product Designer",
                  load: 105,
                  tag: "Sobrecarga",
                  color: theme.warning,
                },
                {
                  name: "Lucas Moura",
                  role: "Fullstack Eng.",
                  load: 74,
                  tag: "Disponível",
                  color: theme.info,
                },
              ].map((m) => (
                <div
                  key={m.name}
                  style={{
                    backgroundColor: theme.bg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: theme.white,
                      }}
                    >
                      {m.name}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textDimmed }}>
                      {m.role}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: m.color,
                        fontFamily: fonts.mono,
                      }}
                    >
                      {m.load}% FTE
                    </div>
                    <div style={{ fontSize: 10, color: theme.textMuted }}>
                      {m.tag}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p
              style={{
                fontSize: 13,
                color: theme.textMuted,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Distingue apontamento histórico de disponibilidade planejada para
              redistribuir demandas com clareza.
            </p>
          </div>

          {/* Pillar 3: Aprovações em Lote com Triagem */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${isApproved ? `${theme.success}80` : theme.border}`,
              borderRadius: 18,
              padding: "24px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              opacity: card3Spring,
              transform: `translateY(${interpolate(card3Spring, [0, 1], [30, 0])}px)`,
              boxShadow: isApproved
                ? `0 15px 40px rgba(34, 197, 94, 0.15)`
                : "0 15px 40px rgba(0,0,0,0.5)",
              minHeight: 330,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: `${theme.purple}20`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: theme.purple,
                    }}
                  >
                    <ShieldCheck size={20} />
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: theme.white,
                    }}
                  >
                    Aprovações em Lote
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 6,
                    backgroundColor: isApproved
                      ? `${theme.success}20`
                      : `${theme.brand}20`,
                    color: isApproved ? theme.success : theme.brand,
                    fontWeight: 600,
                  }}
                >
                  {isApproved ? "Concluído" : "8 Conformes"}
                </span>
              </div>

              <div
                style={{
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  Filtro: <strong>Sprint 12 · Harvest</strong>
                </div>
                <div
                  style={{ fontSize: 14, fontWeight: 600, color: theme.white }}
                >
                  8 timesheets auditados sem anomalias
                </div>
                <div style={{ fontSize: 11, color: theme.textDimmed }}>
                  Total: 64h aprovadas de uma só vez
                </div>
              </div>

              <p
                style={{
                  fontSize: 13,
                  color: theme.textMuted,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                Filtros por projeto e status, seleção em lote transparente e
                caminho direto para o timesheet.
              </p>
            </div>

            <div
              style={{
                transform: `scale(${clickScale})`,
                marginTop: 14,
              }}
            >
              {isApproved ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "12px 16px",
                    borderRadius: 12,
                    backgroundColor: `${theme.success}20`,
                    border: `1px solid ${theme.success}`,
                    color: theme.success,
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  <CheckCircle2 size={18} />
                  <span>8 Timesheets Aprovados (64h)</span>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "12px 16px",
                    borderRadius: 12,
                    backgroundColor: theme.brand,
                    color: theme.white,
                    fontWeight: 700,
                    fontSize: 14,
                    boxShadow: `0 6px 20px ${theme.brandGlow}`,
                  }}
                >
                  <span>Aprovar Lote Selecionado</span>
                  <ArrowUpRight size={16} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
