import { Code2, HelpCircle, MessageSquare } from "lucide-react";
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
 * Scene 5 — Microsoft Teams, Onboarding & VS Code Extension (0–330 frames = 11s)
 *
 * Demonstrates:
 * 1. Microsoft Teams chat commands & 08h15 Standup Squad Digest
 * 2. Role-based guided onboarding with spotlight & Help Center
 * 3. Official VS Code / Cursor extension (opt-time-vscode)
 */

export const TeamsAndOnboardingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [305, 330], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const card1Spring = spring({
    frame: frame - 15,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const card2Spring = spring({
    frame: frame - 40,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const card3Spring = spring({
    frame: frame - 65,
    fps,
    config: { damping: 15, stiffness: 120 },
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
      <GlowDot x="15%" y="25%" size={650} opacity={0.14} color={theme.brand} />
      <GlowDot x="85%" y="65%" size={550} opacity={0.12} color={theme.purple} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 80px",
          gap: 32,
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
              <Badge color="#7B83EB">MICROSOFT TEAMS</Badge>
              <Badge color={theme.brand}>ONBOARDING GUIADO</Badge>
              <Badge color={theme.azureLight}>EXTENSÃO VS CODE</Badge>
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
              Integração Total com Seu Fluxo.
              <br />
              <GradientText>
                Onde quer que você esteja trabalhando.
              </GradientText>
            </h1>
          </div>
        </FadeIn>

        {/* 3 Columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 22,
            width: "100%",
            maxWidth: 1240,
          }}
        >
          {/* Item 1: Microsoft Teams Chat & Digest */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: 18,
              padding: "24px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              opacity: card1Spring,
              transform: `translateY(${interpolate(card1Spring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 15px 40px rgba(0,0,0,0.5)",
              minHeight: 330,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
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
              <div
                style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
              >
                Microsoft Teams
              </div>
            </div>

            <div
              style={{
                backgroundColor: theme.bg,
                borderRadius: 12,
                padding: "12px",
                border: `1px solid ${theme.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: "#7B83EB", fontWeight: 600 }}>
                • Standup Squad Digest (08h15)
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontFamily: fonts.mono,
                  color: theme.textMuted,
                  backgroundColor: theme.bgCard,
                  padding: "6px 8px",
                  borderRadius: 6,
                }}
              >
                @OptSolv timer start Harvest | API Auth
              </div>
              <div style={{ fontSize: 11.5, color: theme.textDimmed }}>
                ⏱️ Status Sync: reflete foco em tempo real no Teams via Graph API
              </div>
            </div>

            <div
              style={{
                fontSize: 12,
                color: theme.textDimmed,
                marginTop: "auto",
              }}
            >
              • Outgoing webhook HMAC & mapeamento Entra ID
            </div>
          </div>

          {/* Item 2: Onboarding por Perfil & Ajuda */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: 18,
              padding: "24px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              opacity: card2Spring,
              transform: `translateY(${interpolate(card2Spring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 15px 40px rgba(0,0,0,0.5)",
              minHeight: 330,
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
                <HelpCircle size={20} />
              </div>
              <div
                style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
              >
                Onboarding Guiado
              </div>
            </div>

            <div
              style={{
                backgroundColor: theme.bg,
                borderRadius: 12,
                padding: "12px",
                border: `1px solid ${theme.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{ fontSize: 13, fontWeight: 600, color: theme.white }}
              >
                7 Tours com Spotlight
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                Filtro por perfil (membro / gestor / admin) e persistência no
                PostgreSQL
              </div>
              <div style={{ fontSize: 11.5, color: theme.brandLight }}>
                ✓ Central de Ajuda em /dashboard/onboarding
              </div>
            </div>

            <div
              style={{
                fontSize: 12,
                color: theme.textDimmed,
                marginTop: "auto",
              }}
            >
              • Checklist "Primeiros Passos" baseada em uso real
            </div>
          </div>

          {/* Item 3: Extensão VS Code */}
          <div
            style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: 18,
              padding: "24px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              opacity: card3Spring,
              transform: `translateY(${interpolate(card3Spring, [0, 1], [30, 0])}px)`,
              boxShadow: "0 15px 40px rgba(0,0,0,0.5)",
              minHeight: 330,
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
                <Code2 size={20} />
              </div>
              <div
                style={{ fontSize: 16, fontWeight: 700, color: theme.white }}
              >
                Extensão VS Code
              </div>
            </div>

            <div
              style={{
                backgroundColor: theme.bg,
                borderRadius: 12,
                padding: "12px",
                border: `1px solid ${theme.border}`,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{ fontSize: 13, fontWeight: 600, color: theme.white }}
              >
                opt-time-vscode
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>
                Timer na barra de status com a cor do projeto e total do dia
              </div>
              <div style={{ fontSize: 11.5, color: theme.azureLight }}>
                ✓ Detecção de branch Git (OPT-452) & inatividade
              </div>
            </div>

            <div
              style={{
                fontSize: 12,
                color: theme.textDimmed,
                marginTop: "auto",
              }}
            >
              • Tokens salvos no cofre seguro do SO (SecretStorage)
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
