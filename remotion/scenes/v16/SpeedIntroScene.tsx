import {
  Command,
  Compass,
  FolderKanban,
  HelpCircle,
  Keyboard,
  Play,
  Search,
  Sparkles,
  Timer,
  Trophy,
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

const quickShortcuts = [
  { keys: ["G", "D"], label: "Dashboard", icon: Compass },
  { keys: ["G", "T"], label: "Registrar Tempo", icon: Timer },
  { keys: ["G", "P"], label: "Projetos", icon: FolderKanban },
  { keys: ["G", "J"], label: "Minha Jornada", icon: Trophy },
  { keys: ["?"], label: "Guia de Atalhos", icon: HelpCircle },
];

const paletteResults = [
  {
    icon: Play,
    category: "Ação Rápida",
    title: "Iniciar cronômetro no Projeto Horizon",
    shortcut: "Enter",
  },
  {
    icon: Sparkles,
    category: "Operador IA",
    title: "TimeBot: Preparar e submeter timesheet da semana",
    shortcut: "Tab",
  },
  {
    icon: Trophy,
    category: "Minha Jornada",
    title: "Ver sequência de 5 semanas fechadas (+150 XP)",
    shortcut: "G J",
  },
];

/**
 * Scene 1 — Speed, Global Shortcuts & Command Palette 2.0 (0–300 frames = 10s)
 */
export const SpeedIntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [275, 300], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const paletteScale = spring({
    frame: frame - 25,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.6 },
  });

  const searchProgress = interpolate(frame, [45, 95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const searchText = "iniciar cronometro".slice(
    0,
    Math.floor(searchProgress * "iniciar cronometro".length),
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
      <GlowDot x="50%" y="15%" size={700} opacity={0.15} color={theme.brand} />
      <GlowDot x="20%" y="70%" size={500} opacity={0.08} color={theme.info} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 36,
        }}
      >
        {/* Header */}
        <FadeIn delay={0}>
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              alignItems: "center",
            }}
          >
            <Badge color={theme.brand}>NOVA GERAÇÃO · V1.6.0</Badge>
            <h2
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.02em",
              }}
            >
              Navegue na <GradientText>Velocidade do Pensamento</GradientText>
            </h2>
            <p
              style={{
                fontSize: 20,
                color: theme.textMuted,
                margin: 0,
                maxWidth: 800,
              }}
            >
              Atalhos globais em duas etapas, Command Palette 2.0 e navegação
              ultra-fluida sem tirar as mãos do teclado.
            </p>
          </div>
        </FadeIn>

        {/* Command Palette Mockup */}
        <div
          style={{
            transform: `scale(${paletteScale})`,
            opacity: paletteScale,
            width: 820,
            background: "#141414",
            borderRadius: 18,
            border: `1px solid ${theme.borderLight}`,
            boxShadow: `0 30px 80px rgba(0,0,0,0.8), 0 0 0 1px ${theme.border}`,
            overflow: "hidden",
          }}
        >
          {/* Search bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "18px 24px",
              borderBottom: `1px solid ${theme.border}`,
              background: "#181818",
            }}
          >
            <Search size={22} color={theme.brand} />
            <span
              style={{
                fontSize: 18,
                color: searchText ? theme.white : theme.textDimmed,
                fontFamily: fonts.body,
                flex: 1,
              }}
            >
              {searchText || "Digite um comando, projeto ou atalho..."}
              {frame > 30 && frame % 16 < 8 && (
                <span style={{ color: theme.brand, fontWeight: 300 }}>|</span>
              )}
            </span>
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                background: "#262626",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 12,
                color: theme.textMuted,
                fontFamily: fonts.mono,
              }}
            >
              <Command size={12} />
              <span>K</span>
            </div>
          </div>

          {/* Results list */}
          <div
            style={{
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {paletteResults.map((item, idx) => {
              const isSelected = idx === 0 && frame > 60;
              return (
                <div
                  key={item.title}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    borderRadius: 12,
                    background: isSelected
                      ? "rgba(249, 115, 22, 0.12)"
                      : "transparent",
                    border: isSelected
                      ? `1px solid rgba(249, 115, 22, 0.35)`
                      : "1px solid transparent",
                    transition: "all 0.15s ease",
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
                        background: isSelected ? theme.brand : "#222",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <item.icon
                        size={18}
                        color={isSelected ? "#fff" : theme.textMuted}
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: theme.brand,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {item.category}
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 500,
                          color: isSelected ? theme.white : "#d4d4d4",
                          fontFamily: fonts.body,
                        }}
                      >
                        {item.title}
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: fonts.mono,
                      color: isSelected ? theme.brandLight : theme.textDimmed,
                      background: "#1e1e1e",
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    {item.shortcut}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Global shortcuts bottom badges */}
        <FadeIn delay={70}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                color: theme.textDimmed,
                fontFamily: fonts.body,
              }}
            >
              <Keyboard size={16} color={theme.brand} />
              <span>Atalhos rápidos:</span>
            </div>
            {quickShortcuts.map((s) => (
              <div
                key={s.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#171717",
                  border: `1px solid ${theme.border}`,
                  padding: "6px 14px",
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", gap: 4 }}>
                  {s.keys.map((k) => (
                    <span
                      key={k}
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 12,
                        fontWeight: 700,
                        color: theme.brandLight,
                        background: "#262626",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 13, color: "#ccc", fontWeight: 500 }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </AbsoluteFill>
  );
};
