import { Composition } from "remotion";
import { ProductDemo } from "./ProductDemo";

/**
 * 90-second product demo video for OptSolv Time Tracker.
 * 1920x1080 @ 30fps — total ~90s = 2700 frames
 */
export const RemotionRoot = () => {
  return (
    <Composition
      id="ProductDemo"
      component={ProductDemo}
      durationInFrames={2700}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
