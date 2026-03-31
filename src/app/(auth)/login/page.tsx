"use client";

import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { signIn } from "@/lib/auth-client";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const error = urlParams.get("error");
      const reason = urlParams.get("reason");

      if (error) {
        if (
          error === "unable_to_create_user" ||
          error.includes("optsolv.com.br")
        ) {
          toast.error(
            "Acesso negado. Apenas e-mails do domínio @optsolv.com.br são permitidos.",
            {
              id: "auth-domain-error",
              duration: 6000,
            },
          );
        } else {
          toast.error("Ocorreu um erro na autenticação. Tente novamente.", {
            id: "auth-generic-error",
          });
        }

        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
        return;
      }

      if (reason) {
        if (reason === "inactive-user") {
          toast.error("Sua conta está inativa. Fale com um administrador.", {
            id: "auth-inactive-user",
            duration: 6000,
          });
        } else if (reason === "missing-session") {
          toast.error(
            "O login foi concluído, mas a sessão não foi reconhecida pela aplicação.",
            {
              id: "auth-missing-session",
              duration: 6000,
            },
          );
        }

        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn.email({
      email,
      password,
      callbackURL: "/dashboard",
    });

    if (error) {
      toast.error(error.message || "Erro ao fazer login");
      setIsLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setIsLoading(true);

    const { error } = await signIn.social({
      provider: "microsoft",
      callbackURL: "/dashboard",
    });

    if (error) {
      toast.error(error.message || "Erro ao tentar login com Microsoft");
      setIsLoading(false);
    }
  };

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
          {/* Logo */}
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
            <CardDescription className="mt-1.5">
              Entre com sua conta para continuar
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Microsoft SSO */}
          <Button
            variant="outline"
            className="w-full gap-2.5 border-border/50 py-5 text-sm font-medium"
            onClick={handleMicrosoftLogin}
            disabled={isLoading}
          >
            <svg className="h-5 w-5" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Entrar com Microsoft
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          {/* Email/Password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@optsolv.com"
                required
                autoComplete="email"
                className="bg-background/50"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <Link
                  href="#"
                  className="text-xs text-brand-500 hover:text-brand-400"
                >
                  Esqueceu a senha?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="bg-background/50 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                >
                  {showPassword ? (
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
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground">
            Uso interno OptSolv · Hackathon 2026
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
