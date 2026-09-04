import type React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { ClosingCtaScene } from "./scenes/v18/ClosingCtaScene";
import { ExecutiveHqScene } from "./scenes/v18/ExecutiveHqScene";
import { PortalAndTeamHoursScene } from "./scenes/v18/PortalAndTeamHoursScene";
import { ProblemScene } from "./scenes/v18/ProblemScene";
import { ReconstructorScene } from "./scenes/v18/ReconstructorScene";
import { TeamsAndOnboardingScene } from "./scenes/v18/TeamsAndOnboardingScene";

/**
 * OptSolv Time Tracker — v1.8.0 Release Showcase Video
 * Total Duration: 70 seconds @ 30fps = 2100 frames
 * Resolution: 1920x1080
 *
 * Narrative progression:
 * Problem → Demo (Reconstructor + Teams) → Executive HQ → Client Portal & Team Hours → Teams/Onboarding/VS Code → Closing CTA
 *
 * Sequence breakdown:
 *    0–270   Problem & Friction: O desafio da gestão e horas (9s)
 *  270–720   Demonstração: Magic Reconstructor & Nudge Teams (15s)
 *  720–1140  Superfície: Executive & Manager HQ (/dashboard/hq) (14s)
 * 1140–1530  Superfície: Live Client Portal & Performance +99.8% (13s)
 * 1530–1860  Integrações: Teams Ecosystem, Onboarding & VS Code (11s)
 * 1860–2100  Governança & CTA Oficial v1.8.0 (8s)
 */
export const ReleaseShowcaseV18: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      <Sequence from={0} durationInFrames={270} name="Problema & Atrito">
        <ProblemScene />
      </Sequence>

      <Sequence
        from={270}
        durationInFrames={450}
        name="Magic Reconstructor & Teams"
      >
        <ReconstructorScene />
      </Sequence>

      <Sequence from={720} durationInFrames={420} name="Executive & Manager HQ">
        <ExecutiveHqScene />
      </Sequence>

      <Sequence
        from={1140}
        durationInFrames={390}
        name="Portal do Cliente & Performance"
      >
        <PortalAndTeamHoursScene />
      </Sequence>

      <Sequence
        from={1530}
        durationInFrames={330}
        name="Teams, Onboarding & VS Code"
      >
        <TeamsAndOnboardingScene />
      </Sequence>

      <Sequence
        from={1860}
        durationInFrames={240}
        name="Governança & CTA v1.8.0"
      >
        <ClosingCtaScene />
      </Sequence>
    </AbsoluteFill>
  );
};
