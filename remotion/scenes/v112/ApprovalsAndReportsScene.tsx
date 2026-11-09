import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  History,
  Lock,
  RotateCcw,
  Search,
  Terminal,
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
 * Scene 5 — Gestão Ágil de Timesheets & Relatórios M2M (0–330 frames = 11s)
 *
 * Demonstrates:
 * 1. Approvals UX: Search by collaborator/project, period filters and dedicated history tab.
 * 2. 1-Click Approved Week Reopening: Reopen approved timesheets with full audit log.
 * 3. Machine-to-Machine (M2M) Corporate Reports: Secure PDF & JSON export endpoints for external ERPs.
 */

export const ApprovalsAndReportsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [305, 330], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const headerSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const leftCardSpring = spring({
    frame: frame - 25,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const rightCardSpring = spring({
    frame: frame - 40,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  // Reopen action animation at frame 160
  const reopenAt = 160;
  const isReopened = frame >= reopenAt;
  const reopenSpring = spring({
    frame: frame - reopenAt,
    fps,
    config: { damping: 12, stiffness: 180 },
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
      <GlowDot x="30%" y="25%" size={750} opacity={0.15} color={theme.azure} />
      <GlowDot x="75%" y="75%" size={600} opacity={0.12} color={theme.brand} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 90px",
          gap: 28,
        }}
      >
        {/* Header */}
        <div
          style={{
            transform: `scale(${headerSpring})`,
            opacity: headerSpring,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Badge color={theme.azure}>Governança de Timesheets & M2M</Badge>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: theme.azureLight,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <History size={16} /> Busca, Histórico & Relatórios Programáticos
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
            Aprovações Flexíveis &{" "}
            <GradientText>Relatórios Corporativos M2M</GradientText>
          </h2>

          <p
            style={{
              fontSize: 20,
              color: theme.textMuted,
              maxWidth: 960,
              lineHeight: 1.45,
            }}
          >
            Filtros avançados com reabertura em 1 clique e exportação
            programática via PDF e JSON estruturado
          </p>
        </div>

        {/* Split Stage: Approvals UX on Left, M2M on Right */}
        <div
          style={{
            display: "flex",
            gap: 28,
            width: "100%",
            maxWidth: 1280,
          }}
        >
          {/* Card Left: Approvals with Reopen & History */}
          <div
            style={{
              flex: 1,
              transform: `scale(${leftCardSpring})`,
              opacity: leftCardSpring,
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.borderLight}`,
              borderRadius: 22,
              padding: "32px 30px",
              display: "flex",
              flexDirection: "column",
              gap: 20,
              boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
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
                <CheckCircle2 size={22} color={theme.brand} />
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 20,
                    fontWeight: 700,
                    color: theme.white,
                  }}
                >
                  Central de Aprovações
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 999,
                  backgroundColor: "rgba(249, 115, 22, 0.15)",
                  color: theme.brandLight,
                  border: `1px solid ${theme.brand}40`,
                }}
              >
                Aba Histórico Ativa
              </span>
            </div>

            {/* Mock Search Bar & Filters */}
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                backgroundColor: "rgba(0,0,0,0.35)",
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: "10px 14px",
              }}
            >
              <Search size={16} color={theme.textMuted} />
              <span style={{ fontSize: 13, color: theme.white }}>
                Buscar colaborador ou projeto...
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <span
                  style={{
                    fontSize: 11,
                    backgroundColor: theme.bgCardHover,
                    padding: "2px 8px",
                    borderRadius: 6,
                    color: theme.textMuted,
                  }}
                >
                  Filtro: Outubro
                </span>
              </div>
            </div>

            {/* Timesheet Approval Item */}
            <div
              style={{
                backgroundColor: "rgba(255,255,255,0.02)",
                border: `1px solid ${theme.border}`,
                borderRadius: 14,
                padding: "16px 18px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
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
                      fontSize: 16,
                      fontWeight: 700,
                      color: theme.white,
                    }}
                  >
                    Ana Silva • Semana 42
                  </div>
                  <div style={{ fontSize: 13, color: theme.textMuted }}>
                    Total apontado: 40h00 • 3 Projetos
                  </div>
                </div>

                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 999,
                    backgroundColor: isReopened
                      ? `${theme.warning}20`
                      : `${theme.success}20`,
                    color: isReopened ? theme.warning : theme.success,
                    border: `1px solid ${
                      isReopened ? theme.warning : theme.success
                    }40`,
                  }}
                >
                  {isReopened ? "Semana Reaberta" : "Aprovado"}
                </span>
              </div>

              {/* Reopen Action Button */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 4,
                }}
              >
                <button
                  type="button"
                  style={{
                    transform: `scale(${isReopened ? reopenSpring : 1})`,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    borderRadius: 8,
                    backgroundColor: isReopened
                      ? `${theme.warning}25`
                      : "rgba(255,255,255,0.06)",
                    border: `1px solid ${
                      isReopened ? theme.warning : theme.borderLight
                    }`,
                    color: isReopened ? theme.warning : theme.white,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <RotateCcw size={14} />
                  {isReopened
                    ? "Reaberta para Ajuste (Auditada)"
                    : "Reabrir Semana Aprovada"}
                </button>
              </div>
            </div>
          </div>

          {/* Card Right: M2M Endpoints */}
          <div
            style={{
              flex: 1,
              transform: `scale(${rightCardSpring})`,
              opacity: rightCardSpring,
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.azure}40`,
              borderRadius: 22,
              padding: "32px 30px",
              display: "flex",
              flexDirection: "column",
              gap: 20,
              boxShadow: `0 20px 40px rgba(0,0,0,0.35), 0 0 30px ${theme.azureGlow}`,
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
                <Terminal size={22} color={theme.azureLight} />
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 20,
                    fontWeight: 700,
                    color: theme.white,
                  }}
                >
                  Relatórios M2M (API)
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 999,
                  backgroundColor: `${theme.azure}20`,
                  color: theme.azureLight,
                  border: `1px solid ${theme.azure}40`,
                }}
              >
                Autenticação Segura
              </span>
            </div>

            {/* Endpoint Preview */}
            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.4)",
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: "12px 16px",
                fontFamily: fonts.mono,
                fontSize: 13,
                color: theme.azureLight,
              }}
            >
              POST /api/reports/time-entries/export
            </div>

            {/* Formats Grid */}
            <div style={{ display: "flex", gap: 14 }}>
              <div
                style={{
                  flex: 1,
                  padding: "16px",
                  borderRadius: 14,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: `1px solid ${theme.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FileText size={18} color={theme.brand} />
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: theme.white,
                    }}
                  >
                    PDF Corporativo
                  </span>
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  Relatório executivo diagramado e pronto para faturamento
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  padding: "16px",
                  borderRadius: 14,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  border: `1px solid ${theme.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FileSpreadsheet size={18} color={theme.success} />
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: theme.white,
                    }}
                  >
                    JSON Estruturado
                  </span>
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  Payload com tipagem estrita para ingestão direta em ERPs
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: theme.textMuted,
              }}
            >
              <Lock size={15} color={theme.azureLight} />
              <span>
                Token M2M com escopo granular e log de auditoria em cada
                extração
              </span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
