import type { Metadata } from "next";
import { TeamsSettingsClient } from "@/components/integrations/teams/TeamsSettingsClient";

export const metadata: Metadata = {
  title: "Microsoft Teams",
  description:
    "Standup no canal, lembrete vespertino, comandos de timer e status sincronizado com o Teams.",
};

export default function TeamsIntegrationPage() {
  return <TeamsSettingsClient />;
}
