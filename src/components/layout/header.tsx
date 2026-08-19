"use client";

import {
  CalendarDays,
  Hourglass,
  Keyboard,
  LogOut,
  Menu,
  Mic,
  Moon,
  Plus,
  Rss,
  Search,
  Settings,
  Sun,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { WeeklyDigestDialog } from "@/components/ai/digest/WeeklyDigestDialog";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { CommandPalette } from "@/components/layout/command-palette";
import { QuickEntryDialog } from "@/components/layout/quick-entry-dialog";
import { QuickTimerDialog } from "@/components/layout/quick-timer-dialog";
import { ShortcutsCheatsheetModal } from "@/components/layout/ShortcutsCheatsheetModal";
import { VersionBadge } from "@/components/layout/version-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionTooltip } from "@/components/ui/tooltip";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import { useModifierKey } from "@/hooks/use-modifier-key";
import { useOperatorPolicy } from "@/hooks/use-operator-policy";
import { signOut, useSession } from "@/lib/auth-client";
import { useUIStore } from "@/stores/ui.store";
import type { User as UserType } from "@/types/user";

const LOGIN_SUCCESS_TOAST_SESSION_KEY = "auth:show-login-success";

export function Header() {
  const {
    theme,
    timePageDate,
    toggleTheme,
    setMobileSidebarOpen,
    openQuickEntry,
    openQuickTimer,
    openCommandPalette,
    openShortcutsModal,
    openWeeklyDigestModal,
  } = useUIStore();
  const { data: session, isPending } = useSession();
  const user = isPending
    ? null
    : ((session?.user as unknown as UserType) ?? null);
  const currentUser = user;
  const router = useRouter();
  const pathname = usePathname();
  const modifier = useModifierKey();
  const { settings: operatorSettings } = useOperatorPolicy();

  useGlobalShortcuts();

  const [mounted, setMounted] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isPending && !user && !isLoggingOut) {
      router.replace("/login?reason=missing-session");
    }
  }, [isPending, user, isLoggingOut, router]);

  useEffect(() => {
    if (isPending || !user || typeof window === "undefined") {
      return;
    }

    const shouldShowLoginToast =
      window.sessionStorage.getItem(LOGIN_SUCCESS_TOAST_SESSION_KEY) === "1";

    if (!shouldShowLoginToast) {
      return;
    }

    window.sessionStorage.removeItem(LOGIN_SUCCESS_TOAST_SESSION_KEY);
    toast.success("Login realizado com sucesso. Bem-vindo(a)!", {
      id: "auth-login-success",
      duration: 4000,
    });
  }, [isPending, user]);

  const handleLogout = async () => {
    setIsLoggingOut(true);

    const { error } = await signOut();

    if (error) {
      setIsLoggingOut(false);
      toast.error(error.message || "Não foi possível encerrar a sessão.");
      return;
    }

    router.replace("/login?reason=signed-out");
  };

  const openRichQuickEntry = () => {
    const date =
      pathname.startsWith("/dashboard/time") && timePageDate
        ? timePageDate
        : undefined;

    openQuickEntry({
      date,
      source: pathname.startsWith("/dashboard/time") ? "time-header" : "header",
    });
  };

  const openTimerQuickStart = () => {
    openQuickTimer();
  };

  if (isPending || !currentUser) {
    return (
      <header className="sticky top-0 z-30 flex h-16 items-center px-4 md:px-6 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="h-5 w-32 bg-muted/20 animate-pulse rounded-md" />
      </header>
    );
  }

  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6"
      suppressHydrationWarning
    >
      {/* Left: Mobile menu + Breadcrumb */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {mounted ? (
          <Breadcrumb />
        ) : (
          <div className="h-4 w-32 bg-muted/20 animate-pulse rounded-md" />
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Quick entry button */}
        <Button
          size="sm"
          className="hidden gap-1.5 bg-brand-500 text-white hover:bg-brand-600 md:flex"
          aria-label="Novo registro de tempo"
          onClick={openRichQuickEntry}
        >
          <Plus className="h-4 w-4" />
          Novo Registro
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="hidden gap-1.5 md:flex"
          aria-label="Novo registro com timer"
          onClick={openTimerQuickStart}
        >
          <Hourglass className="h-4 w-4" />
          Com Timer
        </Button>

        {/* Mobile: icon-only */}
        <Button
          size="icon"
          className="bg-brand-500 text-white hover:bg-brand-600 md:hidden"
          aria-label="Novo registro de tempo"
          onClick={openRichQuickEntry}
        >
          <Plus className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant="outline"
          className="md:hidden"
          aria-label="Novo registro com timer"
          onClick={openTimerQuickStart}
        >
          <Hourglass className="h-4 w-4" />
        </Button>

        {/* Search */}
        <ActionTooltip
          label="Buscar no sistema"
          shortcut={`${modifier}+K`}
          side="bottom"
        >
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            aria-label={`Buscar (${modifier}+K)`}
            onClick={openCommandPalette}
          >
            <Search className="h-4.5 w-4.5" />
          </Button>
        </ActionTooltip>

        {/* Hands-free Voice Trigger */}
        {operatorSettings.voiceEnabled && (
          <ActionTooltip
            label="Comando de voz hands-free"
            shortcut={`⇧+${modifier}+V`}
            side="bottom"
          >
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex text-orange-500 hover:text-orange-600 hover:bg-orange-500/10 dark:text-orange-400 dark:hover:text-orange-300 dark:hover:bg-orange-500/20"
              aria-label={`Comando de voz hands-free (Shift+${modifier}+V)`}
              onClick={() => {
                window.dispatchEvent(new CustomEvent("timebot:voice"));
              }}
            >
              <Mic className="h-4.5 w-4.5" />
            </Button>
          </ActionTooltip>
        )}

        {/* Weekly AI Digest */}
        <ActionTooltip label="Resumo semanal por IA" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            aria-label="Ver resumo semanal por IA"
            onClick={openWeeklyDigestModal}
          >
            <CalendarDays className="h-4.5 w-4.5" />
          </Button>
        </ActionTooltip>

        {/* Keyboard Shortcuts */}
        <ActionTooltip label="Atalhos de teclado" shortcut="?" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            aria-label="Ver atalhos de teclado (?)"
            onClick={openShortcutsModal}
          >
            <Keyboard className="h-4.5 w-4.5" />
          </Button>
        </ActionTooltip>

        {/* Changelog / Novidades */}
        <ActionTooltip label="Novidades e versões" side="bottom">
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex"
            aria-label="Ver changelog de versões"
            asChild
          >
            <Link href="/dashboard/releases">
              <Rss className="h-4.5 w-4.5" />
            </Link>
          </Button>
        </ActionTooltip>

        {/* Theme toggle */}
        <ActionTooltip
          label={
            mounted
              ? theme === "dark"
                ? "Ativar modo claro"
                : "Ativar modo escuro"
              : "Alterar tema"
          }
          side="bottom"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={
              mounted
                ? theme === "dark"
                  ? "Ativar modo claro"
                  : "Ativar modo escuro"
                : "Alterar tema"
            }
          >
            {mounted ? (
              theme === "dark" ? (
                <Sun className="h-4.5 w-4.5" />
              ) : (
                <Moon className="h-4.5 w-4.5" />
              )
            ) : (
              <Sun className="h-4.5 w-4.5 opacity-50" />
            )}
          </Button>
        </ActionTooltip>

        {/* User menu */}
        {mounted ? (
          <DropdownMenu>
            <ActionTooltip label={`Perfil: ${currentUser.name}`} side="bottom">
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-9 w-9 rounded-full"
                  aria-label="Menu do usuário"
                >
                  <UserAvatar
                    name={currentUser.name}
                    image={currentUser.image}
                    size="default"
                  />
                </Button>
              </DropdownMenuTrigger>
            </ActionTooltip>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {currentUser.name}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {currentUser.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  href="/dashboard/profile"
                  className="flex cursor-pointer items-center gap-2"
                >
                  <User className="h-4 w-4" />
                  Perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/dashboard/settings"
                  className="flex cursor-pointer items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Configurações
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-2"
                onClick={openShortcutsModal}
              >
                <Keyboard className="h-4 w-4" />
                Atalhos de Teclado
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-1 py-1">
                <VersionBadge variant="header-dropdown" />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="h-9 w-9 rounded-full bg-muted/50 animate-pulse" />
        )}
      </div>

      {mounted && (
        <>
          <QuickEntryDialog />
          <QuickTimerDialog />
          <CommandPalette />
          <ShortcutsCheatsheetModal />
          <WeeklyDigestDialog />
        </>
      )}
    </header>
  );
}
