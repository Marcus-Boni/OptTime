import { KeyRound, MessageSquare, Plug, Terminal } from "lucide-react";
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
 * Scene 4 — Setup in two minutes (0–420 frames = 14s)
 *
 * The adoption question is "how much work is this to turn on?", so the scene
 * answers it literally: three steps, then the exact JSON that gets pasted.
 */

const steps = [
  {
    icon: KeyRound,
    title: "Gere um token",
    detail: "Escolha o nível de permissão",
  },
  {
    icon: Plug,
    title: "Escolha o cliente",
    detail: "Cinco clientes suportados",
  },
  {
    icon: MessageSquare,
    title: "Cole e converse",
    detail: "O token já vem preenchido",
  },
];

const CONFIG_JSON = `{
  "mcpServers": {
    "opt-time": {
      "url": "https://opt-time.optsolv.com.br/api/mcp",
      "headers": { "Authorization": "Bearer opt_tok_…" }
    }
  }
}`;

const clients = [
  "Cursor",
  "Claude Code",
  "Claude Desktop",
  "VS Code",
  "Windsurf",
];

export const SetupScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [395, 420], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const npxOpacity = interpolate(frame, [285, 307], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const codeSpring = spring({
    frame: frame - 150,
    fps,
    config: { damping: 16, stiffness: 110 },
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
      <GlowDot x="18%" y="20%" size={640} opacity={0.12} color={theme.brand} />
      <GlowDot x="80%" y="70%" size={520} opacity={0.1} color={theme.success} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 32,
        }}
      >
        <FadeIn delay={0}>
          <div
            style={{
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
            }}
          >
            <Badge color={theme.success}>CONFIGURAÇÃO</Badge>
            <h2
              style={{
                fontSize: 46,
                fontWeight: 700,
                color: theme.white,
                margin: 0,
                fontFamily: fonts.display,
                letterSpacing: "-0.02em",
              }}
            >
              Ligado em <GradientText>menos de 2 minutos</GradientText>
            </h2>
          </div>
        </FadeIn>

        {/* Three steps */}
        <div style={{ display: "flex", gap: 20, alignItems: "stretch" }}>
          {steps.map((step, index) => {
            const stepIn = spring({
              frame: frame - (30 + index * 22),
              fps,
              config: { damping: 16, stiffness: 125 },
            });
            const Icon = step.icon;

            return (
              <div
                key={step.title}
                style={{
                  width: 330,
                  minHeight: 96,
                  background: theme.bgCard,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 18,
                  padding: "22px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  transform: `scale(${stepIn})`,
                  opacity: stepIn,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: `${theme.brand}18`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={23} color={theme.brand} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: theme.white,
                      fontFamily: fonts.display,
                    }}
                  >
                    {step.title}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      color: theme.textMuted,
                      marginTop: 3,
                    }}
                  >
                    {step.detail}
                  </div>
                </div>
                <span
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 18,
                    fontSize: 34,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.06)",
                    fontFamily: fonts.display,
                  }}
                >
                  {index + 1}
                </span>
              </div>
            );
          })}
        </div>

        {/* Config snippet */}
        <div
          style={{
            transform: `scale(${codeSpring})`,
            opacity: codeSpring,
            display: "flex",
            gap: 22,
            alignItems: "stretch",
          }}
        >
          <pre
            style={{
              margin: 0,
              background: "#0d0d10",
              border: `1px solid ${theme.borderLight}`,
              borderRadius: 16,
              padding: "22px 28px",
              fontFamily: fonts.mono,
              fontSize: 18,
              lineHeight: 1.6,
              color: theme.textMuted,
              whiteSpace: "pre",
            }}
          >
            {CONFIG_JSON}
          </pre>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: 15,
                color: theme.textDimmed,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Funciona em
            </div>
            {clients.map((name, index) => {
              const rowIn = interpolate(
                frame,
                [175 + index * 9, 195 + index * 9],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );

              return (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity: rowIn,
                    transform: `translateX(${(1 - rowIn) * 14}px)`,
                    fontSize: 19,
                    color: theme.white,
                  }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: theme.success,
                    }}
                  />
                  {name}
                </div>
              );
            })}
          </div>
        </div>

        {/* npx fallback — always mounted so the stack above does not
            re-centre when it appears. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: 999,
            padding: "12px 26px",
            opacity: npxOpacity,
          }}
        >
          <Terminal size={19} color={theme.textDimmed} />
          <span style={{ fontSize: 18, color: theme.textMuted }}>
            Cliente só fala stdio? Então:
          </span>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 19,
              color: theme.brandLight,
            }}
          >
            npx opt-time-mcp
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
