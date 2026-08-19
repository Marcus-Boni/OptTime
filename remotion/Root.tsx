import { Composition, Folder } from "remotion";
import { ProductDemo } from "./ProductDemo";
import { ReleaseShowcaseV16 } from "./ReleaseShowcaseV16";

/**
 * Remotion Root with both original ProductDemo and the new ReleaseShowcaseV16.
 */
export const RemotionRoot = () => {
  return (
    <Folder name="OptSolv-Showcases">
      {/* Original Product Demo — 90s = 2700 frames @ 30fps */}
      <Composition
        id="ProductDemo"
        component={ProductDemo}
        durationInFrames={2700}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* New v1.6.0 Release Showcase — 75s = 2250 frames @ 30fps */}
      <Composition
        id="ReleaseShowcaseV16"
        component={ReleaseShowcaseV16}
        durationInFrames={2250}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
  );
};
