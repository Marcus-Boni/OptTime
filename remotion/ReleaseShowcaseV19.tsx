import type React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { ClientPortalPresentationScene } from "./scenes/v19/ClientPortalPresentationScene";
import { ClosingCtaScene } from "./scenes/v19/ClosingCtaScene";
import { ManagementHqScene } from "./scenes/v19/ManagementHqScene";
import { MyTimeScene } from "./scenes/v19/MyTimeScene";
import { ProblemScene } from "./scenes/v19/ProblemScene";
import { ReconstructionScene } from "./scenes/v19/ReconstructionScene";
import { theme } from "./theme";

/**
 * OptSolv Time Tracker — v1.9.0 Release Showcase Video
 * Total Duration: 70 seconds @ 30fps = 2100 frames
 * Resolution: 1920x1080
 *
 * Narrative progression:
 * Problem → Demo (M365 Reconstructor & Teams Calls) → My Time (/dashboard/my-time)
 * → Management HQ (/dashboard/hq) → Client Portal Presentation (/portal/[token]) → Closing CTA
 *
 * Sequence breakdown:
 *    0–270   Problem & Friction: O Trabalho Invisível (9s)
 *  270–720   Demonstração: Reconstrução com M365 & Chamadas Teams (15s)
 *  720–1140  Superfície: Meu Tempo & Assistente do Período (14s)
 * 1140–1530  Superfície: Central de Gestão & Decisões Acionáveis (13s)
 * 1530–1860  Superfície: Portal do Cliente & Modo Apresentação (11s)
 * 1860–2100  Governança & CTA Oficial v1.9.0 (8s)
 */
export const ReleaseShowcaseV19: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <Sequence
        from={0}
        durationInFrames={270}
        name="Problema & Trabalho Invisível"
      >
        <ProblemScene />
      </Sequence>

      <Sequence
        from={270}
        durationInFrames={450}
        name="Reconstrução M365 & Chamadas Teams"
      >
        <ReconstructionScene />
      </Sequence>

      <Sequence from={720} durationInFrames={420} name="Meu Tempo & Assistente">
        <MyTimeScene />
      </Sequence>

      <Sequence
        from={1140}
        durationInFrames={390}
        name="Central de Gestão & Decisões Acionáveis"
      >
        <ManagementHqScene />
      </Sequence>

      <Sequence
        from={1530}
        durationInFrames={330}
        name="Portal do Cliente & Modo Apresentação"
      >
        <ClientPortalPresentationScene />
      </Sequence>

      <Sequence
        from={1860}
        durationInFrames={240}
        name="Governança & CTA Oficial v1.9.0"
      >
        <ClosingCtaScene />
      </Sequence>
    </AbsoluteFill>
  );
};
