"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import {
  BellRing,
  Check,
  CheckSquare,
  Clock3,
  FolderKanban,
  Layers3,
  LayoutTemplate,
  Loader2,
  Moon,
  Settings2,
  Sparkles,
  Sun,
  Users,
  Workflow,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUpdateProfile } from "@/hooks/use-update-profile";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  type UpdateProfileFormInput,
  type UpdateProfileInput,
  updateProfileSchema,
} from "@/lib/validations/profile.schema";
import { useUIStore } from "@/stores/ui.store";
import type { User as UserType } from "@/types/user";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

type ThemeOption = "dark" | "light";

type SettingsOverview = {
  directReports: number;
  draftReleases: number;
  pendingApprovals: number;
  pendingInvitations: number;
  pendingSuggestions: number;
  projectsInScope: number;
  publishedReleases: number;
  reminderSchedule: {
    condition: string;
    daysOfWeek: number[];
    enabled: boolean;
    hour: number;
    minute: number;
    targetScope: string;
    timezone: string;
  } | null;
  scope: "organization" | "team";
  syncedProjects: number;
  teamMembers: number;
};

interface ThemeCardProps {
  currentTheme: ThemeOption;
  description: string;
  icon: React.ReactNode;
  label: string;
  onSelect: (value: ThemeOption) => void;
  value: ThemeOption;
}

const viewOptions = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
] as const;

const submitModeOptions = [
  { value: "close", label: "Fechar após salvar" },
  { value: "continue", label: "Continuar registrando" },
] as const;

