import type { Metadata } from "next";
import { VsCodeSetupClient } from "@/components/integrations/vscode/VsCodeSetupClient";
import { getServerAppUrl } from "@/lib/app-url";

export const metadata: Metadata = {
  title: "Extensão do editor (VS Code)",
  description:
    "Instale a extensão do OptSolv Time Tracker no VS Code, Cursor ou Antigravity e registre horas sem sair do editor.",
};

/**
 * Setup page for the editor extension.
 *
 * The base URL is resolved on the server so the `optTime.baseUrl` snippet points
 * at the environment the user is actually looking at — production, preview or
 * localhost — instead of a hardcoded domain.
 */
export default function VsCodeIntegrationPage() {
  return <VsCodeSetupClient baseUrl={getServerAppUrl()} />;
}
