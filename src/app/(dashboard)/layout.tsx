import type { Metadata } from "next";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export const metadata: Metadata = {
  title: {
    template: "%s | OptSolv Time Tracker",
    default: "Dashboard | OptSolv Time Tracker",
  },
  description: "Painel de controle e acompanhamento de horas registradas.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}

