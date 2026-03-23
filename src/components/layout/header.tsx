"use client";

import {
  LogOut,
  Menu,
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
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { CommandPalette } from "@/components/layout/command-palette";
import { QuickEntryDialog } from "@/components/layout/quick-entry-dialog";
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
import { signOut, useSession } from "@/lib/auth-client";
import { MOCK_CURRENT_USER } from "@/lib/mock-data";
import { useUIStore } from "@/stores/ui.store";
import type { User as UserType } from "@/types/user";
export function Header() {
  const {
    theme,
    timePageDate,
    toggleTheme,
    setMobileSidebarOpen,
    openQuickEntry,
    openCommandPalette,
  } = useUIStore();
  const { data: session, isPending } = useSession();
  const user = isPending
    ? null
    : ((session?.user as unknown as UserType) ?? null);
  const isManager =
    !isPending && (user?.role === "manager" || user?.role === "admin");
  const currentUser = user || MOCK_CURRENT_USER;
  const router = useRouter();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/");
        },
      },
    });
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

        {/* Mobile: icon-only */}
        <Button
          size="icon"
          className="bg-brand-500 text-white hover:bg-brand-600 md:hidden"
          aria-label="Novo registro de tempo"
          onClick={openRichQuickEntry}
        >
          <Plus className="h-4 w-4" />
        </Button>

        {/* Search */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex"
          aria-label="Buscar (Ctrl+K)"
          onClick={openCommandPalette}
        >
          <Search className="h-4.5 w-4.5" />
        </Button>

        {/* Theme toggle */}
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

        {/* User menu */}
        {mounted ? (
          <DropdownMenu>
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
              {isManager && (
                <DropdownMenuItem asChild>
                  <Link
                    href="/dashboard/settings"
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Configurações
                  </Link>
                </DropdownMenuItem>
              )}
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
          <CommandPalette />
        </>
      )}
    </header>
  );
}
