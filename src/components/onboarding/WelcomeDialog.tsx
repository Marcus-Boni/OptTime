"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  type Clock,
  Compass,
  Radar,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserRole } from "@/types/user";

export interface WelcomeDialogProps {
  open: boolean;
  /** First name, used to make the greeting personal. Empty is fine. */
  userName: string;
  role: UserRole;
  /** Total minutes of the welcome tour, shown on the primary action. */
  tourMinutes: number;
  onStartTour: () => void;
  onExploreAlone: () => void;
}

interface Highlight {
  icon: typeof Clock;
  title: string;
  description: string;
}

const BASE_HIGHLIGHTS: Highlight[] = [
  {
    icon: Timer,
    title: "Registre em menos de 2 minutos por dia",
    description:
      "Timer em tempo real, lançamento rápido e preenchimento assistido por IA.",
  },
  {
    icon: Bot,
    title: "Peça em português",
    description:
      "O TimeBot lança horas, resume sua semana e responde dúvidas do produto.",
  },
  {
    icon: Trophy,
    title: "Constância, não horas extras",
    description:
      "Sua jornada premia registrar em dia e com equilíbrio — nunca trabalhar mais.",
  },
];

const LEADERSHIP_HIGHLIGHT: Highlight = {
  icon: Radar,
  title: "Central de Gestão para o seu time",
  description:
    "Risco por projeto, capacidade da equipe e aprovação de timesheets em lote.",
};

function getHighlights(role: UserRole): Highlight[] {
  if (role === "manager" || role === "admin") {
    return [...BASE_HIGHLIGHTS.slice(0, 2), LEADERSHIP_HIGHLIGHT];
  }
  return BASE_HIGHLIGHTS;
}

/**
 * First-run welcome.
 *
 * Deliberately offers a way out: someone who prefers to poke around should not
 * be trapped in a tour. Either path marks the welcome as seen, and the tour
 * stays available from the help menu forever.
 */
export function WelcomeDialog({
  open,
  userName,
  role,
  tourMinutes,
  onStartTour,
  onExploreAlone,
}: WelcomeDialogProps) {
  const prefersReducedMotion = useReducedMotion();
  const highlights = getHighlights(role);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onExploreAlone();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-[560px] overflow-hidden border-brand-500/20 p-0 sm:max-w-[560px]"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-500/15 via-brand-500/5 to-transparent px-6 pt-7 pb-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl"
          />

          <motion.div
            initial={
              prefersReducedMotion ? false : { opacity: 0, scale: 0.9, y: 8 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 shadow-lg shadow-brand-500/30"
          >
            <Image
              src="/logo-white.svg"
              alt=""
              width={20}
              height={30}
              aria-hidden="true"
            />
          </motion.div>

          <DialogTitle className="relative mt-4 font-display text-2xl font-bold leading-tight text-foreground">
            Bem-vindo(a) ao OptSolv Time
            {userName ? `, ${userName}` : ""}
          </DialogTitle>

          <DialogDescription className="relative mt-2 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
            Este é o lugar onde as horas da OptSolv viram informação confiável.
            Podemos te mostrar o caminho em {tourMinutes} minutos.
          </DialogDescription>
        </div>

        <div className="space-y-3 px-6 pt-1">
          {highlights.map((highlight, index) => (
            <motion.div
              key={highlight.title}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: prefersReducedMotion ? 0 : 0.08 * (index + 1),
                duration: 0.35,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/25 p-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                <highlight.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {highlight.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {highlight.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col gap-2 px-6 pt-4 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="order-2 flex items-center gap-1.5 text-[11px] text-muted-foreground sm:order-1">
            <Sparkles className="h-3 w-3 text-brand-500" aria-hidden="true" />
            Você pode refazer o tour quando quiser, no menu de ajuda.
          </p>

          <div className="order-1 flex gap-2 sm:order-2">
            <Button variant="ghost" size="sm" onClick={onExploreAlone}>
              Explorar sozinho
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
              onClick={onStartTour}
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              Fazer o tour
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default WelcomeDialog;
