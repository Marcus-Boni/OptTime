"use client";

import { motion } from "framer-motion";
import { ArrowRight, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function IntegrationsPage() {
  const [azureConnected, setAzureConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/integrations/azure-devops");
        if (res.ok) {
          const data = await res.json();
          setAzureConnected(data.hasPat);
        }
      } catch (e) {
        // Ignore errors for this non-critical status verification
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, []);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      <motion.div variants={itemVariants}>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Integrações
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte o OptSolv Time Tracker com as ferramentas de gestão que sua
          equipe já utiliza.
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Azure DevOps Integration Card */}
        <motion.div variants={itemVariants}>
          <Link href="/dashboard/integrations/azure-devops">
            <Card className="group h-full cursor-pointer border-border/50 bg-card/80 backdrop-blur transition-all hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 font-display text-base">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      id="f4337506-5d95-4e80-b7ca-68498c6e008e"
                      viewBox="0 0 18 18"
                      className="h-5 w-5 text-[#0078D7]"
                    >
                      <defs>
                        <linearGradient
                          id="ba420277-700e-42cc-9de9-5388a5c16e54"
                          x1="9"
                          y1="16.97"
                          x2="9"
                          y2="1.03"
                          gradientUnits="userSpaceOnUse"
                        >
                          <stop offset="0" stopColor="#0078d4" />
                          <stop offset="0.16" stopColor="#1380da" />
                          <stop offset="0.53" stopColor="#3c91e5" />
                          <stop offset="0.82" stopColor="#559cec" />
                          <stop offset="1" stopColor="#5ea0ef" />
                        </linearGradient>
                      </defs>
                      <path
                        id="a91f0ca4-8fb7-4019-9c09-0a52e2c05754"
                        d="M17,4v9.74l-4,3.28-6.2-2.26V17L3.29,12.41l10.23.8V4.44Zm-3.41.49L7.85,1V3.29L2.58,4.84,1,6.87v4.61l2.26,1V6.57Z"
                        fill="url(#ba420277-700e-42cc-9de9-5388a5c16e54)"
                      />
                    </svg>
                    Azure DevOps
                  </CardTitle>
                  {!isLoading && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px]",
                        azureConnected
                          ? "bg-green-500/10 text-green-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {azureConnected ? "Conectado" : "Não configurado"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-xs text-muted-foreground">
                  Sincronize horas apontadas diretamente com os seus Work Items
                  no Azure Boards e mantenha tudo atualizado.
                </p>
                <div className="mt-auto flex items-center text-xs font-medium text-brand-500 group-hover:text-brand-600">
                  <Settings className="mr-1.5 h-3.5 w-3.5" />
                  Configurar
                  <ArrowRight className="ml-1 h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </motion.div>

        {/* Jira Integration Placeholder */}
        <motion.div variants={itemVariants}>
          <Card className="flex h-full flex-col border-border/50 bg-card/40 backdrop-blur opacity-60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-display text-base text-muted-foreground flex items-center gap-2">
                  <svg
                    viewBox="0 0 512 512"
                    xmlns="http://www.w3.org/2000/svg"
                    fillRule="evenodd"
                    clipRule="evenodd"
                    strokeLinejoin="round"
                    strokeMiterlimit="2"
                    className="h-5 w-5 fill-current"
                  >
                    <path
                      d="M0 128C0 57.312 57.312 0 128 0h256.001c70.688 0 128 57.312 128 128v256.001c0 70.688-57.312 128-128 128h-256C57.311 512.002 0 454.69 0 384.002v-256z"
                      fill="#1868db"
                      fillRule="nonzero"
                    />
                    <path
                      d="M189.544 324.041H160.69c-43.51 0-74.72-24.483-74.72-60.321h155.115c8.043 0 13.248 5.241 13.248 12.677V419.77c-38.784 0-64.79-28.853-64.79-69.07V324.04zm76.608-71.245h-28.843c-43.51 0-74.73-24.043-74.73-59.89h155.125c8.043 0 13.718 4.81 13.718 12.236v143.373c-38.785 0-65.27-28.843-65.27-69.061v-26.658zm77.088-70.815h-28.842c-43.51 0-74.731-24.483-74.731-60.321h155.125c8.043 0 13.248 5.241 13.248 12.237v143.372c-38.784 0-64.8-28.853-64.8-69.06V181.98z"
                      fill="#fff"
                      fillRule="nonzero"
                    />
                  </svg>
                  Jira Software
                </CardTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] text-muted-foreground border-border/50"
                >
                  Em breve
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Sincronize epics, tarefas e o tempo apontado diretamente com os
                seus projetos do Jira da Atlassian.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
