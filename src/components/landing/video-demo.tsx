"use client";

import type { PlayerRef } from "@remotion/player";
import { motion } from "framer-motion";
import { Check, Pause, Play, RotateCcw, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import type { ShowcaseComposition } from "./RemotionPlayerWrapper";

/** Lazy-load the Remotion Player — avoids SSR issues */
const RemotionPlayerWrapper = dynamic(
  () => import("./RemotionPlayerWrapper").then((m) => m.RemotionPlayerWrapper),
  { ssr: false },
);

interface VideoDemoProps {
  /** If provided, renders a native <video> with the pre-rendered MP4 */
  mp4Src?: string;
  poster?: string;
}

export function VideoDemo({ mp4Src, poster }: VideoDemoProps) {
  const [composition, setComposition] = useState<ShowcaseComposition>("demo");
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const playerRef = useRef<PlayerRef>(null);

  const durationText = composition === "demo" ? "1:30" : "1:10";

  const handlePlay = useCallback(() => {
    setHasStarted(true);
    setIsPlaying(true);
    playerRef.current?.play();
  }, []);

  const handleToggle = useCallback(() => {
    if (isPlaying) {
      playerRef.current?.pause();
      setIsPlaying(false);
    } else {
      playerRef.current?.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleRestart = useCallback(() => {
    playerRef.current?.seekTo(0);
    playerRef.current?.play();
    setIsPlaying(true);
  }, []);

  const handleSelectComposition = (newComp: ShowcaseComposition) => {
    if (newComp === composition) return;
    try {
      playerRef.current?.pause();
      playerRef.current?.seekTo(0);
    } catch (err: unknown) {
      console.error("[VideoDemo] handleSelectComposition:", err);
    }
    setComposition(newComp);
    setHasStarted(false);
    setIsPlaying(false);
  };

  return (
    <section id="video-demo" className="relative py-20 md:py-32">
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-medium text-brand-400">
            <Sparkles className="h-3.5 w-3.5" />
            Demonstração Interativa em Tempo Real
          </div>
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl lg:text-5xl">
            Como funciona em{" "}
            <span className="gradient-text">
              {composition === "demo" ? "90 segundos" : "70 segundos"}
            </span>
          </h2>
          <p className="mt-4 text-base text-white/60">
            {composition === "demo"
              ? "Veja como registrar, submeter e acompanhar horas em menos de 2 minutos por dia."
              : "Conheça as novidades da v1.8: Executive HQ, Magic Reconstructor e Ecossistema Teams."}
          </p>

          {/* Composition Switcher Tabs */}
          <div className="mt-6 flex justify-center">
            <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1 backdrop-blur-md">
              <button
                type="button"
                onClick={() => handleSelectComposition("demo")}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                  composition === "demo"
                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Visão Geral Oficial (90s)
              </button>
              <button
                type="button"
                onClick={() => handleSelectComposition("v18")}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                  composition === "v18"
                    ? "bg-brand-500 text-white shadow-lg shadow-brand-500/30"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Release v1.8 Highlights (70s)
              </button>
            </div>
          </div>
        </motion.div>

        {/* Video container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f11] shadow-2xl shadow-brand-500/10 ring-1 ring-white/5"
        >
          {/* Ambient Glow */}
          <div className="absolute -inset-[1px] -z-10 rounded-2xl bg-gradient-to-b from-brand-500/25 via-transparent to-transparent" />

          {mp4Src ? (
            /* ── Pre-rendered MP4 mode (fallback) ── */
            <NativeVideo
              src={mp4Src}
              poster={poster}
              duration={durationText}
              hasStarted={hasStarted}
              onPlay={() => {
                setHasStarted(true);
                setIsPlaying(true);
              }}
            />
          ) : (
            /* ── Remotion Player mode ── */
            <div className="relative aspect-video w-full">
              {!hasStarted && (
                <PlayOverlay
                  onPlay={handlePlay}
                  duration={durationText}
                  title={
                    composition === "demo"
                      ? "Assistir Demonstração Completa (90s)"
                      : "Assistir Destaques da Versão 1.8 (70s)"
                  }
                  subtitle={
                    composition === "demo"
                      ? "Apresentação completa das rotinas operacionais"
                      : "Governança executiva, IA e integração corporativa"
                  }
                />
              )}

              <RemotionPlayerWrapper
                key={composition}
                ref={playerRef}
                composition={composition}
              />

              {/* Hover controls */}
              {hasStarted && (
                <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/40 to-transparent px-5 py-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleToggle}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-transform hover:scale-105 hover:bg-white/25"
                      aria-label={isPlaying ? "Pausar" : "Reproduzir"}
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4 text-white" />
                      ) : (
                        <Play
                          className="ml-0.5 h-4 w-4 text-white"
                          fill="white"
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleRestart}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-transform hover:scale-105 hover:bg-white/25"
                      aria-label="Reiniciar vídeo"
                    >
                      <RotateCcw className="h-4 w-4 text-white" />
                    </button>
                    <span className="font-mono text-xs text-white/70">
                      {composition === "demo"
                        ? "OptSolv Demo · 90s"
                        : "OptSolv v1.8 · 70s"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white/80 backdrop-blur-md">
                      <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                      {durationText}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Feature Highlights beneath video */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4"
        >
          {[
            {
              title: "Timer ao Vivo",
              desc: "Start/pause instantâneo no navegador",
            },
            {
              title: "Azure DevOps Nativo",
              desc: "Work Items vinculados com 1 clique",
            },
            {
              title: "Aprovação Semanal",
              desc: "Workflow de submit para gestores",
            },
            {
              title: "Export & Relatórios",
              desc: "Geração de PDF e Excel auditáveis",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-white/5 bg-white/[0.02] p-4 backdrop-blur-sm transition-colors hover:border-brand-500/20"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
                  <Check className="h-3 w-3" />
                </div>
                <h3 className="text-sm font-semibold text-white">
                  {item.title}
                </h3>
              </div>
              <p className="mt-1.5 text-xs text-white/50">{item.desc}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ── Play overlay (enhanced with high-end poster visuals) ── */
function PlayOverlay({
  onPlay,
  duration,
  title,
  subtitle,
}: {
  onPlay: () => void;
  duration: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-[#141416]/95 via-[#0c0c0e]/95 to-[#09090b]/95 p-6 text-center">
      {/* Decorative ambient background grid */}
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(#f97316_1px,transparent_1px)] [background-size:24px_24px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <button
          type="button"
          onClick={onPlay}
          className="group/play relative flex flex-col items-center gap-5 transition-transform hover:scale-105 active:scale-95"
          aria-label={title}
        >
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-brand-500 text-white shadow-2xl shadow-brand-500/40 ring-4 ring-brand-500/20 transition-all group-hover/play:shadow-brand-500/60 group-hover/play:ring-brand-500/40 md:h-24 md:w-24">
            <Play
              className="ml-1.5 h-8 w-8 text-white md:h-10 md:w-10"
              fill="white"
            />
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-white md:text-xl">
              {title}
            </h3>
            <p className="mt-1 text-xs text-white/60 md:text-sm">{subtitle}</p>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-white/70 backdrop-blur-md">
            Duração: {duration}
          </span>
        </button>
      </div>
    </div>
  );
}

/* ── Native MP4 sub-component ── */
function NativeVideo({
  src,
  poster,
  duration,
  hasStarted,
  onPlay,
}: {
  src: string;
  poster?: string;
  duration: string;
  hasStarted: boolean;
  onPlay: () => void;
}) {
  return hasStarted ? (
    <video
      src={src}
      poster={poster}
      controls
      autoPlay
      className="aspect-video w-full"
    >
      <track kind="captions" />
    </video>
  ) : (
    <PlayOverlay
      onPlay={onPlay}
      duration={duration}
      title="Assistir Demonstração"
      subtitle="Apresentação em alta definição do sistema"
    />
  );
}
