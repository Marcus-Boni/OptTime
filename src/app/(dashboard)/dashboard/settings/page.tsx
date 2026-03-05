"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Check, Loader2, Monitor, Moon, Save, Sun, User } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useUpdateProfile } from "@/hooks/use-update-profile";
import { useSession } from "@/lib/auth-client";
import {
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

interface ThemeCardProps {
  value: ThemeOption;
  label: string;
  description: string;
  icon: React.ReactNode;
  currentTheme: ThemeOption;
  onSelect: (value: ThemeOption) => void;
}

function ThemeCard({
  value,
  label,
  description,
  icon,
  currentTheme,
  onSelect,
}: ThemeCardProps) {
  const isSelected = currentTheme === value;

  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={isSelected}
      aria-label={`Selecionar tema ${label}`}
      className={`group relative flex cursor-pointer flex-col gap-3 rounded-xl border-2 p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        isSelected
          ? "border-brand-500 bg-brand-500/5"
          : "border-border bg-card hover:border-brand-500/40 hover:bg-accent/50"
      }`}
    >
      {/* Theme preview */}
      <div
        className={`h-20 w-full overflow-hidden rounded-lg border ${
          value === "dark"
            ? "border-white/10 bg-neutral-950"
            : "border-neutral-200 bg-neutral-50"
        }`}
        aria-hidden="true"
      >
        {/* Simulated window chrome */}
        <div
          className={`flex h-6 items-center gap-1.5 border-b px-3 ${
            value === "dark"
              ? "border-white/10 bg-neutral-900"
              : "border-neutral-200 bg-white"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-red-400/70" />
          <span className="h-2 w-2 rounded-full bg-yellow-400/70" />
          <span className="h-2 w-2 rounded-full bg-green-400/70" />
        </div>
        {/* Simulated content */}
        <div className="flex gap-2 p-2">
          <div
            className={`h-full w-10 rounded ${value === "dark" ? "bg-neutral-800" : "bg-neutral-100"}`}
          />
          <div className="flex flex-1 flex-col gap-1.5 pt-0.5">
            <div
              className={`h-2 w-3/4 rounded-full ${value === "dark" ? "bg-neutral-700" : "bg-neutral-200"}`}
            />
            <div
              className={`h-2 w-1/2 rounded-full ${value === "dark" ? "bg-neutral-800" : "bg-neutral-100"}`}
            />
            <div className="mt-1 h-2 w-1/3 rounded-full bg-brand-500/40" />
          </div>
        </div>
      </div>

      {/* Label */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${
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
        {isSelected && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </span>
        )}
      </div>
    </button>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useUIStore();
  const { data: session, refetch } = useSession();
  const user = session?.user as unknown as UserType;

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

  async function handleSave(data: UpdateProfileInput) {
    const success = await updateProfile(data);
    if (success) {
      await refetch();
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-2xl space-y-8"
    >
      <motion.div variants={itemVariants}>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Configurações
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie suas preferências e perfil.
        </p>
      </motion.div>

      {/* Profile */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <User className="h-4 w-4" />
              Perfil
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(handleSave)} noValidate>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <UserAvatar
                    name={user.name}
                    image={user.image}
                    size="lg"
                    className="h-16 w-16 border-2 text-lg"
                  />
                  <div>
                    <p className="font-medium text-foreground">{user.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </div>
                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Nome */}
                  <div className="space-y-2">
                    <Label htmlFor="settings-name">Nome</Label>
                    <Input
                      id="settings-name"
                      placeholder="Seu nome"
                      aria-describedby={
                        errors.name ? "settings-name-error" : undefined
                      }
                      {...register("name")}
                    />
                    {errors.name && (
                      <p
                        id="settings-name-error"
                        className="text-xs text-red-400"
                        role="alert"
                      >
                        {errors.name.message}
                      </p>
                    )}
                  </div>

                  {/* Email — somente leitura */}
                  <div className="space-y-2">
                    <Label htmlFor="settings-email">Email</Label>
                    <Input
                      id="settings-email"
                      value={user.email}
                      disabled
                      readOnly
                      placeholder="Seu email"
                    />
                  </div>

                  {/* Departamento */}
                  <div className="space-y-2">
                    <Label htmlFor="settings-department">Departamento</Label>
                    <Input
                      id="settings-department"
                      placeholder="Ex: Analista Desenvolvedor"
                      aria-describedby={
                        errors.department
                          ? "settings-department-error"
                          : undefined
                      }
                      {...register("department")}
                    />
                    {errors.department && (
                      <p
                        id="settings-department-error"
                        className="text-xs text-red-400"
                        role="alert"
                      >
                        {errors.department.message}
                      </p>
                    )}
                  </div>

                  {/* Capacidade semanal */}
                  <div className="space-y-2">
                    <Label htmlFor="settings-capacity">
                      Capacidade Semanal (h)
                    </Label>
                    <Input
                      id="settings-capacity"
                      type="number"
                      min={1}
                      max={168}
                      aria-describedby={
                        errors.weeklyCapacity
                          ? "settings-capacity-error"
                          : undefined
                      }
                      {...register("weeklyCapacity", { valueAsNumber: true })}
                    />
                    {errors.weeklyCapacity && (
                      <p
                        id="settings-capacity-error"
                        className="text-xs text-red-400"
                        role="alert"
                      >
                        {errors.weeklyCapacity.message}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isSaving || !isDirty}
                  aria-busy={isSaving}
                  className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isSaving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Appearance */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <Monitor className="h-4 w-4" />
              Aparência
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground">Tema</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Escolha o tema visual da interface.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ThemeCard
                value="dark"
                label="Escuro"
                description="Para ambientes com pouca luz"
                icon={<Moon className="h-4 w-4" />}
                currentTheme={theme}
                onSelect={setTheme}
              />
              <ThemeCard
                value="light"
                label="Claro"
                description="Para ambientes bem iluminados"
                icon={<Sun className="h-4 w-4" />}
                currentTheme={theme}
                onSelect={setTheme}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
