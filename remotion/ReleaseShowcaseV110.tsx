import type React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { CapacityAndAiChainScene } from "./scenes/v110/CapacityAndAiChainScene";
import { ClosingCtaScene } from "./scenes/v110/ClosingCtaScene";
import { ProblemScene } from "./scenes/v110/ProblemScene";
import { ProjectPhasesScene } from "./scenes/v110/ProjectPhasesScene";
import { TeamsBotScene } from "./scenes/v110/TeamsBotScene";
import { TeamsNudgeScene } from "./scenes/v110/TeamsNudgeScene";
import { theme } from "./theme";

/**
 * OptSolv Time Tracker — v1.10.0 Release Showcase Video
 * Total Duration: 70 seconds @ 30fps = 2100 frames
 * Resolution: 1920x1080
 *
 * Narrative progression:
 * Problem → Demo (OptTime in Teams Channels) → Teams Nudges & Call Records
 * → Project Phases (Azure DevOps) → Flexible Capacity & AI Chain → Closing CTA
 *
 * Sequence breakdown:
 *    0–270   Problem & Friction: O Atrito do Apontamento Tradicional (9s)
 *  270–720   Demonstração: OptTime no Microsoft Teams em Qualquer Canal (15s)
 *  720–1140  Superfície: Lembretes Pós-Reunião & Vespertino Proativo (14s)
 * 1140–1530  Superfície: Fases de Projeto no Azure DevOps com Chaves Segregadas (13s)
 * 1530–1860  Superfície: Jornadas Sob Medida & Resiliência de IA com NVIDIA NIM (11s)
 * 1860–2100  Governança & CTA Oficial v1.10.0 (8s)
 */
export const ReleaseShowcaseV110: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <Sequence
        from={0}
        durationInFrames={270}
        name="Problema & Atrito de Contexto"
      >
        <ProblemScene />
      </Sequence>

      <Sequence
        from={270}
        durationInFrames={450}
        name="OptTime no Teams em Qualquer Canal"
      >
        <TeamsBotScene />
      </Sequence>

      <Sequence
        from={720}
        durationInFrames={420}
        name="Lembretes Pós-Reunião & Vespertino"
      >
        <TeamsNudgeScene />
      </Sequence>

      <Sequence
        from={1140}
        durationInFrames={390}
        name="Fases de Projeto no Azure DevOps"
      >
        <ProjectPhasesScene />
      </Sequence>

      <Sequence
        from={1530}
        durationInFrames={330}
        name="Capacidade & Cadeia de IA"
      >
        <CapacityAndAiChainScene />
      </Sequence>

      <Sequence
        from={1860}
        durationInFrames={240}
        name="Governança & CTA Oficial v1.10.0"
      >
        <ClosingCtaScene />
      </Sequence>
    </AbsoluteFill>
  );
};
