import type { Metadata } from "next";
import { HqClient } from "@/components/hq/hq-client";

export const metadata: Metadata = {
  title: "Central de Gestão",
  description:
    "Radar de saúde dos projetos, capacidade da equipe, aprovações inteligentes e portais de cliente.",
};

interface HqPageProps {
  searchParams: Promise<{ tab?: string | string[] }>;
}

export default async function HqPage({ searchParams }: HqPageProps) {
  // Resolving the tab on the server keeps the client free of URL hooks, which
  // would otherwise force a Suspense boundary around the whole page.
  const { tab } = await searchParams;
  const initialTab = Array.isArray(tab) ? tab[0] : tab;

  return <HqClient initialTab={initialTab} />;
}
