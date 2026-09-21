"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  RotateCcw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SlideCover } from "@/components/portal/presentation/SlideCover";
import { SlideHighlights } from "@/components/portal/presentation/SlideHighlights";
import { SlideMetrics } from "@/components/portal/presentation/SlideMetrics";
import { SlideNextSteps } from "@/components/portal/presentation/SlideNextSteps";
import { SlideTeam } from "@/components/portal/presentation/SlideTeam";
import type {
  PresentationDeckProps,
  SlideMeta,
} from "@/components/portal/presentation/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SLIDES_META: SlideMeta[] = [
  {
    id: "cover",
    index: 0,
    title: "Capa Executiva",
    shortTitle: "Capa",
  },
  {
    id: "highlights",
    index: 1,
    title: "Destaques do Ciclo",
    shortTitle: "Entregas",
  },
  {
    id: "metrics",
    index: 2,
    title: "Indicadores & Ritmo",
    shortTitle: "Métricas",
  },
  {
    id: "team",
    index: 3,
    title: "Equipe do Projeto",
    shortTitle: "Equipe",
  },
  {
    id: "next_steps",
    index: 4,
    title: "Próximos Passos & Governança",
    shortTitle: "Próximos Passos",
  },
];

export function PresentationDeck({ snapshot, onClose }: PresentationDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const isDeliverablesMode = snapshot.portalType === "deliverables";

  const currentSlide = SLIDES_META[currentIndex];

  const goToSlide = useCallback((index: number) => {
    if (index >= 0 && index < SLIDES_META.length) {
      setCurrentIndex(index);
    }
  }, []);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, SLIDES_META.length - 1));
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const restartDeck = useCallback(() => {
    setCurrentIndex(0);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen API may be blocked in some iframe contexts; fail gracefully
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Ignore if user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
        case " ":
        case "PageDown":
          event.preventDefault();
          nextSlide();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          event.preventDefault();
          prevSlide();
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        case "f":
        case "F":
          event.preventDefault();
          void toggleFullscreen();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5": {
          const targetIndex = Number(event.key) - 1;
          goToSlide(targetIndex);
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide, onClose, toggleFullscreen, goToSlide]);

  // Sync fullscreen change from browser (e.g. F11 or user pressed ESC to leave fullscreen)
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Lock body scroll while in presentation mode
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Slide transition animation
  const slideVariants = useMemo(() => {
    if (prefersReducedMotion) {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      };
    }
    return {
      initial: { opacity: 0, x: 30 },
      animate: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
      },
      exit: {
        opacity: 0,
        x: -30,
        transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
      },
    };
  }, [prefersReducedMotion]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Apresentação Executiva: ${snapshot.projectName}`}
      className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden select-none"
    >
      {/* Top Floating Controls Bar */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 py-4 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <Badge
            variant="outline"
            className="border-white/10 bg-neutral-900/80 backdrop-blur-md text-neutral-300 font-mono text-[11px] px-2.5 py-1"
          >
            {currentIndex + 1} / {SLIDES_META.length} · {currentSlide.title}
          </Badge>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia (F)"}
            className="rounded-full border border-white/10 bg-neutral-900/80 text-neutral-300 hover:bg-white/10 hover:text-white backdrop-blur-md"
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-4" aria-hidden="true" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Fechar apresentação (ESC)"
            className="rounded-full border border-white/10 bg-neutral-900/80 text-neutral-300 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 backdrop-blur-md"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      {/* Main Slide Stage */}
      <main className="relative flex-1 size-full overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentIndex}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="size-full"
          >
            {currentIndex === 0 ? (
              <SlideCover
                snapshot={snapshot}
                isDeliverablesMode={isDeliverablesMode}
              />
            ) : currentIndex === 1 ? (
              <SlideHighlights
                snapshot={snapshot}
                isDeliverablesMode={isDeliverablesMode}
              />
            ) : currentIndex === 2 ? (
              <SlideMetrics
                snapshot={snapshot}
                isDeliverablesMode={isDeliverablesMode}
              />
            ) : currentIndex === 3 ? (
              <SlideTeam
                snapshot={snapshot}
                isDeliverablesMode={isDeliverablesMode}
              />
            ) : (
              <SlideNextSteps
                snapshot={snapshot}
                isDeliverablesMode={isDeliverablesMode}
                onRestart={restartDeck}
                onClose={onClose}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Floating Navigation Dock */}
      <nav
        aria-label="Navegação dos slides"
        className="absolute bottom-6 inset-x-0 z-20 flex justify-center px-4 pointer-events-none"
      >
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-neutral-900/90 p-2 shadow-2xl backdrop-blur-xl ring-1 ring-white/10 pointer-events-auto">
          {/* Previous button */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={prevSlide}
            disabled={currentIndex === 0}
            aria-label="Slide anterior"
            className="rounded-full text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>

          {/* Segmented Story Progress Pills */}
          <div className="flex items-center gap-1.5 px-1">
            {SLIDES_META.map((slide) => {
              const isActive = slide.index === currentIndex;
              const isPast = slide.index < currentIndex;

              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => goToSlide(slide.index)}
                  aria-label={`Ir para slide ${slide.index + 1}: ${slide.title}`}
                  aria-current={isActive ? "step" : undefined}
                  className={`group relative h-2 rounded-full transition-all duration-300 ${
                    isActive
                      ? "w-8 bg-brand-500 shadow-sm shadow-brand-500/50"
                      : isPast
                        ? "w-3 bg-neutral-500 hover:bg-neutral-400"
                        : "w-3 bg-neutral-800 hover:bg-neutral-600"
                  }`}
                />
              );
            })}
          </div>

          {/* Current slide label */}
          <span className="hidden sm:inline-block px-2 font-display text-xs font-medium text-neutral-300">
            {currentSlide.shortTitle}
          </span>

          {/* Next button */}
          {currentIndex < SLIDES_META.length - 1 ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={nextSlide}
              aria-label="Próximo slide"
              className="rounded-full text-neutral-300 hover:text-white hover:bg-white/10"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={restartDeck}
              aria-label="Reiniciar apresentação"
              className="rounded-full text-brand-400 hover:text-brand-300 hover:bg-brand-500/10"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </nav>
    </div>
  );
}
