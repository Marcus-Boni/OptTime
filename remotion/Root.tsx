import { Composition, Folder } from "remotion";
import { ProductDemo } from "./ProductDemo";
import { ReleaseShowcaseV16 } from "./ReleaseShowcaseV16";
import { ReleaseShowcaseV17 } from "./ReleaseShowcaseV17";

/**
 * Remotion Root: the evergreen ProductDemo plus one showcase per release.
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

      {/* v1.6.0 Release Showcase — 75s = 2250 frames @ 30fps */}
      <Composition
        id="ReleaseShowcaseV16"
        component={ReleaseShowcaseV16}
        durationInFrames={2250}
        fps={30}
        width={1920}
        height={1080}
      />

      {/* v1.7.0 Release Showcase (MCP Server) — 70s = 2100 frames @ 30fps */}
      <Composition
        id="ReleaseShowcaseV17"
        component={ReleaseShowcaseV17}
        durationInFrames={2100}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
  );
};
