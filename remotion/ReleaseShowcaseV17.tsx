import type React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { ClosingCtaScene } from "./scenes/v17/ClosingCtaScene";
import { ContextSwitchScene } from "./scenes/v17/ContextSwitchScene";
import { ConversationScene } from "./scenes/v17/ConversationScene";
import { GuardRailsScene } from "./scenes/v17/GuardRailsScene";
import { SetupScene } from "./scenes/v17/SetupScene";
import { ToolCatalogScene } from "./scenes/v17/ToolCatalogScene";

/**
 * OptSolv Time Tracker — v1.7.0 Release Showcase Video
 * Total Duration: 70 seconds @ 30fps = 2100 frames
 * Resolution: 1920x1080
 *
 * The narrative goes problem → demo → surface → setup → limits → CTA, so the
 * payoff lands before any explanation: by frame 780 the viewer has already seen
 * a time entry created from a sentence.
 *
 * Sequence breakdown:
 *    0–300   Context switching is the real cost (10s)
 *  300–780   The conversation that replaces it (16s)
 *  780–1200  16 tools, 4 resources, 3 prompts (14s)
 * 1200–1620  Setup in under two minutes (14s)
 * 1620–1890  Guard rails that hold (9s)
 * 1890–2100  v1.7.0 closing CTA (7s)
 */
export const ReleaseShowcaseV17: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      <Sequence from={0} durationInFrames={300} name="Troca de contexto">
        <ContextSwitchScene />
      </Sequence>

      <Sequence from={300} durationInFrames={480} name="A conversa">
        <ConversationScene />
      </Sequence>

      <Sequence
        from={780}
        durationInFrames={420}
        name="Catálogo de ferramentas"
      >
        <ToolCatalogScene />
      </Sequence>

      <Sequence from={1200} durationInFrames={420} name="Configuração">
        <SetupScene />
      </Sequence>

      <Sequence from={1620} durationInFrames={270} name="Limites e segurança">
        <GuardRailsScene />
      </Sequence>

      <Sequence from={1890} durationInFrames={210} name="CTA v1.7.0">
        <ClosingCtaScene />
      </Sequence>
    </AbsoluteFill>
  );
};
