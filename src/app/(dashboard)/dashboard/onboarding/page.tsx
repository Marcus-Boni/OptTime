import type { Metadata } from "next";
import { OnboardingClient } from "./onboarding-client";

export const metadata: Metadata = {
  title: "Central de Ajuda",
  description:
    "Tours guiados por perfil, primeiros passos e atalhos para dominar o OptSolv Time Tracker.",
};

export default function OnboardingPage() {
  return <OnboardingClient />;
}
