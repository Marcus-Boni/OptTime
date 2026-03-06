import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude heavy server-only packages from the Edge/client bundle.
  // remotion/cli is a dev tool; remotion itself is only used for the
  // Remotion Player (client-side dynamic import) and local video rendering.
  serverExternalPackages: ["remotion", "@remotion/cli"],

  images: {
    remotePatterns: [
      // Microsoft Graph API — foto de perfil via URL (alternativa ao base64)
      {
        protocol: "https",
        hostname: "graph.microsoft.com",
      },
      // CDN de avatares da Microsoft
      {
        protocol: "https",
        hostname: "*.microsoft.com",
      },
    ],
  },
};

export default nextConfig;
