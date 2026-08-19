"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef } from "react";
import { ProductDemo } from "@/remotion/ProductDemo";
import { ReleaseShowcaseV16 } from "@/remotion/ReleaseShowcaseV16";

export interface RemotionPlayerWrapperProps {
  composition?: "demo" | "v16";
}

export const RemotionPlayerWrapper = forwardRef<
  PlayerRef,
  RemotionPlayerWrapperProps
>(function RemotionPlayerWrapper({ composition = "v16" }, ref) {
  const isV16 = composition === "v16";

  return (
    <Player
      ref={ref}
      component={isV16 ? ReleaseShowcaseV16 : ProductDemo}
      compositionWidth={1920}
      compositionHeight={1080}
      durationInFrames={isV16 ? 2250 : 2700}
      fps={30}
      style={{ width: "100%", height: "100%" }}
      controls={false}
    />
  );
});
