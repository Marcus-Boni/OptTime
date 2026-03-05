"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import {
  AtSign,
  Building2,
  Camera,
  Clock,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useUpdateProfile } from "@/hooks/use-update-profile";
import { authClient, useSession } from "@/lib/auth-client";
import { compressImage } from "@/lib/image-utils";
import { getInitials, isBase64Image, resolveUserImage } from "@/lib/utils";
import {
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

export default function ProfilePage() {
  const { data: session, refetch } = useSession();
  const user = session?.user as unknown as UserType;

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isSaving, updateProfile } = useUpdateProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      name: "",
      department: "",
      weeklyCapacity: 40,
    },
  });

  // Popula o form quando a sessão carrega ou muda
  useEffect(() => {
    if (user) {
      reset({
        name: user.name ?? "",
        department: user.department ?? "",
        weeklyCapacity: user.weeklyCapacity ?? 40,
      });
    }
  }, [user, reset]);

  if (!user) return null;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

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

      toast.success("Foto de perfil atualizada com sucesso!");
      await refetch();
    } catch (err: unknown) {
      console.error("[ProfilePage] handleFileChange:", err);
      toast.error("Erro ao processar a imagem. Tente novamente.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave(data: UpdateProfileInput) {
    const success = await updateProfile(data);
    if (success) {
      await refetch();
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const avatarSrc = resolveUserImage(user.image);
  const initials = getInitials(user.name);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-2xl space-y-8"
    >
      {/* Page Header */}
      <motion.div variants={itemVariants}>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Meu Perfil
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Informações da sua conta e dados pessoais.
        </p>
      </motion.div>

      {/* Avatar + Identity */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="relative group shrink-0 h-20 w-20">
                <Avatar
                  className={`h-20 w-20 border-2 border-border/50 transition-opacity ${isUploading ? "opacity-50" : "group-hover:opacity-80"}`}
                >
                  {(() => {
                    return (
                      <>
                        {avatarSrc !== null && isBase64Image(avatarSrc) ? (
                          // biome-ignore lint/performance/noImgElement: base64 not supported by next/image
                          <img
                            src={avatarSrc}
                            alt={`Foto de perfil de ${user.name}`}
                            className="aspect-square size-full object-cover rounded-full"
                          />
                        ) : avatarSrc !== null ? (
                          <AvatarImage
                            src={avatarSrc}
                            alt={`Foto de perfil de ${user.name}`}
                          />
                        ) : null}
                        <AvatarFallback className="bg-brand-500/10 text-2xl font-semibold text-brand-500">
                          {initials}
                        </AvatarFallback>
                      </>
                    );
                  })()}
                </Avatar>
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={isUploading}
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Alterar foto de perfil"
                >
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  ) : (
                    <Camera className="h-6 w-6 text-white" />
                  )}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  tabIndex={-1}
                />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="font-display text-xl font-bold text-foreground">
                  {user.name}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {user.email}
                </p>
                <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-brand-500/10 text-brand-400"
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {roleLabel[user.role] ?? user.role}
                  </Badge>
                  {user.department && (
                    <Badge variant="secondary" className="gap-1">
                      <Building2 className="h-3 w-3" />
                      {user.department}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Personal Info Form */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="font-display text-base">
              Informações Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(handleSave)} noValidate>
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Nome */}
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Nome completo</Label>
                    <Input
                      id="profile-name"
                      placeholder="Seu nome"
                      aria-describedby={
                        errors.name ? "profile-name-error" : undefined
                      }
                      {...register("name")}
                    />
                    {errors.name && (
                      <p
                        id="profile-name-error"
                        className="text-xs text-red-400"
                        role="alert"
                      >
                        {errors.name.message}
                      </p>
                    )}
                  </div>

                  {/* Email — somente leitura */}
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <div className="relative">
                      <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="profile-email"
                        value={user.email}
                        className="pl-9"
                        disabled
                        readOnly
                        aria-describedby="email-hint"
                        placeholder="Seu email"
                      />
                    </div>
                    <p
                      id="email-hint"
                      className="text-xs text-muted-foreground"
                    >
                      Gerenciado pela sua conta Microsoft.
                    </p>
                  </div>

                  {/* Departamento */}
                  <div className="space-y-2">
                    <Label htmlFor="profile-department">Departamento</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="profile-department"
                        placeholder="Ex: Analista Desenvolvedor"
                        className="pl-9"
                        aria-describedby={
                          errors.department
                            ? "profile-department-error"
                            : undefined
                        }
                        {...register("department")}
                      />
                    </div>
                    {errors.department && (
                      <p
                        id="profile-department-error"
                        className="text-xs text-red-400"
                        role="alert"
                      >
                        {errors.department.message}
                      </p>
                    )}
                  </div>

                  {/* Capacidade semanal */}
                  <div className="space-y-2">
                    <Label htmlFor="profile-capacity">
                      Capacidade semanal (h)
                    </Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="profile-capacity"
                        type="number"
                        min={1}
                        max={168}
                        placeholder="40"
                        className="pl-9"
                        aria-describedby={
                          errors.weeklyCapacity
                            ? "profile-capacity-error"
                            : undefined
                        }
                        {...register("weeklyCapacity", {
                          valueAsNumber: true,
                        })}
                      />
                    </div>
                    {errors.weeklyCapacity && (
                      <p
                        id="profile-capacity-error"
                        className="text-xs text-red-400"
                        role="alert"
                      >
                        {errors.weeklyCapacity.message}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <Button
                  type="submit"
                  disabled={isSaving || !isDirty}
                  aria-busy={isSaving}
                  className="gap-2 bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isSaving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Account Info */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="font-display text-base">
              Informações da Conta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Função</dt>
                <dd className="font-medium text-foreground">
                  {roleLabel[user.role] ?? user.role}
                </dd>
              </div>
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Provedor de login</dt>
                <dd className="font-medium text-foreground">Microsoft</dd>
              </div>
              <Separator />
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge className="bg-green-500/10 text-green-400">
                    Ativo
                  </Badge>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
