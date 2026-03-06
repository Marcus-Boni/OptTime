"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef } from "react";
import { ProductDemo } from "../../../remotion/ProductDemo";

export const RemotionPlayerWrapper = forwardRef<PlayerRef>(
  function RemotionPlayerWrapper(_props, ref) {
    return (
      <Player
        ref={ref}
        component={ProductDemo}
        compositionWidth={1920}
        compositionHeight={1080}
        durationInFrames={2700}
        fps={30}
        style={{ width: "100%", height: "100%" }}
        controls={false}
      />
    );
  },
);
