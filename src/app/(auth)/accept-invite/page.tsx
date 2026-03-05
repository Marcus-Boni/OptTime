"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mail,
} from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type InviteStatus = "loading" | "valid" | "invalid" | "expired" | "success";

interface InviteData {
  email: string;
  role: string;
}

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  member: "Membro",
};

function getPasswordStrength(pwd: string) {
  if (!pwd) return { score: 0, label: "", color: "bg-muted" };

  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/[0-9]/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

  if (score === 1) return { score, label: "Fraca", color: "bg-red-500" };
  if (score === 2) return { score, label: "Razoável", color: "bg-yellow-500" };
  if (score === 3) return { score, label: "Boa", color: "bg-brand-500" };
  if (score === 4) return { score, label: "Forte", color: "bg-green-500" };
  return { score: 0, label: "Muito fraca", color: "bg-red-500" };
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<InviteStatus>("loading");
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateToken = useCallback(async () => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    try {
      const res = await fetch(`/api/invitations/${token}/validate`);

      if (res.status === 410) {
        setStatus("expired");
        return;
      }

      if (!res.ok) {
        setStatus("invalid");
        return;
      }

      const data: InviteData = await res.json();
      setInviteData(data);
      setStatus("valid");
    } catch {
      setStatus("invalid");
    }
  }, [token]);

  useEffect(() => {
    void validateToken();
  }, [validateToken]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    if (password.length < 8) {
      toast.error("A senha deve ter ao menos 8 caracteres");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });

      const json: unknown = await res.json();

      if (!res.ok) {
        const errorMsg =
          typeof json === "object" && json !== null && "error" in json
            ? (json as { error: string }).error
            : "Erro ao criar conta. Tente novamente.";
        toast.error(errorMsg);
        return;
      }

      setStatus("success");
    } catch (err: unknown) {
      console.error("[AcceptInvitePage] handleSubmit:", err);
      toast.error("Erro inesperado. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
      }}
    >
      <Card className="border-border/50 bg-card/80 backdrop-blur-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/20">
            <Image
              src="/logo-white.svg"
              alt="OptSolv Logo"
              width={24}
              height={36}
            />
          </div>
          <div>
            <CardTitle className="font-display text-2xl font-bold">
              OptSolv
              <span className="text-brand-500"> Time</span>
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent>
          <AnimatePresence mode="wait">
            {status === "loading" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 py-8"
              >
                <Loader2
                  className="h-8 w-8 animate-spin text-brand-500"
                  aria-hidden="true"
                />
                <p className="text-sm text-muted-foreground">
                  Validando convite...
                </p>
              </motion.div>
            )}

            {status === "invalid" && (
              <motion.div
                key="invalid"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-3 py-8 text-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                  <AlertCircle
                    className="h-6 w-6 text-red-400"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="font-semibold text-foreground">
                  Convite inválido
                </h2>
                <p className="text-sm text-muted-foreground">
                  Este link de convite não existe ou já foi utilizado.
                </p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => router.push("/login")}
                >
                  Ir para o login
                </Button>
              </motion.div>
            )}

            {status === "expired" && (
              <motion.div
                key="expired"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-3 py-8 text-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
                  <AlertCircle
                    className="h-6 w-6 text-yellow-400"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="font-semibold text-foreground">
                  Convite expirado
                </h2>
                <p className="text-sm text-muted-foreground">
                  Este convite já expirou. Peça ao seu gerente que envie um novo
                  convite.
                </p>
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => router.push("/login")}
                >
                  Ir para o login
                </Button>
              </motion.div>
            )}

            {status === "success" && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-3 py-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    delay: 0.15,
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                  }}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10"
                >
                  <CheckCircle2
                    className="h-8 w-8 text-green-400"
                    aria-hidden="true"
                  />
                </motion.div>
                <h2 className="font-semibold text-foreground">
                  Conta criada com sucesso!
                </h2>
                <p className="text-sm text-muted-foreground">
                  Bem-vindo ao OptSolv Time. Faça login para começar.
                </p>
                <Button
                  className="mt-2 bg-brand-500 text-white hover:bg-brand-600"
                  onClick={() => router.push("/login")}
                >
                  Fazer login
                </Button>
              </motion.div>
            )}

            {status === "valid" && inviteData && (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5"
              >
                {/* Invite info banner */}
                <div className="flex items-center gap-3 rounded-lg border border-brand-500/20 bg-brand-500/5 px-4 py-3">
                  <Mail
                    className="h-4 w-4 shrink-0 text-brand-400"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {inviteData.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Perfil:{" "}
                      <span className="text-brand-400">
                        {roleLabels[inviteData.role] ?? inviteData.role}
                      </span>
                    </p>
                  </div>
                </div>

                <CardDescription className="text-center">
                  Complete seu cadastro para acessar a plataforma
                </CardDescription>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Seu nome"
                      required
                      autoComplete="name"
                      autoFocus
                      className="bg-background/50"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-describedby="name-hint"
                    />
                    <p id="name-hint" className="text-xs text-muted-foreground">
                      Como você será identificado na plataforma
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Mínimo 8 caracteres"
                        required
                        autoComplete="new-password"
                        className="bg-background/50 pr-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-describedby="password-hint"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={
                          showPassword ? "Esconder senha" : "Mostrar senha"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <div className="space-y-2 pt-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((level) => (
                          <div
                            key={level}
                            className={cn(
                              "h-1.5 w-full rounded-full transition-colors",
                              password &&
                                level <= getPasswordStrength(password).score
                                ? getPasswordStrength(password).color
                                : "bg-muted",
                            )}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <p id="password-hint" className="text-muted-foreground">
                          Mínimo de 8 caracteres
                        </p>
                        {password && (
                          <span
                            className={cn(
                              "font-medium",
                              getPasswordStrength(password).score <= 1 &&
                                "text-red-400",
                              getPasswordStrength(password).score === 2 &&
                                "text-yellow-400",
                              getPasswordStrength(password).score === 3 &&
                                "text-brand-400",
                              getPasswordStrength(password).score === 4 &&
                                "text-green-400",
                            )}
                          >
                            {getPasswordStrength(password).label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmar senha</Label>
                    <div className="relative">
                      <Input
                        id="confirm-password"
                        type={showConfirm ? "text" : "password"}
                        placeholder="Repita a senha"
                        required
                        autoComplete="new-password"
                        className="bg-background/50 pr-10"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowConfirm(!showConfirm)}
                        aria-label={
                          showConfirm
                            ? "Esconder confirmação"
                            : "Mostrar confirmação"
                        }
                      >
                        {showConfirm ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-brand-500 py-5 font-semibold text-white hover:bg-brand-600"
                    disabled={
                      isSubmitting || !name.trim() || password.length < 8
                    }
                    aria-busy={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2
                          className="mr-2 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Criando conta...
                      </>
                    ) : (
                      "Criar conta"
                    )}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Uso interno OptSolv · Hackathon 2026
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
