import type { Metadata } from "next";
import { SettingsClient } from "./settings-client";
import { resolveSettingsTab } from "./tabs";

export const metadata: Metadata = {
  title: "Configurações",
  description:
    "Ajuste a experiência da plataforma, o Operador IA e as integrações da sua conta.",
};

interface SettingsPageProps {
  searchParams: Promise<{ tab?: string | string[] }>;
}

export default async function SettingsPage({
  searchParams,
}: SettingsPageProps) {
  // Resolving the tab on the server keeps the client free of URL hooks, which
  // would otherwise push the whole page into a client-side render.
  const { tab } = await searchParams;

  return <SettingsClient initialTab={resolveSettingsTab(tab)} />;
}
