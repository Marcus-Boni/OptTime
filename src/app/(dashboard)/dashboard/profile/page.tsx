"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  ArrowRight,
  AtSign,
  Briefcase,
  Building2,
  CalendarClock,
  Camera,
  Clock3,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  MonitorCog,
  RefreshCw,
  Save,
  ShieldCheck,
  TimerReset,
  Trash2,
  User,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import OfficeLocationInput from "@/components/profile/OfficeLocationInput";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUpdateProfile } from "@/hooks/use-update-profile";
import { authClient, useSession } from "@/lib/auth-client";
import { compressImage } from "@/lib/image-utils";
import { cn, getInitials, isBase64Image, resolveUserImage } from "@/lib/utils";
import {
  type UpdateProfileFormInput,
  type UpdateProfileInput,
  updateProfileSchema,
} from "@/lib/validations/profile.schema";
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
} as const;

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  member: "Membro",
};

const viewLabel: Record<UserType["timeDefaultView"], string> = {
  day: "Dia",
  month: "Mês",
  week: "Semana",
};

const submitModeLabel: Record<UserType["timeSubmitMode"], string> = {
  close: "Fechar após salvar",
  continue: "Continuar registrando",
};

function OverviewMetric({
  icon: Icon,
  label,
  value,
  description,
}: {
  className?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 transition-all hover:border-brand-500/30 hover:bg-muted/35">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-md border border-brand-500/20 bg-brand-500/10 text-brand-400">
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-1 font-display text-base font-bold text-foreground sm:text-lg">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function PreferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/45 px-4 py-3 text-sm dark:border-border/50 dark:bg-background/60">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { data: session, refetch } = useSession();
  const user = session?.user as unknown as UserType;

  const [isUploading, setIsUploading] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<{
    hasToken: boolean;
    tokenPreview: string | null;
  } | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [isRevokingToken, setIsRevokingToken] = useState(false);
  const [isSyncingMicrosoft, setIsSyncingMicrosoft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isSaving, updateProfile } = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileFormInput, unknown, UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      department: "",
      jobTitle: "",
      name: "",
      officeLocation: "",
      weeklyCapacity: 40,
    },
  });

  const officeLocationValue = watch("officeLocation") ?? "";

  useEffect(() => {
    if (!user) {
      return;
    }

    reset({
      department: user.department ?? "",
      jobTitle: user.jobTitle ?? "",
      name: user.name ?? "",
      officeLocation: user.officeLocation ?? "",
      weeklyCapacity: user.weeklyCapacity ?? 40,
    });
  }, [reset, user]);

  async function handleSyncMicrosoft() {
    setIsSyncingMicrosoft(true);
    try {
      const res = await fetch("/api/user/profile/sync-microsoft", {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        user?: UserType;
        profile?: {
          jobTitle?: string | null;
          department?: string | null;
          officeLocation?: string | null;
        };
      };

      if (!res.ok) {
        throw new Error(
          data.error || "Não foi possível sincronizar com o Microsoft 365.",
        );
      }

      toast.success("Perfil sincronizado com o Microsoft 365 com sucesso!", {
        description: `Cargo: ${data.profile?.jobTitle || "Não informado"} • Depto: ${data.profile?.department || "Não informado"}`,
      });

      await refetch();
      if (data.user) {
        reset({
          name: data.user.name ?? "",
          jobTitle: data.user.jobTitle ?? "",
          department: data.user.department ?? "",
          officeLocation: data.user.officeLocation ?? "",
          weeklyCapacity: data.user.weeklyCapacity ?? 40,
        });
      }
    } catch (error) {
      console.error("[ProfilePage] handleSyncMicrosoft:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao sincronizar com o Microsoft 365.",
      );
    } finally {
      setIsSyncingMicrosoft(false);
    }
  }

  useEffect(() => {
    async function fetchTokenStatus() {
      try {
        const res = await fetch("/api/user/extension-token");
        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as {
          hasToken: boolean;
          tokenPreview: string | null;
        };
        setTokenStatus(data);
      } catch (error) {
        console.error("[ProfilePage] fetchTokenStatus:", error);
      } finally {
        setIsLoadingToken(false);
      }
    }

    void fetchTokenStatus();
  }, []);

  if (!user) {
    return null;
  }

  const avatarSrc = resolveUserImage(user.image);
  const initials = getInitials(user.name);
  const createdAt = new Date(user.createdAt);
  const lastUpdated = new Date(user.updatedAt);

  function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setIsUploading(true);
      const compressedBase64 = await compressImage(file, 512, 512, 0.92);

      const { error } = await authClient.updateUser({
        image: compressedBase64,
      });

      if (error) {
        toast.error(error.message || "Erro ao atualizar foto de perfil");
        return;
      }

      toast.success("Foto de perfil atualizada com sucesso.");
      await refetch();
    } catch (error) {
      console.error("[ProfilePage] handleFileChange:", error);
      toast.error("Erro ao processar a imagem. Tente novamente.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleSave(data: UpdateProfileInput) {
    const success = await updateProfile(data);
    if (success) {
      await refetch();
    }
  }

  async function handleGenerateToken() {
    setIsGeneratingToken(true);
    try {
      const res = await fetch("/api/user/extension-token", { method: "POST" });
      const data = (await res.json()) as { error?: string; token?: string };

      if (!res.ok || !data.token) {
        throw new Error(data.error || "Não foi possível gerar o token.");
      }

      setNewToken(data.token);
      setTokenStatus({
        hasToken: true,
        tokenPreview: `...${data.token.slice(-6)}`,
      });
      toast.success(
        "Token gerado. Copie agora, ele não será exibido novamente.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao gerar token.",
      );
    } finally {
      setIsGeneratingToken(false);
    }
  }

  async function handleRevokeToken() {
    setIsRevokingToken(true);
    try {
      const res = await fetch("/api/user/extension-token", {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Não foi possível revogar o token.");
      }

      setNewToken(null);
      setTokenStatus({ hasToken: false, tokenPreview: null });
      toast.success("Token revogado com sucesso.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao revogar token.",
      );
    } finally {
      setIsRevokingToken(false);
    }
  }

  async function handleCopyToken(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Token copiado.");
    } catch {
      toast.error("Não foi possível copiar o token.");
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Meu Perfil
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Centralize seus dados pessoais, acompanhe como sua rotina está
            configurada e gerencie seus recursos individuais da plataforma.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSyncMicrosoft()}
            disabled={isSyncingMicrosoft}
            data-tour="profile-microsoft-sync"
            className="gap-2 border-sky-500/30 bg-sky-500/10 text-xs font-medium text-sky-400 hover:bg-sky-500/20 hover:text-sky-300 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-300"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                isSyncingMicrosoft && "animate-spin",
              )}
            />
            {isSyncingMicrosoft
              ? "Sincronizando..."
              : "Sincronizar com Microsoft 365"}
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard/settings">
              Ajustar preferências
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card className="relative overflow-hidden border border-border/70 bg-card/85 shadow-sm backdrop-blur-md">
          {/* Linha de brilho sutil no topo com a cor da marca */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
          {/* Glow de iluminação ambiente no canto superior esquerdo */}
          <div className="pointer-events-none absolute -top-16 -left-16 h-36 w-36 rounded-full bg-brand-500/6 blur-3xl" />

          <CardContent className="px-5 py-4 sm:px-6 sm:py-4.5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
              <div className="relative h-20 w-20 shrink-0 sm:h-22 sm:w-22">
                <Avatar
                  className={`h-20 w-20 border-2 border-border/80 shadow-md ring-2 ring-brand-500/20 transition-all sm:h-22 sm:w-22 ${isUploading ? "opacity-60" : ""}`}
                >
                  {avatarSrc !== null && isBase64Image(avatarSrc) ? (
                    // biome-ignore lint/performance/noImgElement: base64 avatar is not supported by next/image
                    <img
                      src={avatarSrc}
                      alt={`Foto de perfil de ${user.name}`}
                      className="aspect-square size-full rounded-full object-cover"
                    />
                  ) : avatarSrc !== null ? (
                    <AvatarImage
                      src={avatarSrc}
                      alt={`Foto de perfil de ${user.name}`}
                    />
                  ) : null}
                  <AvatarFallback className="bg-brand-500/10 text-xl font-bold text-brand-400">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={isUploading}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
                  aria-label="Alterar foto de perfil"
                >
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                  tabIndex={-1}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {user.name}
                  </h2>
                  <Badge
                    variant="outline"
                    className="border-brand-500/30 bg-brand-500/10 text-xs font-medium text-brand-400"
                  >
                    <ShieldCheck className="mr-1 h-3 w-3 text-brand-400" />
                    {roleLabel[user.role] ?? user.role}
                  </Badge>
                  {user.microsoftSyncedAt ? (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="border-border/70 bg-muted/40 text-xs font-normal text-muted-foreground hover:bg-muted/70 cursor-help"
                          >
                            <RefreshCw className="mr-1 h-3 w-3 text-muted-foreground" />
                            Microsoft 365
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Última sincronização:{" "}
                          {format(
                            new Date(user.microsoftSyncedAt),
                            "dd/MM/yyyy 'às' HH:mm",
                            { locale: ptBR },
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : null}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                    {user.email}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Briefcase className="h-3.5 w-3.5 text-brand-400" />
                    {user.jobTitle || "Cargo não informado"}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {user.department || "Departamento não informado"}
                  </span>
                  {user.officeLocation ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {user.officeLocation}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3.5 grid gap-2.5 sm:grid-cols-3">
                  <OverviewMetric
                    icon={CalendarClock}
                    label="Capacidade"
                    value={`${user.weeklyCapacity}h / semana`}
                    description="Base usada para metas e comparação de carga."
                  />
                  <OverviewMetric
                    icon={TimerReset}
                    label="Entrada padrão"
                    value={`${user.timeDefaultDuration} min`}
                    description={`${viewLabel[user.timeDefaultView]} como visão inicial`}
                  />
                  <OverviewMetric
                    icon={MonitorCog}
                    label="Modo de envio"
                    value={submitModeLabel[user.timeSubmitMode]}
                    description={
                      user.timeDefaultBillable
                        ? "Novos lançamentos começam faturáveis."
                        : "Novos lançamentos começam não faturáveis."
                    }
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-6 xl:grid-cols-2 min-[1800px]:grid-cols-3">
        <motion.div
          variants={itemVariants}
          className="h-full xl:col-span-2 min-[1800px]:col-span-1"
        >
          <Card className="h-full border-border/50 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-display text-base">
                Informações pessoais
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <form
                onSubmit={handleSubmit(handleSave)}
                noValidate
                className="flex h-full flex-col"
              >
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex h-5 items-center">
                        <Label
                          htmlFor="profile-name"
                          className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                        >
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          Nome completo
                        </Label>
                      </div>
                      <Input
                        id="profile-name"
                        placeholder="Seu nome"
                        {...register("name")}
                      />
                      {errors.name ? (
                        <p className="text-xs text-red-400">
                          {errors.name.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <div className="flex h-5 items-center">
                        <Label
                          htmlFor="profile-email"
                          className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                        >
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          Email corporativo
                        </Label>
                      </div>
                      <Input
                        id="profile-email"
                        value={user.email}
                        disabled
                        readOnly
                      />
                      <p className="text-xs text-muted-foreground">
                        Email gerenciado pela autenticação Microsoft.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex h-5 items-center justify-between">
                        <Label
                          htmlFor="profile-job-title"
                          className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                        >
                          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                          Cargo corporativo
                        </Label>
                        <span className="text-[11px] text-muted-foreground">
                          Microsoft Graph
                        </span>
                      </div>
                      <Input
                        id="profile-job-title"
                        placeholder="Ex: Analista Desenvolvedor, Engenheiro de Software"
                        {...register("jobTitle")}
                      />
                      {errors.jobTitle ? (
                        <p className="text-xs text-red-400">
                          {errors.jobTitle.message}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <div className="flex h-5 items-center">
                        <Label
                          htmlFor="profile-department"
                          className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                        >
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          Departamento
                        </Label>
                      </div>
                      <Input
                        id="profile-department"
                        placeholder="Ex: Engenharia, Produto, Operações"
                        {...register("department")}
                      />
                      {errors.department ? (
                        <p className="text-xs text-red-400">
                          {errors.department.message}
                        </p>
                      ) : null}
                    </div>

                    <OfficeLocationInput
                      id="profile-office"
                      value={officeLocationValue}
                      onChange={(val) =>
                        setValue("officeLocation", val, {
                          shouldDirty: true,
                          shouldValidate: true,
                        })
                      }
                      placeholder="Ex: São Paulo, Sede, Remoto"
                      error={errors.officeLocation?.message}
                    />

                    <div className="space-y-2" data-tour="profile-capacity">
                      <div className="flex h-5 items-center">
                        <Label
                          htmlFor="profile-capacity"
                          className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                        >
                          <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                          Capacidade semanal (h)
                        </Label>
                      </div>
                      <Input
                        id="profile-capacity"
                        type="number"
                        min={1}
                        max={168}
                        aria-describedby="profile-capacity-help"
                        aria-invalid={Boolean(errors.weeklyCapacity)}
                        {...register("weeklyCapacity", { valueAsNumber: true })}
                      />
                      <p
                        id="profile-capacity-help"
                        className="text-xs text-muted-foreground"
                      >
                        Informe sua carga horária semanal. Em cinco dias úteis:
                        20h = 4h/dia, 30h = 6h/dia e 40h = 8h/dia. Metas e
                        indicadores acompanham essa capacidade.
                      </p>
                      {errors.weeklyCapacity ? (
                        <p className="text-xs text-red-400">
                          {errors.weeklyCapacity.message}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-muted-foreground">
                        <RefreshCw
                          className={cn(
                            "h-4 w-4",
                            isSyncingMicrosoft && "animate-spin",
                          )}
                        />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          Sincronização com Microsoft 365
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Atualize automaticamente cargo, departamento e dados
                          cadastrais do Microsoft Entra ID.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSyncMicrosoft()}
                      disabled={isSyncingMicrosoft}
                      data-tour="profile-microsoft-sync-form"
                      className="h-8 shrink-0 gap-1.5 border-border/70 text-xs text-foreground hover:bg-muted"
                    >
                      {isSyncingMicrosoft ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {isSyncingMicrosoft
                        ? "Sincronizando..."
                        : "Sincronizar agora"}
                    </Button>
                  </div>

                  <Separator />
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                  <p className="text-sm text-muted-foreground">
                    Atualize seus dados básicos aqui. Preferências de uso ficam
                    em Configurações.
                  </p>
                  <Button
                    type="submit"
                    disabled={isSaving || !isDirty}
                    className="gap-2 bg-brand-500 text-white hover:bg-brand-600"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {isSaving ? "Salvando..." : "Salvar perfil"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="h-full">
          <Card className="h-full border-border/50 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-display text-base">
                Como você trabalha
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PreferenceRow
                label="Visão inicial da agenda"
                value={viewLabel[user.timeDefaultView]}
              />
              <PreferenceRow
                label="Duração padrão"
                value={`${user.timeDefaultDuration} minutos`}
              />
              <PreferenceRow
                label="Após salvar"
                value={submitModeLabel[user.timeSubmitMode]}
              />
              <PreferenceRow
                label="Faturável por padrão"
                value={user.timeDefaultBillable ? "Sim" : "Não"}
              />
              <PreferenceRow
                label="Assistente inteligente"
                value={user.timeAssistantEnabled ? "Ativo" : "Desativado"}
              />
              <PreferenceRow
                label="Mostrar finais de semana"
                value={user.timeShowWeekends ? "Sim" : "Não"}
              />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="h-full">
          <Card className="h-full border-border/50 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-display text-base">
                Conta e segurança
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <PreferenceRow
                label="Provedor de login"
                value="Microsoft Entra ID"
              />
              <PreferenceRow
                label="Status Microsoft 365"
                value={
                  user.microsoftSyncedAt
                    ? `Sincronizado (${format(new Date(user.microsoftSyncedAt), "dd/MM 'às' HH:mm", { locale: ptBR })})`
                    : "Pendente de sincronização"
                }
              />
              <PreferenceRow
                label="Membro desde"
                value={format(createdAt, "dd 'de' MMMM 'de' yyyy", {
                  locale: ptBR,
                })}
              />
              <PreferenceRow
                label="Última atualização"
                value={format(lastUpdated, "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              />
              <PreferenceRow
                label="Outlook aberto por padrão"
                value={user.timeOutlookDefaultOpen ? "Sim" : "Não"}
              />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              Token da extensão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="max-w-3xl text-sm text-muted-foreground">
              Gere um token individual para conectar sua conta à extensão do
              navegador ou outras automações pessoais. Cada token pertence só a
              você e pode ser revogado a qualquer momento.
            </p>

            {isLoadingToken ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando status do token...
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status atual
                  </p>
                  <p className="mt-2 text-sm text-foreground">
                    {newToken
                      ? "Token recém-gerado pronto para cópia."
                      : tokenStatus?.hasToken
                        ? `Token ativo ${tokenStatus.tokenPreview ?? ""}`
                        : "Nenhum token ativo no momento."}
                  </p>

                  {newToken ? (
                    <div className="mt-4 rounded-xl border border-brand-500/20 bg-brand-500/5 p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <code className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-foreground">
                          {newToken}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => void handleCopyToken(newToken)}
                        >
                          <Copy className="h-4 w-4" />
                          Copiar token
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    onClick={() => void handleGenerateToken()}
                    disabled={isGeneratingToken}
                    className="gap-2 bg-brand-500 text-white hover:bg-brand-600"
                  >
                    {isGeneratingToken ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    {tokenStatus?.hasToken ? "Regenerar token" : "Gerar token"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleRevokeToken()}
                    disabled={isRevokingToken || !tokenStatus?.hasToken}
                    className="gap-2"
                  >
                    {isRevokingToken ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Revogar token
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
