import {
  CheckCircle2,
  Database,
  Laptop,
  Lock,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
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
import { Badge, GlowDot, GradientText } from "@/remotion/components/shared";
import { fonts, theme } from "@/remotion/theme";

/**
 * Scene 3 — Nuvem PostgreSQL & Sincronização Cross-Device (0–420 frames = 14s)
 *
 * Demonstrates:
 * 1. Cloud-backed TimeBot threads persisted in PostgreSQL (`timebot_thread` table).
 * 2. Instant two-tier loading: 0ms from local cache + background PostgreSQL sync.
 * 3. Cross-device plan replay guard: authorized actions are marked executed globally.
 */

export const CrossDeviceSyncScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [395, 420], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const headerSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const dbSpring = spring({
    frame: frame - 25,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const devicesSpring = spring({
    frame: frame - 45,
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
      <GlowDot x="50%" y="35%" size={750} opacity={0.18} color={theme.azure} />
      <GlowDot x="15%" y="70%" size={500} opacity={0.1} color={theme.brand} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 90px",
          gap: 32,
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
            <Badge color={theme.azure}>Persistência PostgreSQL</Badge>
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
              <ShieldCheck size={16} /> Isolamento por Usuário & Cache 0ms
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
            Continuidade Absoluta:{" "}
            <GradientText>Seus Aparelhos Sincronizados</GradientText>
          </h2>

          <p
            style={{
              fontSize: 20,
              color: theme.textMuted,
              maxWidth: 960,
              lineHeight: 1.45,
            }}
          >
            Histórico completo do TimeBot salvo no PostgreSQL e proteção
            cross-device contra duplicação de planos
          </p>
        </div>

        {/* Central Cloud DB Node */}
        <div
          style={{
            transform: `scale(${dbSpring})`,
            opacity: dbSpring,
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "16px 36px",
            backgroundColor: `${theme.azure}15`,
            border: `1px solid ${theme.azure}50`,
            borderRadius: 999,
            boxShadow: `0 0 40px ${theme.azureGlow}`,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              backgroundColor: theme.azure,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Database size={20} color={theme.white} />
          </div>

          <div style={{ textAlign: "left" }}>
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 16,
                fontWeight: 700,
                color: theme.white,
              }}
            >
              PostgreSQL • public.timebot_thread
            </div>
            <div style={{ fontSize: 13, color: theme.azureLight }}>
              Armazenamento seguro, chaves de ação liquidadas & sync em tempo
              real
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 12px",
              borderRadius: 999,
              backgroundColor: "rgba(34, 197, 94, 0.15)",
              border: `1px solid ${theme.success}50`,
              color: theme.success,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: theme.success,
              }}
            />
            Online & Ativo
          </div>
        </div>

        {/* 3 Synchronized Device Cards */}
        <div
          style={{
            transform: `scale(${devicesSpring})`,
            opacity: devicesSpring,
            display: "flex",
            gap: 24,
            width: "100%",
            maxWidth: 1280,
          }}
        >
          {/* Device 1: Desktop */}
          <div
            style={{
              flex: 1,
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.borderLight}`,
              borderRadius: 20,
              padding: "28px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
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
                <Monitor size={22} color={theme.brand} />
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 18,
                    fontWeight: 700,
                    color: theme.white,
                  }}
                >
                  Desktop Escritório
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  fontFamily: fonts.mono,
                }}
              >
                Chrome
              </span>
            </div>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.03)",
                border: `1px solid ${theme.border}`,
                fontSize: 14,
                color: theme.white,
              }}
            >
              <span style={{ color: theme.brandLight, fontWeight: 600 }}>
                Voz Captada:
              </span>{" "}
              &quot;Lancei 2h no projeto @OptSolv Mobile...&quot;
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: theme.success,
              }}
            >
              <CheckCircle2 size={16} /> Gravado e persistido no banco
            </div>
          </div>

          {/* Device 2: Laptop */}
          <div
            style={{
              flex: 1,
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.azure}40`,
              borderRadius: 20,
              padding: "28px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
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
                <Laptop size={22} color={theme.azureLight} />
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 18,
                    fontWeight: 700,
                    color: theme.white,
                  }}
                >
                  Laptop Home Office
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  fontFamily: fonts.mono,
                }}
              >
                Edge / PWA
              </span>
            </div>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.03)",
                border: `1px solid ${theme.border}`,
                fontSize: 14,
                color: theme.white,
              }}
            >
              <span style={{ color: theme.azureLight, fontWeight: 600 }}>
                Carregamento 0ms:
              </span>{" "}
              Cache instantâneo + atualização em background.
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: theme.azureLight,
              }}
            >
              <RefreshCw
                size={16}
                style={{ transform: `rotate(${frame * 4}deg)` }}
              />{" "}
              Sincronizado via nuvem
            </div>
          </div>

          {/* Device 3: Smartphone */}
          <div
            style={{
              flex: 1,
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.borderLight}`,
              borderRadius: 20,
              padding: "28px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 16,
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
                <Smartphone size={22} color={theme.purple} />
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontSize: 18,
                    fontWeight: 700,
                    color: theme.white,
                  }}
                >
                  Smartphone Mobile
                </span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  fontFamily: fonts.mono,
                }}
              >
                Mobile Safari
              </span>
            </div>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.03)",
                border: `1px solid ${theme.border}`,
                fontSize: 14,
                color: theme.white,
              }}
            >
              <span style={{ color: theme.purple, fontWeight: 600 }}>
                Imunidade a Replay:
              </span>{" "}
              Card de plano já liquidado. Zero risco de duplicidade.
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: theme.success,
              }}
            >
              <Lock size={16} /> Ação protegida contra re-execução
            </div>
          </div>
        </div>

        {/* Feature Highlights Footer */}
        <div
          style={{
            display: "flex",
            gap: 36,
            alignItems: "center",
            fontSize: 15,
            color: theme.textMuted,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={18} color={theme.brand} />
            <span>Transição imperceptível de contexto entre aparelhos</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Database size={18} color={theme.azureLight} />
            <span>Migração automática de conversas locais legadas</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldCheck size={18} color={theme.success} />
            <span>Isolamento total e criptografia em repouso</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
