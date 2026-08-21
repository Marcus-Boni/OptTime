import { Check, Loader2, Sparkles, Wrench } from "lucide-react";
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
} from "../../components/shared";
import { fonts, theme } from "../../theme";

/**
 * Scene 2 — The conversation (0–480 frames = 16s)
 *
 * The heart of the release: what the feature actually feels like. The user
 * message types itself out, the tool call resolves, and the agent answers with
 * the running total — the detail that makes it feel like a real integration
 * rather than a chat gimmick.
 */

const USER_MESSAGE =
  "Terminei a API de webhooks e escrevi os testes. Registra 2h30 no Harvest, task #890.";

const TYPE_START = 30;
const TYPE_END = 150;
const TOOL_CALL_AT = 170;
const TOOL_DONE_AT = 225;
const REPLY_AT = 245;

export const ConversationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(frame, [455, 480], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const typedChars = Math.floor(
    interpolate(frame, [TYPE_START, TYPE_END], [0, USER_MESSAGE.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const typedText = USER_MESSAGE.slice(0, typedChars);
  const isTyping = frame >= TYPE_START && frame < TYPE_END;

  const panelSpring = spring({
    frame: frame - 8,
    fps,
    config: { damping: 16, stiffness: 110, mass: 0.7 },
  });

  const toolSpring = spring({
    frame: frame - TOOL_CALL_AT,
    fps,
    config: { damping: 15, stiffness: 130 },
  });
  const toolResolved = frame >= TOOL_DONE_AT;

  const replySpring = spring({
    frame: frame - REPLY_AT,
    fps,
    config: { damping: 15, stiffness: 110 },
  });

  const footnoteOpacity = interpolate(frame, [330, 352], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Caret blinks at ~2Hz while the message is being typed.
  const caretOn = Math.floor(frame / 8) % 2 === 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        fontFamily: fonts.body,
        overflow: "hidden",
        opacity: fadeOut,
      }}
    >
      <GlowDot x="62%" y="18%" size={700} opacity={0.15} color={theme.brand} />
      <GlowDot x="10%" y="68%" size={520} opacity={0.1} color={theme.info} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "0 100px",
          gap: 34,
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
            <Badge color={theme.brand}>SERVIDOR MCP</Badge>
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
              Seu agente <GradientText>aponta as horas</GradientText> por você
            </h2>
          </div>
        </FadeIn>

        {/* Chat panel */}
        <div
          style={{
            width: 1120,
            background: "#111114",
            border: `1px solid ${theme.borderLight}`,
            borderRadius: 24,
            padding: 30,
            display: "flex",
            flexDirection: "column",
            gap: 18,
            transform: `scale(${panelSpring})`,
            opacity: panelSpring,
            boxShadow: `0 40px 110px ${theme.brandGlow}`,
            minHeight: 430,
          }}
        >
          {/* Editor tab strip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingBottom: 16,
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <Sparkles size={19} color={theme.brand} />
            <span
              style={{
                fontSize: 17,
                color: theme.textMuted,
                fontFamily: fonts.mono,
              }}
            >
              Cursor · opt-time conectado
            </span>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 15,
                color: theme.success,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: theme.success,
                  boxShadow: `0 0 10px ${theme.success}`,
                }}
              />
              16 ferramentas
            </div>
          </div>

          {/* User message */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div
              style={{
                maxWidth: "80%",
                background: `${theme.brand}18`,
                border: `1px solid ${theme.brand}35`,
                borderRadius: "18px 18px 4px 18px",
                padding: "16px 22px",
                fontSize: 22,
                color: theme.white,
                lineHeight: 1.5,
                minHeight: 30,
              }}
            >
              {typedText}
              {isTyping && caretOn ? (
                <span style={{ color: theme.brand }}>▌</span>
              ) : null}
            </div>
          </div>

          {/* Tool call */}
          {frame >= TOOL_CALL_AT ? (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-start",
                transform: `scale(${toolSpring})`,
                opacity: toolSpring,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: theme.bgCard,
                  border: `1px solid ${toolResolved ? `${theme.success}45` : theme.border}`,
                  borderRadius: 14,
                  padding: "13px 20px",
                  fontFamily: fonts.mono,
                  fontSize: 18,
                }}
              >
                {toolResolved ? (
                  <Check size={20} color={theme.success} />
                ) : (
                  <Loader2
                    size={20}
                    color={theme.brand}
                    style={{ transform: `rotate(${frame * 9}deg)` }}
                  />
                )}
                <Wrench size={17} color={theme.textDimmed} />
                <span style={{ color: theme.white }}>opt_time_log_time</span>
                <span style={{ color: theme.textDimmed }}>
                  projectId: "Harvest" · durationMinutes: 150 · workItem: #890
                </span>
              </div>
            </div>
          ) : null}

          {/* Agent reply */}
          {frame >= REPLY_AT ? (
            <div
              style={{
                display: "flex",
                gap: 14,
                transform: `translateY(${(1 - replySpring) * 16}px)`,
                opacity: replySpring,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `${theme.brand}1a`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <OptSolvLogo size={17} color={theme.brand} />
              </div>
              <div
                style={{
                  background: theme.bgCard,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "18px 18px 18px 4px",
                  padding: "18px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div
                  style={{ fontSize: 23, color: theme.white, lineHeight: 1.45 }}
                >
                  ✅ <strong>2h30</strong> registradas em{" "}
                  <span style={{ color: theme.brandLight }}>
                    Harvest (OPT-014)
                  </span>
                  , Work Item #890.
                </div>
                <div style={{ fontSize: 21, color: theme.textMuted }}>
                  Total acumulado hoje:{" "}
                  <span
                    style={{ color: theme.success, fontFamily: fonts.mono }}
                  >
                    7h30
                  </span>{" "}
                  de 8h.
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footnote — always mounted so its arrival does not re-centre the
            stack above it; only the opacity animates. */}
        <p
          style={{
            fontSize: 20,
            color: theme.textDimmed,
            margin: 0,
            textAlign: "center",
            opacity: footnoteOpacity,
          }}
        >
          As horas caem no projeto certo e sincronizam o{" "}
          <span style={{ color: theme.azureLight }}>Completed Work</span> do
          Azure DevOps.
        </p>
      </div>
    </AbsoluteFill>
  );
};
