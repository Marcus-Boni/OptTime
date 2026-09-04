import {
  Calendar,
  Check,
  GitPullRequest,
  History,
  MessageSquare,
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
import { Badge, FadeIn, GlowDot, GradientText } from "../../components/shared";
import { fonts, theme } from "../../theme";

/**
 * Scene 2 — Magic Timesheet Reconstructor & Teams Nudge (0–450 frames = 15s)
 *
 * Demonstrates the interactive Teams 17h30 reminder and the 1-click
 * AI-assisted day reconstruction dialog crossing Outlook meetings,
 * Azure DevOps activity and personal weekday patterns.
 */

const RECONSTRUCTED_ITEMS = [
  {
    icon: Calendar,
    source: "Outlook Calendar",
    project: "Harvest (OPT-014)",
    title: "Daily Standup & Sprint Planning",
    duration: "30 min",
    color: theme.azureLight,
  },
  {
    icon: GitPullRequest,
    source: "Azure DevOps PR #452",
    project: "Harvest (OPT-014)",
    title: "feat(auth): Auth Flow & Unit Tests",
    duration: "1h 00min",
    color: theme.brand,
  },
  {
    icon: History,
    source: "Padrão de Sexta-feira",
    project: "Harvest (OPT-014)",
    title: "Code Review & Refinamento de Backlog",
    duration: "30 min",
    color: theme.purple,
  },
];

export const ReconstructorScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [425, 450], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Stage 1: Teams Nudge arrives (frames 10-120)
  const teamsSpring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  // Click on "Preencher com IA" at frame 110
  const clickScale = interpolate(frame, [110, 118, 126], [1, 0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Stage 2: Reconstructor Modal opens at frame 130
  const modalSpring = spring({
    frame: frame - 130,
    fps,
    config: { damping: 16, stiffness: 110 },
  });

  // Stage 3: Items reveal
  const appliedAt = 330;
  const isApplied = frame >= appliedAt;
  const appliedSpring = spring({
    frame: frame - appliedAt,
    fps,
    config: { damping: 14, stiffness: 130 },
  });

  // Hours progress: starts at 6h, climbs to 8h
  const progressHours = interpolate(frame, [160, 260], [6.0, 8.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const progressPercent = (progressHours / 8.0) * 100;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot x="70%" y="20%" size={700} opacity={0.16} color={theme.brand} />
      <GlowDot x="15%" y="65%" size={550} opacity={0.12} color={theme.azure} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 80px",
          gap: 30,
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
              <Badge color={theme.azureLight}>MICROSOFT TEAMS + IA</Badge>
              <Badge color={theme.brand}>MAGIC RECONSTRUCTOR</Badge>
            </div>
            <h1
              style={{
                fontSize: 52,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Faltam 2 horas no dia?
              <br />
              <GradientText>O OptSolv reconstrói para você.</GradientText>
            </h1>
          </div>
        </FadeIn>

        {/* Main interactive area: Teams Nudge vs Reconstructor Modal */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 40,
            width: "100%",
            maxWidth: 1200,
            minHeight: 460,
          }}
        >
          {/* Left: Teams Adaptive Card Nudge (17h30) */}
          <div
            style={{
              width: 380,
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: 18,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              opacity: teamsSpring,
              transform: `translateY(${interpolate(teamsSpring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: "#5059C925",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#7B83EB",
                }}
              >
                <MessageSquare size={20} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: theme.white,
                  }}
                >
                  Microsoft Teams · 17h30
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  Lembrete Vespertino Interativo
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: "16px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: theme.white,
                }}
              >
                Você registrou{" "}
                <span style={{ color: theme.brandLight }}>6h 00min</span> hoje.
              </div>
              <div style={{ fontSize: 13, color: theme.textMuted }}>
                Faltam{" "}
                <strong style={{ color: theme.warning }}>2h 00min</strong> para
                completar sua meta diária de 8h.
              </div>
            </div>

            {/* Interactive Button */}
            <div
              style={{
                backgroundColor: theme.brand,
                borderRadius: 12,
                padding: "12px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: theme.white,
                fontWeight: 700,
                fontSize: 14,
                boxShadow: `0 4px 20px ${theme.brandGlow}`,
                transform: `scale(${clickScale})`,
              }}
            >
              <Sparkles size={16} />
              <span>✨ Preencher meu dia com IA</span>
            </div>
          </div>

          {/* Right: Magic Reconstructor Modal */}
          <div
            style={{
              flex: 1,
              backgroundColor: theme.bgCard,
              border: `1px solid ${isApplied ? theme.success : theme.border}`,
              borderRadius: 20,
              padding: "26px 30px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              opacity: modalSpring,
              transform: `translateY(${interpolate(modalSpring, [0, 1], [30, 0])}px)`,
              boxShadow: `0 25px 70px rgba(0,0,0,0.6), 0 0 0 1px ${isApplied ? theme.success : "transparent"}`,
              transition: "border 0.3s ease",
            }}
          >
            {/* Header with Progress Bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: theme.white,
                    fontFamily: fonts.display,
                  }}
                >
                  Magic Timesheet Reconstructor
                </div>
                <div
                  style={{ fontSize: 13, color: theme.textMuted, marginTop: 2 }}
                >
                  3 evidências encontradas · Outlook, Azure DevOps & Padrões
                </div>
              </div>

              {/* Progress counter */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: theme.bg,
                  padding: "8px 16px",
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <span style={{ fontSize: 13, color: theme.textMuted }}>
                  Total do Dia:
                </span>
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily: fonts.mono,
                    color:
                      progressHours >= 8 ? theme.success : theme.brandLight,
                  }}
                >
                  {progressHours.toFixed(1)}h / 8.0h
                </span>
              </div>
            </div>

            {/* Progress Bar Line */}
            <div
              style={{
                width: "100%",
                height: 6,
                backgroundColor: theme.bg,
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  backgroundColor:
                    progressHours >= 8 ? theme.success : theme.brand,
                  transition: "width 0.2s ease",
                }}
              />
            </div>

            {/* Items List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {RECONSTRUCTED_ITEMS.map((item, idx) => {
                const itemSpring = spring({
                  frame: frame - (150 + idx * 18),
                  fps,
                  config: { damping: 15, stiffness: 120 },
                });
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    style={{
                      backgroundColor: theme.bg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 14,
                      padding: "12px 18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      opacity: itemSpring,
                      transform: `translateY(${interpolate(itemSpring, [0, 1], [15, 0])}px)`,
                    }}
                  >
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 14 }}
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          backgroundColor: `${item.color}20`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: item.color,
                        }}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: theme.white,
                          }}
                        >
                          {item.title}
                        </div>
                        <div style={{ fontSize: 12, color: theme.textMuted }}>
                          {item.project} ·{" "}
                          <span style={{ color: item.color }}>
                            {item.source}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "4px 12px",
                        borderRadius: 8,
                        backgroundColor: `${theme.brand}15`,
                        color: theme.brandLight,
                        fontWeight: 700,
                        fontSize: 13,
                        fontFamily: fonts.mono,
                      }}
                    >
                      +{item.duration}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer action */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <div style={{ fontSize: 13, color: theme.textDimmed }}>
                Zero alucinação · Refino com IA determinístico · Sync com Azure
                DevOps
              </div>

              <div
                style={{
                  backgroundColor: isApplied ? theme.success : theme.brand,
                  borderRadius: 12,
                  padding: "10px 22px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: theme.white,
                  fontWeight: 700,
                  fontSize: 14,
                  transform: `scale(${isApplied ? appliedSpring : 1})`,
                }}
              >
                {isApplied ? (
                  <>
                    <Check size={18} />
                    <span>Dia Completo & Sincronizado!</span>
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    <span>Aplicar 2h no Timesheet</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
