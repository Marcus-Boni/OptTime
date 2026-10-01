import {
  Calendar,
  Check,
  CheckCircle2,
  FileText,
  GitPullRequest,
  PhoneCall,
  Sparkles,
  Zap,
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
 * Scene 2 — Reconstrução com Memória Microsoft 365 & Chamadas Teams (0–450 frames = 15s)
 *
 * Demonstrates the core v1.9.0 workflow:
 * 1. Intelligent day reconstruction merging Azure DevOps commits, Teams Call Records,
 *    Microsoft 365 docs and Outlook meetings.
 * 2. Visual evidence cards with audit trail, confidence score and deduplication.
 * 3. 1-Click apply turning a 4.5h fragmented day into a verified 8.0h complete timesheet.
 */

const RECONSTRUCTED_ITEMS = [
  {
    icon: GitPullRequest,
    source: "Azure DevOps · Sessão de Commits",
    project: "Harvest (OPT-082)",
    title: "feat(auth): SSO Entra ID e sync de perfis corporativos",
    duration: "1h 30m",
    tag: "98% Confiança",
    tagColor: theme.brand,
    color: theme.brand,
  },
  {
    icon: PhoneCall,
    source: "Microsoft Teams · Call Records",
    project: "Harvest (OPT-082)",
    title: "Call 1:1 com Mariana Silva · Revisão de Arquitetura",
    duration: "45 min",
    tag: "Presença 100%",
    tagColor: "#7B83EB",
    color: "#7B83EB",
  },
  {
    icon: FileText,
    source: "Microsoft 365 · SharePoint",
    project: "Harvest (OPT-082)",
    title: "Especificação Técnica - Sprint 12.docx",
    duration: "30 min",
    tag: "Pista Ativa",
    tagColor: theme.azureLight,
    color: theme.azureLight,
  },
  {
    icon: Calendar,
    source: "Outlook · Agenda Normalizada",
    project: "Harvest (OPT-082)",
    title: "Daily Standup & Refinamento de Backlog",
    duration: "45 min",
    tag: "Sem Sobreposição",
    tagColor: theme.success,
    color: theme.success,
  },
];

export const ReconstructionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [425, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Modal emergence
  const modalSpring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  // Action applied at frame 250
  const appliedAt = 250;
  const isApplied = frame >= appliedAt;
  const _appliedSpring = spring({
    frame: frame - appliedAt,
    fps,
    config: { damping: 14, stiffness: 130 },
  });

  // Progress hours: starts at 4.5h, climbs to 8.0h
  const progressHours = interpolate(
    frame,
    [appliedAt, appliedAt + 60],
    [4.5, 8.0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const progressPercent = (progressHours / 8.0) * 100;

  // Click pulse animation at frame 245
  const clickScale = interpolate(frame, [240, 248, 256], [1, 0.94, 1], {
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
      <GlowDot x="50%" y="15%" size={750} opacity={0.15} color={theme.brand} />
      <GlowDot x="85%" y="60%" size={550} opacity={0.12} color="#7B83EB" />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 80px",
          gap: 28,
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
              <Badge color={theme.brand}>
                PREENCHER MEU DIA COM EVIDÊNCIAS
              </Badge>
              <Badge color="#7B83EB">MICROSOFT GRAPH CALL RECORDS</Badge>
            </div>
            <h1
              style={{
                fontSize: 50,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Reconstrução Inteligente & Memória M365.
              <br />
              <GradientText>
                Evidências reais transformadas em apontamentos seguros.
              </GradientText>
            </h1>
          </div>
        </FadeIn>

        {/* Reconstructor Main Dialog */}
        <div
          style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${isApplied ? `${theme.success}80` : theme.border}`,
            borderRadius: 20,
            padding: "26px 32px",
            width: "100%",
            maxWidth: 1120,
            boxShadow: isApplied
              ? `0 25px 60px rgba(34, 197, 94, 0.15)`
              : "0 25px 60px rgba(0,0,0,0.6)",
            opacity: modalSpring,
            transform: `translateY(${interpolate(modalSpring, [0, 1], [30, 0])}px)`,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Top Bar: Progress and Day Goal */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: `1px solid ${theme.border}`,
              paddingBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: `${theme.brand}20`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: theme.brand,
                }}
              >
                <Sparkles size={20} />
              </div>
              <div>
                <div
                  style={{ fontSize: 18, fontWeight: 700, color: theme.white }}
                >
                  Sugestões do Dia · Sexta-feira
                </div>
                <div style={{ fontSize: 13, color: theme.textMuted }}>
                  4 evidências consolidadas via Microsoft 365, Teams e Azure
                  DevOps
                </div>
              </div>
            </div>

            {/* Progress Counter */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  Jornada Concluída
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    fontFamily: fonts.mono,
                    color: isApplied ? theme.success : theme.white,
                  }}
                >
                  {progressHours.toFixed(1)}h / 8.0h
                </div>
              </div>
              <div
                style={{
                  width: 140,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: theme.bg,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressPercent}%`,
                    backgroundColor: isApplied ? theme.success : theme.brand,
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Evidence Grid (4 Cards) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 14,
            }}
          >
            {RECONSTRUCTED_ITEMS.map((item, i) => {
              const itemSpring = spring({
                frame: frame - 40 - i * 14,
                fps,
                config: { damping: 14, stiffness: 120 },
              });
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  style={{
                    backgroundColor: theme.bg,
                    border: `1px solid ${isApplied ? `${theme.success}40` : theme.border}`,
                    borderRadius: 14,
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    opacity: itemSpring,
                    transform: `translateY(${interpolate(itemSpring, [0, 1], [15, 0])}px)`,
                    minHeight: 88,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: `${item.color}18`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: item.color,
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: theme.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {item.source}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          backgroundColor: `${item.tagColor}20`,
                          color: item.tagColor,
                          fontWeight: 600,
                        }}
                      >
                        {item.tag}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: theme.white,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.title}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontFamily: fonts.mono,
                        color: theme.white,
                      }}
                    >
                      {item.duration}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: isApplied ? theme.success : theme.textMuted,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        justifyContent: "flex-end",
                      }}
                    >
                      {isApplied ? (
                        <>
                          <Check size={12} />
                          <span>Aplicado</span>
                        </>
                      ) : (
                        <span>Pronto</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 12,
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: theme.success,
                }}
              />
              <span style={{ fontSize: 13, color: theme.textMuted }}>
                Privacidade garantida: zero áudio ou transcrição de chamadas
                armazenados
              </span>
            </div>

            <div
              style={{
                transform: `scale(${clickScale})`,
                transition: "transform 0.1s ease",
              }}
            >
              {isApplied ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 24px",
                    borderRadius: 12,
                    backgroundColor: `${theme.success}20`,
                    border: `1px solid ${theme.success}`,
                    color: theme.success,
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  <CheckCircle2 size={18} />
                  <span>Dia Reconstruído · 8h Registradas com Sucesso</span>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 24px",
                    borderRadius: 12,
                    backgroundColor: theme.brand,
                    color: theme.white,
                    fontWeight: 700,
                    fontSize: 15,
                    boxShadow: `0 8px 24px ${theme.brandGlow}`,
                  }}
                >
                  <Zap size={18} />
                  <span>Aplicar 4 Sugestões (+3h 30m)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
