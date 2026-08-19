"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Clock,
  Command,
  Compass,
  Keyboard,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useModifierKey } from "@/hooks/use-modifier-key";
import { useUIStore } from "@/stores/ui.store";

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  icon: typeof Keyboard;
  items: ShortcutItem[];
}

export function ShortcutsCheatsheetModal() {
  const { shortcutsModalOpen, closeShortcutsModal } = useUIStore();
  const modifier = useModifierKey();
  const prefersReducedMotion = useReducedMotion();
  const modalRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!shortcutsModalOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeShortcutsModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcutsModalOpen, closeShortcutsModal]);

  const sections: ShortcutSection[] = [
    {
      title: "Geral & Paleta",
      icon: Command,
      items: [
        {
          keys: [`${modifier}`, "K"],
          description: "Abrir Paleta de Comandos Universal",
        },
        { keys: ["?"], description: "Abrir este painel de atalhos" },
        { keys: ["Esc"], description: "Fechar modais e painéis" },
      ],
    },
    {
      title: "Assistente de IA & Voz",
      icon: Bot,
      items: [
        {
          keys: [`${modifier}`, "J"],
          description: "Abrir / Fechar TimeBot AI",
        },
        {
          keys: [modifier, "Shift", "V"],
          description: "Comando de voz hands-free",
        },
      ],
    },
    {
      title: "Registro de Tempo",
      icon: Clock,
      items: [
        { keys: ["N"], description: "Novo lançamento rápido de horas" },
        { keys: ["T"], description: "Novo timer com projeto" },
      ],
    },
    {
      title: "Modo Foco & Pomodoro",
      icon: Sparkles,
      items: [
        { keys: ["F"], description: "Abrir / Iniciar Modo Foco Pomodoro" },
        {
          keys: [modifier, "Shift", "L"],
          description: "Atalho direto do Modo Foco",
        },
        {
          keys: ["Espaço"],
          description: "Pausar / Retomar foco (na tela de foco)",
        },
        { keys: ["S"], description: "Pular para próxima etapa" },
        { keys: ["M"], description: "Ligar / Mudar som ambiente" },
      ],
    },
    {
      title: "Navegação Rápida",
      icon: Compass,
      items: [
        { keys: ["G", "D"], description: "Ir para Dashboard" },
        { keys: ["G", "T"], description: "Ir para Registro de Tempo" },
        { keys: ["G", "S"], description: "Ir para Timesheets" },
        { keys: ["G", "P"], description: "Ir para Projetos" },
        { keys: ["G", "R"], description: "Ir para Relatórios" },
      ],
    },
  ];

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {shortcutsModalOpen && (
        <div className="fixed inset-0 z-[10010] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeShortcutsModal}
            className="absolute inset-0 bg-black/60 backdrop-blur-md dark:bg-neutral-950/80"
          />

          {/* Modal Container */}
          <motion.div
            ref={modalRef}
            initial={
              prefersReducedMotion
                ? undefined
                : { opacity: 0, scale: 0.95, y: 10 }
            }
            animate={
              prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              prefersReducedMotion
                ? undefined
                : { opacity: 0, scale: 0.95, y: 10 }
            }
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Atalhos de teclado"
            className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl shadow-black/20 dark:border-white/10 dark:bg-neutral-900 dark:shadow-black/60"
          >
            {/* Header */}
            <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 dark:text-orange-400">
                  <Keyboard className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-semibold font-sora text-base text-neutral-900 dark:text-white">
                    Atalhos de Teclado
                  </h2>
                  <p className="text-neutral-500 text-xs dark:text-neutral-400">
                    Navegue e execute ações com a velocidade do Linear
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={closeShortcutsModal}
                aria-label="Fechar atalhos de teclado"
                className="size-8 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              >
                <X className="size-4" />
              </Button>
            </header>

            {/* Content List */}
            <div className="grid grid-cols-1 gap-6 overflow-y-auto p-6 md:grid-cols-2">
              {sections.map((section) => (
                <div key={section.title} className="space-y-3">
                  <div className="flex items-center gap-1.5 font-medium text-neutral-600 text-xs uppercase tracking-wider dark:text-neutral-400">
                    <section.icon
                      className="size-3.5 text-orange-500"
                      aria-hidden="true"
                    />
                    <span>{section.title}</span>
                  </div>

                  <div className="space-y-2">
                    {section.items.map((item) => (
                      <div
                        key={item.description}
                        className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200/80 bg-neutral-50 px-3 py-2 text-xs dark:border-white/5 dark:bg-neutral-800/50"
                      >
                        <span className="text-neutral-700 dark:text-neutral-300">
                          {item.description}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          {item.keys.map((k) => (
                            <kbd
                              key={k}
                              className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-800 shadow-xs dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-300"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Tip */}
            <footer className="border-t border-neutral-200 bg-neutral-50 px-6 py-3 text-center text-neutral-500 text-xs dark:border-white/10 dark:bg-neutral-950/60 dark:text-neutral-400">
              Pressione{" "}
              <kbd className="rounded border border-neutral-300 bg-neutral-200/80 px-1 py-0.5 font-mono text-[10px] text-neutral-800 dark:border-white/15 dark:bg-neutral-800 dark:text-neutral-300">
                ?
              </kbd>{" "}
              a qualquer momento para abrir este painel.
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default ShortcutsCheatsheetModal;
