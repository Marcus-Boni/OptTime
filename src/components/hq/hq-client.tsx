"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Activity, CheckSquare, Globe, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApprovalsTab } from "@/components/hq/ApprovalsTab";
import { HealthRadarTab } from "@/components/hq/HealthRadarTab";
import { PortalLinksTab } from "@/components/hq/PortalLinksTab";
import { WorkloadMatrixTab } from "@/components/hq/WorkloadMatrixTab";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHqApprovals } from "@/hooks/use-hq";

export type HqTab = "radar" | "capacity" | "approvals" | "portal";

const VALID_TABS: HqTab[] = ["radar", "capacity", "approvals", "portal"];

const TAB_TRIGGER_CLASS = "gap-2 px-5";

export interface HqClientProps {
  initialTab?: string;
}

function resolveTab(raw: string | undefined): HqTab {
  return VALID_TABS.includes(raw as HqTab) ? (raw as HqTab) : "radar";
}

export function HqClient({ initialTab }: HqClientProps) {
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const [tab, setTab] = useState<HqTab>(resolveTab(initialTab));
  useEffect(() => {
    setTab(resolveTab(initialTab));
  }, [initialTab]);

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
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Central de Gestão
          </h1>
          <p className="text-sm text-muted-foreground">
            Proteja o orçamento, distribua o trabalho com equilíbrio e revise as
            horas com contexto.
          </p>
        </div>
        <Badge variant="outline" className="w-fit gap-2 px-3 py-2">
          <span
            className="size-2 rounded-full bg-brand-500"
            aria-hidden="true"
          />
          {approvals.error
            ? "Aprovações indisponíveis"
            : approvals.isLoading
              ? "Consultando aprovações…"
              : pendingCount > 0
                ? `${pendingCount} aprovações pendentes`
                : "Aprovações em dia"}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="gap-6">
        <div className="overflow-x-auto">
          <TabsList
            variant="pill"
            className="w-full min-w-max sm:min-w-0"
            data-tour="hq-tabs"
          >
            <TabsTrigger
              value="radar"
              className={TAB_TRIGGER_CLASS}
              data-tour="hq-tab-radar"
            >
              <Activity className="size-4" aria-hidden="true" />
              <span>Radar de Projetos</span>
            </TabsTrigger>
            <TabsTrigger
              value="capacity"
              className={TAB_TRIGGER_CLASS}
              data-tour="hq-tab-capacity"
            >
              <Users className="size-4" aria-hidden="true" />
              <span>Capacidade</span>
            </TabsTrigger>
            <TabsTrigger
              value="approvals"
              className={TAB_TRIGGER_CLASS}
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
              className={TAB_TRIGGER_CLASS}
              data-tour="hq-tab-portal"
            >
              <Globe className="size-4" aria-hidden="true" />
              <span>Portal do Cliente</span>
            </TabsTrigger>
          </TabsList>
        </div>

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
