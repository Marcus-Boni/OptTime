import type React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { ApprovalsAndReportsScene } from "./scenes/v112/ApprovalsAndReportsScene";
import { ClosingCtaScene } from "./scenes/v112/ClosingCtaScene";
import { CrossDeviceSyncScene } from "./scenes/v112/CrossDeviceSyncScene";
import { HolidayCalendarScene } from "./scenes/v112/HolidayCalendarScene";
import { ProblemScene } from "./scenes/v112/ProblemScene";
import { TimeBotVoiceScene } from "./scenes/v112/TimeBotVoiceScene";
import { theme } from "./theme";

/**
 * OptSolv Time Tracker — v1.12.0 Release Showcase Video
 * Total Duration: 70 seconds @ 30fps = 2100 frames
 * Resolution: 1920x1080
 *
 * Narrative progression:
 * Problem → Demo (TimeBot Voice & Symmetrical Spectrum) → Cross-Device Cloud Sync
 * → Intelligent Holiday Calendar → Flexible Approvals & M2M Reports → Closing CTA
 *
 * Sequence breakdown:
 *    0–270   Problem & Friction: O Atrito do Apontamento Sem Voz e Contexto Disperso (9s)
 *  270–720   Demonstração: Espectro Vocal 44 Barras, Silêncio VAD & Aprovação de Plano (15s)
 *  720–1140  Superfície: Nuvem PostgreSQL, Cache 0ms & Proteção Cross-Device (14s)
 * 1140–1530  Superfície: Calendário Corporativo BrasilAPI & Ajuste de Metas (13s)
 * 1530–1860  Superfície: Central de Aprovações, Histórico & Relatórios M2M (11s)
 * 1860–2100  Governança & CTA Oficial v1.12.0 (8s)
 */
export const ReleaseShowcaseV112: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <Sequence
        from={0}
        durationInFrames={270}
        name="Problema & Atrito de Voz e Contexto"
      >
        <ProblemScene />
      </Sequence>

      <Sequence
        from={270}
        durationInFrames={450}
        name="Espectro Vocal em Tempo Real & TimeBot"
      >
        <TimeBotVoiceScene />
      </Sequence>

      <Sequence
        from={720}
        durationInFrames={420}
        name="Nuvem PostgreSQL & Sync Cross-Device"
      >
        <CrossDeviceSyncScene />
      </Sequence>

      <Sequence
        from={1140}
        durationInFrames={390}
        name="Calendário de Feriados & Capacidade"
      >
        <HolidayCalendarScene />
      </Sequence>

      <Sequence
        from={1530}
        durationInFrames={330}
        name="Aprovações Ágeis & Relatórios M2M"
      >
        <ApprovalsAndReportsScene />
      </Sequence>

      <Sequence
        from={1860}
        durationInFrames={240}
        name="Governança & CTA Oficial v1.12.0"
      >
        <ClosingCtaScene />
      </Sequence>
    </AbsoluteFill>
  );
};
