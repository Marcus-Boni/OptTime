import { AbsoluteFill, Sequence } from "remotion";
import { AzureDevOpsScene } from "./scenes/AzureDevOpsScene";
import { CtaScene } from "./scenes/CtaScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { IntroScene } from "./scenes/IntroScene";
import { ManualEntryScene } from "./scenes/ManualEntryScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { ReportsScene } from "./scenes/ReportsScene";
import { TimerScene } from "./scenes/TimerScene";
import { TimesheetScene } from "./scenes/TimesheetScene";

/**
 * Main product demo composition — ~90 seconds total @ 30fps = 2700 frames.
 *
 * Scene breakdown (frames @ 30fps):
 *   0–150    Intro (5s)
 * 150–450    Problem (10s)
 * 450–900    Timer demo (15s)
 * 900–1200   Manual entry (10s)
 * 1200–1560  Timesheet approval (12s)
 * 1560–1860  Azure DevOps integration (10s)
 * 1860–2160  Reports & Export (10s)
 * 2160–2460  Dashboard overview (10s)
 * 2460–2700  CTA / Closing (8s)
 */
export const ProductDemo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      <Sequence from={0} durationInFrames={150} name="Intro">
        <IntroScene />
      </Sequence>

      <Sequence from={150} durationInFrames={300} name="Problem">
        <ProblemScene />
      </Sequence>

      <Sequence from={450} durationInFrames={450} name="Timer">
        <TimerScene />
      </Sequence>

      <Sequence from={900} durationInFrames={300} name="Manual Entry">
        <ManualEntryScene />
      </Sequence>

      <Sequence from={1200} durationInFrames={360} name="Timesheet Approval">
        <TimesheetScene />
      </Sequence>

      <Sequence from={1560} durationInFrames={300} name="Azure DevOps">
        <AzureDevOpsScene />
      </Sequence>

      <Sequence from={1860} durationInFrames={300} name="Reports">
        <ReportsScene />
      </Sequence>

      <Sequence from={2160} durationInFrames={300} name="Dashboard">
        <DashboardScene />
      </Sequence>

      <Sequence from={2460} durationInFrames={240} name="CTA">
        <CtaScene />
      </Sequence>
    </AbsoluteFill>
  );
};
