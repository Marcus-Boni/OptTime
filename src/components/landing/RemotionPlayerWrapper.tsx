"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef } from "react";
import { ProductDemo } from "@/remotion/ProductDemo";
import { ReleaseShowcaseV16 } from "@/remotion/ReleaseShowcaseV16";
import { ReleaseShowcaseV17 } from "@/remotion/ReleaseShowcaseV17";
import { ReleaseShowcaseV18 } from "@/remotion/ReleaseShowcaseV18";

export type ShowcaseComposition = "demo" | "v18" | "v17" | "v16";

export interface RemotionPlayerWrapperProps {
  composition?: ShowcaseComposition;
}

const COMPOSITION_CONFIG: Record<
  ShowcaseComposition,
  {
    component: React.FC;
    durationInFrames: number;
  }
> = {
  demo: {
    component: ProductDemo,
    durationInFrames: 2700, // 90s @ 30fps
  },
  v18: {
    component: ReleaseShowcaseV18,
    durationInFrames: 2100, // 70s @ 30fps
  },
  v17: {
    component: ReleaseShowcaseV17,
    durationInFrames: 2100, // 70s @ 30fps
  },
  v16: {
    component: ReleaseShowcaseV16,
    durationInFrames: 2250, // 75s @ 30fps
  },
};

export const RemotionPlayerWrapper = forwardRef<
  PlayerRef,
  RemotionPlayerWrapperProps
>(function RemotionPlayerWrapper({ composition = "demo" }, ref) {
  const config = COMPOSITION_CONFIG[composition] ?? COMPOSITION_CONFIG.demo;

  return (
    <Player
      key={composition}
      ref={ref}
      component={config.component}
      compositionWidth={1920}
      compositionHeight={1080}
      durationInFrames={config.durationInFrames}
      fps={30}
      style={{ width: "100%", height: "100%" }}
      controls={false}
    />
  );
});
