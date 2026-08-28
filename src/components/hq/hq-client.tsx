"use client";

import { motion } from "framer-motion";
import { Activity, CheckSquare, Globe, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ApprovalsTab } from "@/components/hq/ApprovalsTab";
import { HealthRadarTab } from "@/components/hq/HealthRadarTab";
import { PortalLinksTab } from "@/components/hq/PortalLinksTab";
import { WorkloadMatrixTab } from "@/components/hq/WorkloadMatrixTab";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHqApprovals } from "@/hooks/use-hq";

export type HqTab = "radar" | "capacity" | "approvals" | "portal";

const VALID_TABS: HqTab[] = ["radar", "capacity", "approvals", "portal"];

export interface HqClientProps {
  initialTab?: string;
}

function resolveTab(raw: string | undefined): HqTab {
  return VALID_TABS.includes(raw as HqTab) ? (raw as HqTab) : "radar";
}

export function HqClient({ initialTab }: HqClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<HqTab>(resolveTab(initialTab));

  // Approvals live at this level so the tab badge stays visible from any tab.
  const approvals = useHqApprovals();
  const pendingCount = approvals.data?.totals.pending ?? 0;

  const handleTabChange = useCallback(
    (value: string) => {
      const nextTab = resolveTab(value);
      setTab(nextTab);
      router.replace(`/dashboard/hq?tab=${nextTab}`, { scroll: false });
    },
    [router],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mx-auto w-full max-w-screen-2xl space-y-6"
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Central de Gestão
        </h1>
        <p className="text-sm text-muted-foreground">
          Saúde dos projetos, capacidade da equipe, aprovações inteligentes e
          portais de acompanhamento para clientes — tudo em um só lugar.
        </p>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="gap-6">
        <TabsList
          className="h-auto w-full flex-wrap justify-start gap-1 sm:w-fit"
          data-tour="hq-tabs"
        >
          <TabsTrigger
            value="radar"
            className="gap-1.5 px-3 py-1.5"
            data-tour="hq-tab-radar"
          >
            <Activity className="size-4" aria-hidden="true" />
            <span>Radar de Projetos</span>
          </TabsTrigger>
          <TabsTrigger
            value="capacity"
            className="gap-1.5 px-3 py-1.5"
            data-tour="hq-tab-capacity"
          >
            <Users className="size-4" aria-hidden="true" />
            <span>Capacidade</span>
          </TabsTrigger>
          <TabsTrigger
            value="approvals"
            className="gap-1.5 px-3 py-1.5"
            data-tour="hq-tab-approvals"
          >
            <CheckSquare className="size-4" aria-hidden="true" />
            <span>Aprovações</span>
            {pendingCount > 0 ? (
              <Badge
                variant="secondary"
                className="ml-0.5 h-5 min-w-5 bg-brand-500 px-1.5 font-mono text-[11px] text-white"
              >
                {pendingCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="portal"
            className="gap-1.5 px-3 py-1.5"
            data-tour="hq-tab-portal"
          >
            <Globe className="size-4" aria-hidden="true" />
            <span>Portal do Cliente</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="radar">
          <HealthRadarTab />
        </TabsContent>
        <TabsContent value="capacity">
          <WorkloadMatrixTab />
        </TabsContent>
        <TabsContent value="approvals">
          <ApprovalsTab controller={approvals} />
        </TabsContent>
        <TabsContent value="portal">
          <PortalLinksTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
