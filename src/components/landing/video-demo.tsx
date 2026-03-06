"use client";

import type { PlayerRef } from "@remotion/player";
import { motion } from "framer-motion";
import { Pause, Play, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";

/** Lazy-load the Remotion Player — avoids SSR issues */
const RemotionPlayerWrapper = dynamic(
  () => import("./RemotionPlayerWrapper").then((m) => m.RemotionPlayerWrapper),
  { ssr: false },
);

interface VideoDemoProps {
  /** If provided, renders a native <video> with the pre-rendered MP4 */
  mp4Src?: string;
  poster?: string;
  duration?: string;
}

export function VideoDemo({
  mp4Src,
  poster,
  duration = "1:30",
}: VideoDemoProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const playerRef = useRef<PlayerRef>(null);

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

  return (
    <section id="video-demo" className="relative py-20 md:py-32">
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl">
            Como funciona em <span className="gradient-text">90 segundos</span>
          </h2>
          <p className="mt-4 text-base text-white/50">
            Veja como registrar, submeter e acompanhar horas em menos de 2
            minutos por dia.
          </p>
        </motion.div>

        {/* Video container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
          className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#111] shadow-2xl shadow-brand-500/5"
        >
          {/* Gradient border glow */}
          <div className="absolute -inset-[1px] -z-10 rounded-2xl bg-gradient-to-b from-brand-500/20 via-transparent to-transparent" />

          {mp4Src ? (
            /* ── Pre-rendered MP4 mode ── */
            <NativeVideo
              src={mp4Src}
              poster={poster}
              duration={duration}
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
                <PlayOverlay onPlay={handlePlay} duration={duration} />
              )}

              <RemotionPlayerWrapper ref={playerRef} />

              {/* Hover controls */}
              {hasStarted && (
                <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-3 bg-gradient-to-t from-black/60 to-transparent px-4 py-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={handleToggle}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20"
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
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20"
                    aria-label="Reiniciar"
                  >
                    <RotateCcw className="h-4 w-4 text-white" />
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Bullet points */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-white/40"
        >
          {[
            "Timer ao vivo e entrada manual",
            "Submit semanal para aprovação",
            "Relatórios com export em Excel/PDF",
          ].map((item) => (
            <span key={item} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {item}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ── Play overlay (shared) ── */
function PlayOverlay({
  onPlay,
  duration,
}: {
  onPlay: () => void;
  duration: string;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-br from-[#171717] to-[#0a0a0a]">
      <div className="absolute inset-0 flex items-center justify-center opacity-10">
        <div className="grid grid-cols-12 gap-3 p-12">
          {Array.from({ length: 48 }).map((_, i) => (
            <div key={`dot-${i}`} className="h-1 w-1 rounded-full bg-white" />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onPlay}
        className="group/play relative z-10 flex flex-col items-center gap-4"
        aria-label="Reproduzir vídeo de demonstração"
      >
        <motion.div
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-500 shadow-lg shadow-brand-500/30 transition-shadow group-hover/play:shadow-xl group-hover/play:shadow-brand-500/40"
        >
          <Play className="ml-1 h-8 w-8 text-white" fill="white" />
        </motion.div>
        <span className="text-sm text-white/40">{duration}</span>
      </button>
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
    />
  ) : (
    <PlayOverlay onPlay={onPlay} duration={duration} />
  );
}
