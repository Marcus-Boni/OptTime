"use client";

import {
  BookOpen,
  Bot,
  CalendarDays,
  CheckSquare,
  Clock,
  Compass,
  FileText,
  Folder,
  Home,
  Hourglass,
  Keyboard,
  Layers,
  Lightbulb,
  Mic,
  Moon,
  Plus,
  Radar,
  Send,
  Settings,
  Sparkles,
  Sun,
  Trophy,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useModifierKey } from "@/hooks/use-modifier-key";
import { OPERATOR_SETTINGS_PATH } from "@/lib/ai/operator/routes";
import { queueVoiceCommand } from "@/lib/ai/operator/voice-events";
import { ONBOARDING_HUB_PATH } from "@/lib/onboarding/routes";
import { playEarcon } from "@/lib/sound/sound-effects";
import { useFocusStore } from "@/stores/focus.store";
import { startTour } from "@/stores/onboarding.store";
import { useUIStore } from "@/stores/ui.store";

export function CommandPalette() {
  const {
    commandPaletteOpen,
    closeCommandPalette,
    openQuickEntry,
    openQuickTimer,
    openShortcutsModal,
    openWeeklyDigestModal,
    theme,
    toggleTheme,
  } = useUIStore();

  const [query, setQuery] = useState("");
  const router = useRouter();
  const modifier = useModifierKey();

  // Global keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (useUIStore.getState().commandPaletteOpen) {
          closeCommandPalette();
        } else {
          useUIStore.getState().openCommandPalette();
        }
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
    playEarcon("action_success");
    openQuickEntry();
  };

  const handleNewTimerEntry = () => {
    closeCommandPalette();
    playEarcon("action_success");
    openQuickTimer();
  };

  const handleToggleTheme = () => {
    closeCommandPalette();
    toggleTheme();
  };

  const handleFocusMode = (presetMinutes?: number) => {
    closeCommandPalette();
    playEarcon("timer_start");
    const focus = useFocusStore.getState();
    if (presetMinutes) {
      focus.updateSettings({ focusMinutes: presetMinutes });
    }
    if (focus.session) focus.open();
    else focus.startSession();
  };

  const handleOpenDigest = () => {
    closeCommandPalette();
    openWeeklyDigestModal();
  };

  const handleOpenShortcuts = () => {
    closeCommandPalette();
    openShortcutsModal();
  };

  const handleStartWelcomeTour = () => {
    closeCommandPalette();
    startTour("welcome");
  };

  const handleAskTimeBot = () => {
    if (!query.trim()) return;
    const text = query.trim();
    closeCommandPalette();
    playEarcon("action_success");
    queueVoiceCommand(text);
    // Notify any active panel or widget to open
    window.dispatchEvent(new CustomEvent("timebot:open"));
  };

  const trimmedQuery = query.trim();

  return (
    <CommandDialog
      open={commandPaletteOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeCommandPalette();
          setQuery("");
        }
      }}
      title="Paleta de comandos"
      description="Pesquise por páginas, execute ações ou converse com a IA"
    >
      <CommandInput
        placeholder="Digite um comando, página ou pergunte algo ao TimeBot..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {trimmedQuery ? (
            <div className="py-2 text-center">
              <p className="text-muted-foreground text-xs">
                Nenhum menu corresponde à busca.
              </p>
              <button
                type="button"
                onClick={handleAskTimeBot}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400 transition-colors hover:bg-orange-500/20"
              >
                <Bot className="size-3.5" />
                Pedir para o TimeBot: &ldquo;{trimmedQuery}&rdquo;
              </button>
            </div>
          ) : (
            "Nenhum resultado encontrado."
          )}
        </CommandEmpty>

        {/* Dynamic AI Prompt trigger when user enters free text */}
        {trimmedQuery.length > 2 && (
          <>
            <CommandGroup heading="Assistente de IA">
              <CommandItem
                onSelect={handleAskTimeBot}
                className="text-orange-400"
              >
                <Send className="mr-2 h-4 w-4" />
                <span className="flex-1 truncate">
                  Perguntar ao TimeBot: &ldquo;{trimmedQuery}&rdquo;
                </span>
                <kbd className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 font-mono text-[10px] text-orange-400">
                  Enter
                </kbd>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Ações Rápidas">
          <CommandItem onSelect={handleNewEntry}>
            <Plus className="mr-2 h-4 w-4 text-orange-500" />
            <span className="flex-1">Novo Registro de Tempo</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              N
            </kbd>
          </CommandItem>

          <CommandItem onSelect={handleNewTimerEntry}>
            <Hourglass className="mr-2 h-4 w-4 text-orange-500" />
            <span className="flex-1">Iniciar Timer com Projeto</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              T
            </kbd>
          </CommandItem>

          <CommandItem onSelect={() => handleFocusMode(25)}>
            <Sparkles className="mr-2 h-4 w-4 text-orange-500" />
            <span className="flex-1">Iniciar Bloco de Foco (25 min)</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              F
            </kbd>
          </CommandItem>

          <CommandItem onSelect={handleOpenDigest}>
            <CalendarDays className="mr-2 h-4 w-4 text-orange-500" />
            <span className="flex-1">Ver Resumo Semanal por IA</span>
          </CommandItem>

          <CommandItem onSelect={handleToggleTheme}>
            {theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4 text-neutral-400" />
            ) : (
              <Moon className="mr-2 h-4 w-4 text-neutral-400" />
            )}
            <span className="flex-1">
              {theme === "dark" ? "Ativar Modo Claro" : "Ativar Modo Escuro"}
            </span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Assistente de IA & Voz">
          <CommandItem
            onSelect={() => {
              closeCommandPalette();
              // Trigger hands-free voice overlay shortcut simulation or event
              window.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "v",
                  shiftKey: true,
                  metaKey: true,
                  ctrlKey: true,
                }),
              );
            }}
          >
            <Mic className="mr-2 h-4 w-4 text-orange-400" />
            <span className="flex-1">Ativar Comando de Voz (Hands-free)</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              ⇧ {modifier} V
            </kbd>
          </CommandItem>

          <CommandItem
            onSelect={() => {
              closeCommandPalette();
              window.dispatchEvent(new CustomEvent("timebot:open"));
            }}
          >
            <Bot className="mr-2 h-4 w-4 text-orange-400" />
            <span className="flex-1">Abrir TimeBot Chat</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              {modifier} J
            </kbd>
          </CommandItem>

          <CommandItem onSelect={() => navigate(OPERATOR_SETTINGS_PATH)}>
            <Settings className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Configurações de IA, Voz & Autonomia</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ajuda & Onboarding">
          <CommandItem onSelect={handleStartWelcomeTour}>
            <Compass className="mr-2 h-4 w-4 text-orange-400" />
            <span className="flex-1">Iniciar Tour Guiado de Boas-Vindas</span>
          </CommandItem>

          <CommandItem onSelect={() => navigate(ONBOARDING_HUB_PATH)}>
            <BookOpen className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">
              Central de Ajuda · Tours & Primeiros Passos
            </span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navegação">
          <CommandItem onSelect={() => navigate("/dashboard")}>
            <Home className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Dashboard</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              G D
            </kbd>
          </CommandItem>

          <CommandItem onSelect={() => navigate("/dashboard/time")}>
            <Clock className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Registrar Tempo</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              G T
            </kbd>
          </CommandItem>

          <CommandItem
            onSelect={() => navigate("/dashboard/time?view=timesheets")}
          >
            <Layers className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Timesheets & Submissões</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              G S
            </kbd>
          </CommandItem>

          <CommandItem onSelect={() => navigate("/dashboard/journey")}>
            <Trophy className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">
              Minha Jornada · Conquistas & Insights
            </span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              G J
            </kbd>
          </CommandItem>

          <CommandItem onSelect={() => navigate("/dashboard/projects")}>
            <Folder className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Projetos</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              G P
            </kbd>
          </CommandItem>

          <CommandItem onSelect={() => navigate("/dashboard/reports")}>
            <FileText className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Relatórios & Exportação</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              G R
            </kbd>
          </CommandItem>

          <CommandItem onSelect={() => navigate("/dashboard/suggestions")}>
            <Lightbulb className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">
              Sugestões Inteligentes do Azure DevOps
            </span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Gestão & Configuração">
          <CommandItem onSelect={() => navigate("/dashboard/hq")}>
            <Radar className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Central de Gestão</span>
          </CommandItem>

          <CommandItem
            onSelect={() => navigate("/dashboard/timesheets/approvals")}
          >
            <CheckSquare className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Aprovações de Equipe</span>
          </CommandItem>

          <CommandItem onSelect={() => navigate("/dashboard/team-hours")}>
            <Clock className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Horas da Equipe</span>
          </CommandItem>

          <CommandItem onSelect={() => navigate("/dashboard/people")}>
            <Users className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Pessoas & Colaboradores</span>
          </CommandItem>

          <CommandItem onSelect={() => navigate("/dashboard/settings")}>
            <Settings className="mr-2 h-4 w-4 text-neutral-400" />
            <span className="flex-1">Configurações Gerais</span>
          </CommandItem>

          <CommandItem onSelect={handleOpenShortcuts}>
            <Keyboard className="mr-2 h-4 w-4 text-orange-400" />
            <span className="flex-1">Atalhos de Teclado</span>
            <kbd className="rounded border border-white/10 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              ?
            </kbd>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export default CommandPalette;