function ThemeCard({
  currentTheme,
  description,
  icon,
  label,
  onSelect,
  value,
}: ThemeCardProps) {
  const isSelected = currentTheme === value;

  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={isSelected}
      className={`group relative flex cursor-pointer flex-col gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
        isSelected
          ? "border-brand-500 bg-brand-500/5"
          : "border-border bg-card hover:border-brand-500/40 hover:bg-accent/50"
      }`}
    >
      <div
        className={`h-24 overflow-hidden rounded-xl border ${
          value === "dark"
            ? "border-white/10 bg-neutral-950"
            : "border-neutral-200 bg-neutral-50"
        }`}
        aria-hidden="true"
      >
        <div
          className={`flex h-7 items-center gap-1.5 border-b px-3 ${
            value === "dark"
              ? "border-white/10 bg-neutral-900"
              : "border-neutral-200 bg-white"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-red-400/70" />
          <span className="h-2 w-2 rounded-full bg-yellow-400/70" />
          <span className="h-2 w-2 rounded-full bg-green-400/70" />
        </div>
        <div className="grid grid-cols-[56px_1fr] gap-2 p-2">
          <div
            className={`rounded-lg ${value === "dark" ? "bg-neutral-800" : "bg-neutral-100"}`}
          />
          <div className="space-y-2 pt-1">
            <div
              className={`h-2 w-3/4 rounded-full ${value === "dark" ? "bg-neutral-700" : "bg-neutral-200"}`}
            />
            <div
              className={`h-2 w-1/2 rounded-full ${value === "dark" ? "bg-neutral-800" : "bg-neutral-100"}`}
            />
            <div className="h-9 rounded-lg bg-brand-500/35" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-xl ${
              isSelected
                ? "bg-brand-500/15 text-brand-500"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {icon}
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        {isSelected ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </span>
        ) : null}
      </div>
    </button>
  );
}

function ToggleRow({
  checked,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/70 px-4 py-4">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function OverviewCard({
  description,
  icon: Icon,
  value,
}: {
  description: string;
  icon: typeof Users;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-brand-500" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useUIStore();
  const { data: session, refetch } = useSession();
  const user = session?.user as unknown as UserType;
  const isPrivileged = user?.role === "admin" || user?.role === "manager";

  const [overview, setOverview] = useState<SettingsOverview | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);

  const [azureConnected, setAzureConnected] = useState(false);
  const [isLoadingAzureStatus, setIsLoadingAzureStatus] = useState(true);

  const { isSaving, updateProfile } = useUpdateProfile();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileFormInput, unknown, UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      timeAssistantEnabled: true,
      timeDefaultBillable: true,
      timeDefaultDuration: 60,
      timeDefaultView: "week",
      timeOutlookDefaultOpen: false,
      timeShowWeekends: true,
      timeSubmitMode: "close",
    },
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    reset({
      timeAssistantEnabled: user.timeAssistantEnabled,
      timeDefaultBillable: user.timeDefaultBillable,
      timeDefaultDuration: user.timeDefaultDuration,
      timeDefaultView: user.timeDefaultView,
      timeOutlookDefaultOpen: user.timeOutlookDefaultOpen,
      timeShowWeekends: user.timeShowWeekends,
      timeSubmitMode: user.timeSubmitMode,
    });
  }, [reset, user]);

  useEffect(() => {
    if (!isPrivileged) {
      return;
    }

    async function fetchOverview() {
      setIsLoadingOverview(true);
      try {
        const res = await fetch("/api/settings/overview");
        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as SettingsOverview;
        setOverview(data);
      } catch (error) {
        console.error("[SettingsPage] fetchOverview:", error);
      } finally {
        setIsLoadingOverview(false);
      }
    }

    void fetchOverview();
  }, [isPrivileged]);

  useEffect(() => {
    async function checkAzureStatus() {
      try {
        const res = await fetch("/api/integrations/azure-devops");
        if (res.ok) {
          const data = await res.json();
          setAzureConnected(data.hasPat);
        }
      } catch (e) {
        // Ignore errors for this non-critical status verification
      } finally {
        setIsLoadingAzureStatus(false);
      }
    }
    checkAzureStatus();
  }, []);

  const reminderSummary = useMemo(() => {
    if (!overview?.reminderSchedule) {
      return "Nenhum agendamento configurado.";
    }

    const schedule = overview.reminderSchedule;
    if (!schedule.enabled) {
      return "Agendamento criado, porém desativado.";
    }

    return `Ativo às ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")} em ${schedule.daysOfWeek.length} dia(s) por semana.`;
  }, [overview]);

  if (!user) {
    return null;
  }

  async function handleSavePreferences(data: UpdateProfileInput) {
    const success = await updateProfile(data);
    if (!success) {
      return;
    }

    await refetch();
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      <motion.div variants={itemVariants}>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Configurações
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Ajuste a experiência da plataforma para o seu fluxo de trabalho e, se
          você atua em gestão, acompanhe a saúde operacional do time.
        </p>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Tabs defaultValue="experience" className="space-y-6">
          <TabsList>
            <TabsTrigger value="experience">Experiência</TabsTrigger>
            <TabsTrigger value="productivity">Produtividade</TabsTrigger>
            <TabsTrigger value="integrations">Integrações</TabsTrigger>
            {isPrivileged ? (
              <TabsTrigger value="operations">Operação</TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="experience" className="space-y-6">
            <Card className="border-border/50 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <LayoutTemplate className="h-4 w-4 text-brand-500" />
                  Aparência
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Tema da interface
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Esta escolha é aplicada imediatamente na interface atual.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <ThemeCard
                    value="dark"
                    label="Escuro"
                    description="Contraste forte para foco em dados e tabelas."
                    icon={<Moon className="h-4 w-4" />}
                    currentTheme={theme}
                    onSelect={setTheme}
                  />
                  <ThemeCard
                    value="light"
                    label="Claro"
                    description="Mais confortável em ambientes bem iluminados."
                    icon={<Sun className="h-4 w-4" />}
                    currentTheme={theme}
                    onSelect={setTheme}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Sparkles className="h-4 w-4 text-brand-500" />
                  Uso diário
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <OverviewCard
                  icon={Clock3}
                  value={`${user.timeDefaultDuration} min`}
                  description="Duração padrão para um novo lançamento."
                />
                <OverviewCard
                  icon={Settings2}
                  value={
                    user.timeDefaultView === "month"
                      ? "Mês"
                      : user.timeDefaultView === "day"
                        ? "Dia"
                        : "Semana"
                  }
                  description="Visão inicial ao abrir a área de tempo."
                />
                <OverviewCard
                  icon={Workflow}
                  value={
                    user.timeSubmitMode === "continue" ? "Continuar" : "Fechar"
                  }
                  description="Comportamento da interface após salvar."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="productivity" className="space-y-6">
            <Card className="border-border/50 bg-card/80 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Workflow className="h-4 w-4 text-brand-500" />
                  Preferências salvas na sua conta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleSubmit(handleSavePreferences)}
                  className="space-y-5"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Visão padrão da agenda</Label>
                      <Controller
                        control={control}
                        name="timeDefaultView"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {viewOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.timeDefaultView ? (
                        <p className="text-xs text-red-400">
                          {errors.timeDefaultView.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label>Duração padrão (minutos)</Label>
                      <Controller
                        control={control}
                        name="timeDefaultDuration"
                        render={({ field }) => (
                          <Select
                            value={String(field.value ?? 60)}
                            onValueChange={(value) =>
                              field.onChange(Number(value))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[15, 30, 45, 60, 90, 120, 180].map((value) => (
                                <SelectItem key={value} value={String(value)}>
                                  {value} minutos
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.timeDefaultDuration ? (
                        <p className="text-xs text-red-400">
                          {errors.timeDefaultDuration.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label>Depois de salvar</Label>
                      <Controller
                        control={control}
                        name="timeSubmitMode"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {submitModeOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                      Estas preferências são sincronizadas com sua conta e
                      reaplicadas ao entrar em outro navegador ou dispositivo.
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 md:grid-cols-2">
                    <Controller
                      control={control}
                      name="timeDefaultBillable"
                      render={({ field }) => (
                        <ToggleRow
                          checked={Boolean(field.value)}
                          onCheckedChange={field.onChange}
                          label="Marcar novos lançamentos como faturáveis"
                          description="Útil para equipes que passam a maior parte do tempo em projetos cobrados do cliente."
                        />
                      )}
                    />

                    <Controller
                      control={control}
                      name="timeAssistantEnabled"
                      render={({ field }) => (
                        <ToggleRow
                          checked={Boolean(field.value)}
                          onCheckedChange={field.onChange}
                          label="Ativar assistente inteligente"
                          description="Mantém sugestões e automações contextuais visíveis na área de tempo."
                        />
                      )}
                    />

                    <Controller
                      control={control}
                      name="timeShowWeekends"
                      render={({ field }) => (
                        <ToggleRow
                          checked={Boolean(field.value)}
                          onCheckedChange={field.onChange}
                          label="Mostrar finais de semana"
                          description="Exibe sábado e domingo nas visões semanais e de equipe."
                        />
                      )}
                    />

                    <Controller
                      control={control}
                      name="timeOutlookDefaultOpen"
                      render={({ field }) => (
                        <ToggleRow
                          checked={Boolean(field.value)}
                          onCheckedChange={field.onChange}
                          label="Abrir Outlook por padrão"
                          description="Expande automaticamente o painel de reuniões ao abrir o formulário."
                        />
                      )}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={isSaving || !isDirty}
                      className="gap-2 bg-brand-500 text-white hover:bg-brand-600"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {isSaving ? "Salvando..." : "Salvar preferências"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Link href="/dashboard/settings/integrations/azure-devops">
                <Card className="group h-full cursor-pointer border-border/50 bg-card/80 backdrop-blur transition-all hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 font-display text-base">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
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
                            d="M17,4v9.74l-4,3.28-6.2-2.26V17L3.29,12.41l10.23.8V4.44Zm-3.41.49L7.85,1V3.29L2.58,4.84,1,6.87v4.61l2.26,1V6.57Z"
                            fill="url(#ba420277-700e-42cc-9de9-5388a5c16e54)"
                          />
                        </svg>
                        Azure DevOps
                      </CardTitle>
                      {!isLoadingAzureStatus && (
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
                      <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                      Configurar
                      <ArrowRight className="ml-1 h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
              
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
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/50">
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
            </div>
          </TabsContent>

          {isPrivileged ? (
            <TabsContent value="operations" className="space-y-6">
              <Card className="border-border/50 bg-card/80 backdrop-blur">
                <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 font-display text-base">
                      <Layers3 className="h-4 w-4 text-brand-500" />
                      Panorama operacional
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {overview?.scope === "organization"
                        ? "Visão global da operação da plataforma."
                        : "Visão consolidada do escopo gerenciado por você."}
                    </p>
                  </div>
                  <Badge variant="secondary" className="w-fit">
                    {user.role === "admin" ? "Administrador" : "Gestor"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-5">
                  {isLoadingOverview ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {Array.from({ length: 8 }).map((_, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
                        <Skeleton key={index} className="h-28 rounded-2xl" />
                      ))}
                    </div>
                  ) : overview ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <OverviewCard
                          icon={Users}
                          value={String(overview.teamMembers)}
                          description={
                            overview.scope === "organization"
                              ? "Pessoas ativas na organização."
                              : "Pessoas ativas sob sua gestão."
                          }
                        />
                        <OverviewCard
                          icon={CheckSquare}
                          value={String(overview.pendingApprovals)}
                          description="Timesheets aguardando aprovação."
                        />
                        <OverviewCard
                          icon={BellRing}
                          value={String(overview.pendingInvitations)}
                          description="Convites pendentes ainda não aceitos."
                        />
                        <OverviewCard
                          icon={FolderKanban}
                          value={String(overview.projectsInScope)}
                          description="Projetos ativos dentro do seu escopo."
                        />
                        <OverviewCard
                          icon={Workflow}
                          value={String(overview.syncedProjects)}
                          description="Projetos vinculados ao Azure DevOps."
                        />
                        <OverviewCard
                          icon={Layers3}
                          value={String(overview.publishedReleases)}
                          description="Releases públicas disponíveis no changelog."
                        />
                        {user.role === "admin" ? (
                          <>
                            <OverviewCard
                              icon={Sparkles}
                              value={String(overview.pendingSuggestions)}
                              description="Sugestões novas aguardando triagem."
                            />
                            <OverviewCard
                              icon={Settings2}
                              value={String(overview.draftReleases)}
                              description="Releases em rascunho para publicação."
                            />
                          </>
                        ) : (
                          <OverviewCard
                            icon={Users}
                            value={String(overview.directReports)}
                            description="Colaboradores reportando diretamente a você."
                          />
                        )}
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                        <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
                          <p className="text-sm font-medium text-foreground">
                            Automação de lembretes
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {reminderSummary}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Escopo atual:{" "}
                            {overview.reminderSchedule?.targetScope === "all"
                              ? "organização inteira"
                              : "reports diretos"}
                            .
                          </p>
                        </div>

                        <div className="rounded-2xl border border-border/60 bg-background/70 p-5">
                          <p className="text-sm font-medium text-foreground">
                            Atalhos de gestão
                          </p>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <Button
                              asChild
                              variant="outline"
                              className="justify-start"
                            >
                              <Link href="/dashboard/people">Abrir equipe</Link>
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              className="justify-start"
                            >
                              <Link href="/dashboard/timesheets/approvals">
                                Revisar aprovações
                              </Link>
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              className="justify-start"
                            >
                              <Link href="/dashboard/team-hours">
                                Ver horas da equipe
                              </Link>
                            </Button>
                            <Button
                              asChild
                              variant="outline"
                              className="justify-start"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  const btn = document.querySelector('button[value="integrations"]') as HTMLButtonElement;
                                  if (btn) btn.click();
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                              >
                                Conferir integrações
                              </button>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 p-6 text-sm text-muted-foreground">
                      Não foi possível carregar o panorama operacional agora.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}
        </Tabs>
      </motion.div>
    </motion.div>
  );
}
