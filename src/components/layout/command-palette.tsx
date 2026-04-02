"use client";

import {
  BarChart3,
  CheckSquare,
  Clock,
  Folder,
  Home,
  Hourglass,
  Layers,
  Lightbulb,
  Link2,
  Moon,
  Plus,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useUIStore } from "@/stores/ui.store";

const navigationItems = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Registrar Tempo", href: "/dashboard/time", icon: Clock },
  { name: "Timesheets", href: "/dashboard/timesheets", icon: Layers },
  { name: "Projetos", href: "/dashboard/projects", icon: Folder },
  { name: "Relatórios", href: "/dashboard/reports", icon: BarChart3 },
  { name: "Integrações", href: "/dashboard/integrations", icon: Link2 },
  { name: "Sugestões", href: "/dashboard/suggestions", icon: Lightbulb },
];

const managementItems = [
  {
    name: "Aprovações",
    href: "/dashboard/timesheets/approvals",
    icon: CheckSquare,
  },
  { name: "Horas da Equipe", href: "/dashboard/team-hours", icon: Clock },
  { name: "Equipe", href: "/dashboard/people", icon: Users },
  { name: "Configurações", href: "/dashboard/settings", icon: Settings },
];

export function CommandPalette() {
  const {
    commandPaletteOpen,
    closeCommandPalette,
    openQuickEntry,
    openQuickTimer,
    theme,
    toggleTheme,
  } = useUIStore();
  const router = useRouter();

  // Global keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        useUIStore.getState().commandPaletteOpen
          ? closeCommandPalette()
          : useUIStore.getState().openCommandPalette();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeCommandPalette]);

  const navigate = (href: string) => {
    closeCommandPalette();
    router.push(href);
  };

  const handleNewEntry = () => {
    closeCommandPalette();
    openQuickEntry();
  };

  const handleNewTimerEntry = () => {
    closeCommandPalette();
    openQuickTimer();
  };

  const handleToggleTheme = () => {
    closeCommandPalette();
    toggleTheme();
  };

  return (
    <CommandDialog
      open={commandPaletteOpen}
      onOpenChange={(open) => !open && closeCommandPalette()}
      title="Paleta de comandos"
      description="Pesquise por páginas ou ações"
    >
      <CommandInput placeholder="Pesquisar..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        <CommandGroup heading="Ações rápidas">
          <CommandItem onSelect={handleNewEntry}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Registro de Tempo
          </CommandItem>
          <CommandItem onSelect={handleNewTimerEntry}>
            <Hourglass className="mr-2 h-4 w-4" />
            Novo Registro com Timer
          </CommandItem>
          <CommandItem onSelect={handleToggleTheme}>
            {theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            {theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navegação">
          {navigationItems.map((item) => (
            <CommandItem key={item.href} onSelect={() => navigate(item.href)}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Gestão">
          {managementItems.map((item) => (
            <CommandItem key={item.href} onSelect={() => navigate(item.href)}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
