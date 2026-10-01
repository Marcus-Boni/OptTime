import path from "node:path";
import { Config } from "@remotion/cli/config";

/** Keep CLI rendering aligned with the path aliases used by the Next.js player. */
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...config.resolve?.alias,
      "@/remotion": path.resolve(process.cwd(), "remotion"),
      "@": path.resolve(process.cwd(), "src"),
    },
  },
}));
