import { Maximize2, ShieldCheck } from "lucide-react";
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
} from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 5 — Portal do Cliente & Modo Apresentação (/portal/[token]) (0–330 frames = 11s)
 *
 * Demonstrates:
 * 1. Delivery/Milestones mode tailored for fixed-scope enterprise contracts
 * 2. Fullscreen presentation mode with corporate slide aesthetics (zero scroll)
 * 3. Microsoft Graph team profile sync with automated confidentiality shielding
 */

export const ClientPortalPresentationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [305, 330], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const portalSpring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  // Animated milestone progress
  const milestoneProgress = interpolate(frame, [40, 130], [60, 88], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
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
      <GlowDot x="30%" y="20%" size={700} opacity={0.14} color={theme.azure} />
      <GlowDot x="75%" y="70%" size={550} opacity={0.12} color={theme.brand} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 80px",
          gap: 26,
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
              <Badge color={theme.azureLight}>
                PORTAL DO CLIENTE WHITE-LABEL
              </Badge>
              <Badge color={theme.brand}>MODO APRESENTAÇÃO FULLSCREEN</Badge>
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
              Portal do Cliente & Apresentação Executiva.
              <br />
              <GradientText>
                Visão por entregas, roadmap e reuniões sem atrito.
              </GradientText>
            </h1>
          </div>
        </FadeIn>

        {/* Fullscreen Presentation Slide Container */}
        <div
          style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.borderLight}`,
            borderRadius: 20,
            padding: "24px 32px",
            width: "100%",
            maxWidth: 1140,
            boxShadow: `0 25px 60px ${theme.brandGlow}`,
            opacity: portalSpring,
            transform: `translateY(${interpolate(portalSpring, [0, 1], [30, 0])}px)`,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Slide Header: Client Name, Mode Switcher & Presentation Badge */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: `1px solid ${theme.border}`,
              paddingBottom: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: `${theme.brand}20`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <OptSolvLogo size={18} color={theme.brand} />
              </div>
              <div>
                <div
                  style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
                >
                  Acme Corporation · Projeto Harvest Time Tracker
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  Relatório Executivo de Entregas & Status da Sprint
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* View Switcher Toggle */}
              <div
                style={{
                  display: "flex",
                  backgroundColor: theme.bg,
                  borderRadius: 8,
                  padding: 3,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 6,
                    color: theme.textMuted,
                  }}
                >
                  Horas
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "4px 10px",
                    borderRadius: 6,
                    backgroundColor: `${theme.brand}25`,
                    color: theme.brandLight,
                    fontWeight: 600,
                  }}
                >
                  Entregas (Milestones)
                </span>
              </div>

              {/* Fullscreen Badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "5px 12px",
                  borderRadius: 8,
                  backgroundColor: `${theme.azure}20`,
                  color: theme.azureLight,
                  fontWeight: 600,
                }}
              >
                <Maximize2 size={13} />
                <span>Modo Apresentação</span>
              </div>
            </div>
          </div>

          {/* Slide Body: 3 Milestones Roadmap */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              {
                phase: "Marco 1 · Concluído",
                title: "Infraestrutura Cloud, SSO Microsoft Entra ID & RBAC",
                status: "100% Entregue",
                color: theme.success,
                percent: 100,
              },
              {
                phase: "Marco 2 · Em Andamento",
                title: "Meu Tempo, Memória M365 & Chamadas Teams Verificadas",
                status: `${Math.round(milestoneProgress)}% Concluído`,
                color: theme.brand,
                percent: Math.round(milestoneProgress),
              },
              {
                phase: "Marco 3 · Próxima Etapa",
                title:
                  "Homologação de Segurança, Auditoria e Treinamento Corporativo",
                status: "35% Planejado",
                color: theme.azureLight,
                percent: 35,
              },
            ].map((m, _i) => (
              <div
                key={m.title}
                style={{
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  padding: "14px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 4,
                        backgroundColor: `${m.color}20`,
                        color: m.color,
                        fontWeight: 600,
                      }}
                    >
                      {m.phase}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: theme.white,
                      }}
                    >
                      {m.title}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: fonts.mono,
                      color: m.color,
                    }}
                  >
                    {m.status}
                  </span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: theme.border,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${m.percent}%`,
                      backgroundColor: m.color,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Slide Footer: Team avatars from Graph & Shielded confidentiality */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 12,
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            {/* Team Avatars */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: theme.textMuted }}>
                Equipe Alocada (Sync M365):
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {[
                  { name: "MB", title: "Marcus Boni (Lead)" },
                  { name: "SL", title: "Sarah Lima (Design)" },
                  { name: "LM", title: "Lucas Moura (Eng)" },
                ].map((user) => (
                  <div
                    key={user.name}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      backgroundColor: `${theme.brand}30`,
                      border: `1px solid ${theme.brand}80`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.brandLight,
                    }}
                    title={user.title}
                  >
                    {user.name}
                  </div>
                ))}
              </div>
            </div>

            {/* Privacy Shield Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <ShieldCheck size={14} color={theme.success} />
              <span style={{ fontSize: 12, color: theme.textMuted }}>
                Blindagem ativa: commits e branches internas permanecem
                confidenciais
              </span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
