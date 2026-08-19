"use client";

import { ArrowUpRight, Keyboard, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useModifierKey } from "@/hooks/use-modifier-key";
import { OPERATOR_SETTINGS_PATH } from "@/lib/ai/operator/routes";

interface ShortcutGroup {
  label: string;
  items: Array<{ keys: string[]; description: string }>;
}

function buildGroups(modifier: string): ShortcutGroup[] {
  return [
    {
      label: "Painel",
      items: [
        { keys: [modifier, "J"], description: "Abrir ou fechar o TimeBot" },
        {
          keys: [modifier, "Shift", "F"],
          description: "Alternar tela cheia",
        },
        { keys: ["Esc"], description: "Sair da tela cheia ou fechar" },
        {
          keys: ["Arrastar", "borda"],
          description: "Redimensionar o painel (duplo clique restaura)",
        },
      ],
    },
    {
      label: "Conversa",
      items: [
        { keys: [modifier, "Shift", "O"], description: "Nova conversa" },
        {
          keys: [modifier, "Shift", "H"],
          description: "Mostrar ou ocultar o histórico",
        },
        {
          keys: [modifier, "Shift", "E"],
          description: "Exportar a conversa em Markdown",
        },
        { keys: [modifier, "/"], description: "Ver estes atalhos" },
      ],
    },
    {
      label: "Operador",
      items: [
        {
          keys: [modifier, "Shift", "V"],
          description: "Abrir o comando por voz (mãos-livres)",
        },
        {
          keys: ["Esc"],
          description: "Fechar o modo de voz",
        },
      ],
    },
    {
      label: "Modo Foco",
      items: [
        {
          keys: [modifier, "Shift", "L"],
          description: "Abrir ou minimizar o Modo Foco",
        },
        { keys: ["Espaço"], description: "Pausar ou retomar o Pomodoro" },
        { keys: ["S"], description: "Pular para a próxima etapa" },
        { keys: ["R"], description: "Reiniciar a etapa atual" },
        { keys: ["M"], description: "Silenciar ou ativar o som ambiente" },
      ],
    },
    {
      label: "Mensagem",
      items: [
        { keys: ["Enter"], description: "Enviar" },
        { keys: ["Shift", "Enter"], description: "Quebrar linha" },
        { keys: ["/"], description: "Abrir a paleta de comandos" },
        { keys: ["↑", "↓"], description: "Navegar entre os comandos" },
      ],
    },
  ];
}

export interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs before the dialog links away, so the host surface can step aside. */
  onNavigateAway?: () => void;
}

/** Keyboard reference for power users of the assistant. */
export function ShortcutsHelp({
  open,
  onOpenChange,
  onNavigateAway,
}: ShortcutsHelpProps) {
  const modifier = useModifierKey();
  const groups = buildGroups(modifier);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[10001] max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-sora">
            <Keyboard className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Atalhos do TimeBot
          </DialogTitle>
          <DialogDescription>
            Trabalhe mais rápido sem tirar as mãos do teclado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 font-medium text-[11px] text-neutral-500 uppercase tracking-wide dark:text-neutral-400">
                {group.label}
              </p>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li
                    key={item.description}
                    className="flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-900"
                  >
                    <span className="text-neutral-600 dark:text-neutral-300">
                      {item.description}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {item.keys.map((key) => (
                        <kbd
                          key={key}
                          className="rounded-md border border-border/60 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600 shadow-sm dark:border-white/10 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Link
          href={OPERATOR_SETTINGS_PATH}
          onClick={() => {
            onOpenChange(false);
            onNavigateAway?.();
          }}
          className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs transition-colors hover:border-orange-500/40 hover:bg-orange-500/5 dark:border-white/10"
        >
          <span className="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
            <SlidersHorizontal
              className="h-4 w-4 text-orange-500"
              aria-hidden="true"
            />
            Configurar o Operador IA
          </span>
          <ArrowUpRight
            className="h-3.5 w-3.5 shrink-0 text-neutral-400"
            aria-hidden="true"
          />
        </Link>
      </DialogContent>
    </Dialog>
  );
}
