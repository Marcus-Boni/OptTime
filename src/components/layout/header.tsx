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
import { ChangelogHeaderButton } from "@/components/layout/ChangelogHeaderButton";
import { CommandPalette } from "@/components/layout/command-palette";
import { QuickEntryDialog } from "@/components/layout/quick-entry-dialog";
import { QuickTimerDialog } from "@/components/layout/quick-timer-dialog";
import { ShortcutsCheatsheetModal } from "@/components/layout/ShortcutsCheatsheetModal";
import { HelpMenu } from "@/components/onboarding/HelpMenu";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ActionTooltip } from "@/components/ui/tooltip";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import { useModifierKey } from "@/hooks/use-modifier-key";
import { resetOnboardingCache } from "@/hooks/use-onboarding";
import { useOperatorPolicy } from "@/hooks/use-operator-policy";
import { useResolvedTheme } from "@/hooks/use-resolved-theme";
import { signOut, useSession } from "@/lib/auth-client";
import { useUIStore } from "@/stores/ui.store";
import type { User as UserType } from "@/types/user";

const LOGIN_SUCCESS_TOAST_SESSION_KEY = "auth:show-login-success";

export function Header() {
  const {
    timePageDate,
    toggleTheme,
    setMobileSidebarOpen,
    openQuickEntry,
    openQuickTimer,
    openCommandPalette,
    openShortcutsModal,
    openWeeklyDigestModal,
  } = useUIStore();
  const theme = useResolvedTheme();
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

    // Drop the cached onboarding overview so the next account to sign in on
    // this tab does not briefly see the previous person's progress.
    resetOnboardingCache();
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
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
        <Skeleton className="h-5 w-32 rounded-md" />
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
          <Skeleton className="h-4 w-32 rounded-md" />
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Command Trigger Pill (Componentry / Linear style) */}
        <ActionTooltip
          label="Buscar ou executar comando"
          shortcut={`${modifier}+K`}
          side="bottom"
        >
          <Button
            variant="outline"
            size="sm"
            className="hidden h-9 items-center gap-2.5 rounded-full border-border/60 bg-muted/35 px-3 text-xs font-normal text-muted-foreground hover:border-brand-500/30 hover:bg-muted/65 hover:text-foreground md:inline-flex"
            aria-label={`Buscar (${modifier}+K)`}
            onClick={openCommandPalette}
            data-tour="header-search"
          >
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="hidden xl:inline">Buscar ou executar…</span>
            <kbd className="rounded border border-border/80 bg-background/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground shadow-2xs">
              {modifier}K
            </kbd>
          </Button>
        </ActionTooltip>

        {/* Quick entry button */}
        <Button
          size="sm"
          className="hidden gap-1.5 rounded-full bg-brand-500 px-3.5 text-white hover:bg-brand-600 md:flex"
          aria-label="Novo registro de tempo"
          onClick={openRichQuickEntry}
          data-tour="header-quick-entry"
        >
          <Plus className="h-4 w-4" />
          Novo Registro
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="hidden gap-1.5 rounded-full px-3.5 md:flex"
          aria-label="Novo registro com timer"
          onClick={openTimerQuickStart}
          data-tour="header-quick-timer"
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

        {/* Unified Utility Capsule */}
        <div className="flex items-center gap-0.5 rounded-full border border-border/50 bg-muted/25 p-0.5">
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
                className="hidden size-8 rounded-full text-orange-500 hover:bg-orange-500/10 hover:text-orange-600 md:flex dark:text-orange-400 dark:hover:bg-orange-500/20 dark:hover:text-orange-300"
                aria-label={`Comando de voz hands-free (Shift+${modifier}+V)`}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("timebot:voice"));
                }}
                data-tour="header-voice"
              >
                <Mic className="h-4 w-4" />
              </Button>
            </ActionTooltip>
          )}

          {/* Weekly AI Digest */}
          <ActionTooltip label="Resumo semanal por IA" side="bottom">
            <Button
              variant="ghost"
              size="icon"
              className="hidden size-8 rounded-full md:flex"
              aria-label="Ver resumo semanal por IA"
              onClick={openWeeklyDigestModal}
              data-tour="header-digest"
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
          </ActionTooltip>

          {/* Keyboard Shortcuts */}
          <ActionTooltip label="Atalhos de teclado" shortcut="?" side="bottom">
            <Button
              variant="ghost"
              size="icon"
              className="hidden size-8 rounded-full md:flex"
              aria-label="Ver atalhos de teclado (?)"
              onClick={openShortcutsModal}
              data-tour="header-shortcuts"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
          </ActionTooltip>

          {/* Changelog / Novidades */}
          <ChangelogHeaderButton />

          {/* Ajuda, tours guiados e atalhos */}
          <HelpMenu role={currentUser.role} />

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
              className="size-8 rounded-full"
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
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )
              ) : (
                <Sun className="h-4 w-4 opacity-50" />
              )}
            </Button>
          </ActionTooltip>
        </div>

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
