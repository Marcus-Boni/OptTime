import { Fingerprint, Lock, ShieldCheck, UserCheck } from "lucide-react";
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
 * Scene 5 — Guard rails (0–270 frames = 9s)
 *
 * Time entries feed payroll, so the honest pitch has to cover what the agent
 * *cannot* do. Each card states one limit that holds regardless of what the
 * model decides to try.
 */

const rails = [
  {
    icon: Fingerprint,
    title: "Token com escopo",
    detail:
      "Somente leitura, registrar horas ou acesso completo — você escolhe por token.",
    color: theme.brand,
  },
  {
    icon: Lock,
    title: "Semana fechada é intocável",
    detail:
      "Timesheet submetido ou aprovado bloqueia criação, edição e exclusão.",
    color: theme.error,
  },
  {
    icon: UserCheck,
    title: "Escrita pede confirmação",
    detail:
      "Os prompts nativos param e mostram a lista antes de registrar qualquer coisa.",
    color: theme.info,
  },
  {
    icon: ShieldCheck,
    title: "Só o hash é guardado",
    detail: "SHA-256 no banco, revogação imediata e registro de último uso.",
    color: theme.success,
  },
];

export const GuardRailsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [245, 270], [1, 0], {
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
      <GlowDot
        x="50%"
        y="18%"
        size={700}
        opacity={0.12}
        color={theme.success}
      />
      <GlowDot x="15%" y="75%" size={440} opacity={0.08} color={theme.brand} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 110px",
          gap: 36,
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
            <Badge color={theme.success}>LIMITES QUE NÃO CEDEM</Badge>
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
              Horas viram folha de pagamento.{" "}
              <GradientText>Nada é automático demais.</GradientText>
            </h2>
          </div>
        </FadeIn>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 18,
            width: 1120,
          }}
        >
          {rails.map((rail, index) => {
            const cardIn = spring({
              frame: frame - (28 + index * 16),
              fps,
              config: { damping: 16, stiffness: 125 },
            });
            const Icon = rail.icon;

            return (
              <div
                key={rail.title}
                style={{
                  background: theme.bgCard,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 18,
                  padding: "24px 26px",
                  display: "flex",
                  gap: 18,
                  alignItems: "flex-start",
                  transform: `scale(${cardIn})`,
                  opacity: cardIn,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 13,
                    background: `${rail.color}18`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={24} color={rail.color} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: theme.white,
                      fontFamily: fonts.display,
                    }}
                  >
                    {rail.title}
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      color: theme.textMuted,
                      marginTop: 6,
                      lineHeight: 1.5,
                    }}
                  >
                    {rail.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
