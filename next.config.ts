import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude heavy server-only packages from the Edge/client bundle.
  // remotion/cli is a dev tool; remotion itself is only used for the
  // Remotion Player (client-side dynamic import) and local video rendering.
  serverExternalPackages: ["remotion", "@remotion/cli"],

  async headers() {
    return [
      {
        // Allow the Azure DevOps browser extension to call these API routes.
        // The extension runs as an iframe inside dev.azure.com / *.visualstudio.com.
        source: "/api/extension/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Authorization,Content-Type",
          },
        ],
      },
    ];
  },

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
