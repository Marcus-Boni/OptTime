"use client";

import { Menu, Moon, Plus, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { getInitials } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";

export function Header() {
  const { theme, toggleTheme, setMobileSidebarOpen } = useUIStore();
  const { data: session } = useSession();
  const user = session?.user || MOCK_CURRENT_USER;
  const router = useRouter();

  const handleLogout = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/");
        },
      },
    });
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
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

        <Breadcrumb />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Quick entry button */}
        <Button
          size="sm"
          className="hidden gap-1.5 bg-brand-500 text-white hover:bg-brand-600 md:flex"
          aria-label="Novo registro de tempo"
        >
          <Plus className="h-4 w-4" />
          Novo Registro
        </Button>

        {/* Mobile: icon-only */}
        <Button
          size="icon"
          className="bg-brand-500 text-white hover:bg-brand-600 md:hidden"
          aria-label="Novo registro de tempo"
        >
          <Plus className="h-4 w-4" />
        </Button>

        {/* Search */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex"
          aria-label="Buscar"
        >
          <Search className="h-4.5 w-4.5" />
        </Button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={
            theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"
          }
        >
          {theme === "dark" ? (
            <Sun className="h-4.5 w-4.5" />
          ) : (
            <Moon className="h-4.5 w-4.5" />
          )}
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 w-9 rounded-full"
              aria-label="Menu do usuário"
            >
              <Avatar className="h-8 w-8 border border-border">
                <AvatarFallback className="bg-brand-500/10 text-xs font-semibold text-brand-500">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Perfil</DropdownMenuItem>
            <DropdownMenuItem>Configurações</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleLogout}
            >
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
