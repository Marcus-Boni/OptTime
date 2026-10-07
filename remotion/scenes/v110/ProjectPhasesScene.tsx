import {
  CheckCircle2,
  GitBranch,
  Key,
  Layers,
  Plus,
  ShieldCheck,
  TrendingUp,
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
  AzureDevOpsLogo,
  Badge,
  FadeIn,
  GlowDot,
  GradientText,
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 4 — Fases de Projeto com o mesmo Azure DevOps (0–390 frames = 13s)
 *
 * Demonstrates the project phases lifecycle:
 * 1. Same Azure DevOps repository supporting sequential contract renewals (Fase 1, Fase 2).
 * 2. Dedicated budget, timeline and team allocations per phase.
 * 3. Autonomous integration key sequencing (MARAM_PORCL_0001 -> MARAM_PORCL_0002).
 */

export const ProjectPhasesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [365, 390], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const cardSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const phase2Spring = spring({
    frame: frame - 90,
    fps,
    config: { damping: 14, stiffness: 120 },
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
      <GlowDot x="30%" y="20%" size={750} opacity={0.14} color={theme.azure} />
      <GlowDot x="80%" y="65%" size={650} opacity={0.12} color={theme.brand} />

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
            <Badge color={theme.azureLight}>GOVERNANÇA DE CONTRATOS</Badge>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 16px",
                borderRadius: 999,
                backgroundColor: `${theme.azure}20`,
                border: `1px solid ${theme.azure}50`,
              }}
            >
              <AzureDevOpsLogo size={20} />
              <span
                style={{
                  color: theme.azureLight,
                  fontWeight: 600,
                  fontSize: 14,
                  fontFamily: fonts.mono,
                }}
              >
                AZURE DEVOPS MULTI-FASE
              </span>
            </div>
          </div>
        </FadeIn>

        {/* Scene Title */}
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
              Fases de Projeto com o mesmo{" "}
              <GradientText>Azure DevOps</GradientText>
            </h2>
            <p
              style={{
                fontSize: 18,
                color: theme.textMuted,
                marginTop: 8,
                marginBottom: 0,
              }}
            >
              Renovações de contrato agora iniciam novas fases com orçamento,
              equipe e chave de integração segregados, sem duplicar o
              repositório.
            </p>
          </div>
        </FadeIn>

        {/* Project Phases Display Canvas */}
        <div
          style={{
            width: 1040,
            borderRadius: 20,
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bgCard,
            padding: "32px 36px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            transform: `scale(${cardSpring})`,
            opacity: cardSpring,
          }}
        >
          {/* Top Lineage Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: 16,
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  backgroundColor: `${theme.brand}20`,
                  border: `1px solid ${theme.brand}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: theme.brandLight,
                }}
              >
                <Layers size={22} />
              </div>
              <div>
                <span
                  style={{
                    color: theme.white,
                    fontWeight: 700,
                    fontSize: 18,
                    fontFamily: fonts.display,
                  }}
                >
                  Marca Ambiental · Linhagem de Fases
                </span>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 13,
                    fontFamily: fonts.mono,
                  }}
                >
                  Repositório Azure: OPTSOLV/MarcaAmbiental
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                backgroundColor: "#20202a",
                padding: "8px 16px",
                borderRadius: 10,
                border: "1px solid #333344",
                color: theme.white,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Plus size={16} color={theme.brand} />
              <span>Nova Fase Iniciada</span>
            </div>
          </div>

          {/* Sequential Phase Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
            }}
          >
            {/* Phase 1 Card (Completed) */}
            <div
              style={{
                backgroundColor: "#111116",
                border: "1px solid #262634",
                borderRadius: 16,
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                position: "relative",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      backgroundColor: "#262638",
                      color: theme.white,
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 6,
                      fontFamily: fonts.mono,
                    }}
                  >
                    FASE 1
                  </span>
                  <span
                    style={{
                      color: theme.textMuted,
                      fontSize: 14,
                    }}
                  >
                    (Encerrada)
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: theme.success,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>100% Entregue</span>
                </div>
              </div>

              <div>
                <div
                  style={{
                    color: theme.white,
                    fontWeight: 600,
                    fontSize: 16,
                  }}
                >
                  Implementação Inicial & Go-Live
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 8,
                    fontSize: 13,
                    color: theme.textMuted,
                  }}
                >
                  <Key size={14} color="#a3a3a3" />
                  <span style={{ fontFamily: fonts.mono }}>
                    MARAM_PORCL_0001
                  </span>
                </div>
              </div>

              {/* Progress */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: theme.textMuted }}>
                    Orçamento Consumido
                  </span>
                  <span
                    style={{
                      color: theme.white,
                      fontFamily: fonts.mono,
                      fontWeight: 600,
                    }}
                  >
                    160h / 160h
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 8,
                    backgroundColor: "#222230",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      backgroundColor: theme.textMuted,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Phase 2 Card (Active & Fresh) */}
            <div
              style={{
                backgroundColor: "#151822",
                border: `1px solid ${theme.brand}60`,
                borderRadius: 16,
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
                position: "relative",
                boxShadow: `0 10px 30px ${theme.brandGlow}`,
                transform: `scale(${phase2Spring})`,
                opacity: phase2Spring,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      backgroundColor: `${theme.brand}25`,
                      color: theme.brandLight,
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 6,
                      fontFamily: fonts.mono,
                      border: `1px solid ${theme.brand}40`,
                    }}
                  >
                    FASE 2
                  </span>
                  <span
                    style={{
                      color: theme.success,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    ● Ativa / Em Andamento
                  </span>
                </div>
                <span
                  style={{
                    backgroundColor: "#1e293b",
                    color: theme.azureLight,
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontFamily: fonts.mono,
                    fontWeight: 600,
                  }}
                >
                  NOVO ORÇAMENTO
                </span>
              </div>

              <div>
                <div
                  style={{
                    color: theme.white,
                    fontWeight: 600,
                    fontSize: 16,
                  }}
                >
                  Evolução & Suporte Contínuo
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 8,
                    fontSize: 13,
                    color: theme.brandLight,
                  }}
                >
                  <Key size={14} color={theme.brand} />
                  <span style={{ fontFamily: fonts.mono, fontWeight: 700 }}>
                    MARAM_PORCL_0002
                  </span>
                  <span style={{ fontSize: 11, color: theme.textMuted }}>
                    (Sequencial Automática)
                  </span>
                </div>
              </div>

              {/* Progress */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: theme.textMuted }}>
                    Novo Saldo Disponível
                  </span>
                  <span
                    style={{
                      color: theme.brandLight,
                      fontFamily: fonts.mono,
                      fontWeight: 700,
                    }}
                  >
                    120h contratadas (100% livre)
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 8,
                    backgroundColor: "#222230",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "12%",
                      height: "100%",
                      backgroundColor: theme.brand,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Pillar Footnote */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              paddingTop: 8,
              borderTop: `1px solid ${theme.border}`,
              fontSize: 13,
              color: theme.textMuted,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} color={theme.success} />
              <span>Chaves exclusivas evitam colisão na API v1</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <GitBranch size={16} color={theme.azureLight} />
              <span>Sincronização com Azure DevOps preservada</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={16} color={theme.brand} />
              <span>Histórico financeiro imutável por fase</span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
