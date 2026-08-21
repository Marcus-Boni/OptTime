import type { Metadata } from "next";
import { McpSetupClient } from "@/components/integrations/mcp/McpSetupClient";
import { getServerAppUrl } from "@/lib/app-url";

export const metadata: Metadata = {
  title: "Agentes de IA (MCP)",
  description:
    "Conecte Cursor, Claude Code, Claude Desktop e outros agentes ao OptSolv Time Tracker para registrar horas sem sair do editor.",
};

/**
 * Setup page for the MCP server.
 *
 * The base URL is resolved on the server so the configuration snippets always
 * point at the environment the user is actually looking at — production,
 * preview or localhost — instead of a hardcoded domain.
 */
export default function McpIntegrationPage() {
  return <McpSetupClient baseUrl={getServerAppUrl()} />;
}
