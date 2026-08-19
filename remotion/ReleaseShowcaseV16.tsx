import type React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { AiOperatorVoiceScene } from "./scenes/v16/AiOperatorVoiceScene";
import { AutofillRadarScene } from "./scenes/v16/AutofillRadarScene";
import { FocusModeScene } from "./scenes/v16/FocusModeScene";
import { GamificationJourneyScene } from "./scenes/v16/GamificationJourneyScene";
import { SettingsDigestClosingScene } from "./scenes/v16/SettingsDigestClosingScene";
import { SpeedIntroScene } from "./scenes/v16/SpeedIntroScene";

/**
 * OptSolv Time Tracker — v1.6.0 Release Showcase Video
 * Total Duration: 75 seconds @ 30fps = 2250 frames
 * Resolution: 1920x1080
 *
 * Sequence breakdown:
 *   0–300    Speed & Command Palette 2.0 (10s)
 * 300–750    TimeBot 2.0 AI Operator & Voice Commands (15s)
 * 750–1200   Predictive Autofill Radar (Azure DevOps) (15s)
 * 1200–1590  Focus Mode, Pomodoro & Ambient Sounds (13s)
 * 1590–1980  Gamification, "Minha Jornada" & Confetti (13s)
 * 1980–2250  Weekly Digest, Settings & Final v1.6.0 CTA (9s)
 */
export const ReleaseShowcaseV16: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      <Sequence from={0} durationInFrames={300} name="Speed & Command Palette">
        <SpeedIntroScene />
      </Sequence>

      <Sequence from={300} durationInFrames={450} name="AI Operator & Voice">
        <AiOperatorVoiceScene />
      </Sequence>

      <Sequence from={750} durationInFrames={450} name="Autofill Radar">
        <AutofillRadarScene />
      </Sequence>

      <Sequence from={1200} durationInFrames={390} name="Focus Mode & Pomodoro">
        <FocusModeScene />
      </Sequence>

      <Sequence
        from={1590}
        durationInFrames={390}
        name="Minha Jornada & Gamification"
      >
        <GamificationJourneyScene />
      </Sequence>

      <Sequence
        from={1980}
        durationInFrames={270}
        name="Digest, Settings & CTA"
      >
        <SettingsDigestClosingScene />
      </Sequence>
    </AbsoluteFill>
  );
};
