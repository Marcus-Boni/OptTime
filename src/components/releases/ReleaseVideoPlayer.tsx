"use client";

import type { PlayerRef } from "@remotion/player";
import { Player } from "@remotion/player";
import {
  ChevronUp,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductDemo } from "@/remotion/ProductDemo";
import { ReleaseShowcaseV16 } from "@/remotion/ReleaseShowcaseV16";
import { ReleaseShowcaseV17 } from "@/remotion/ReleaseShowcaseV17";

/**
 * Remotion compositions a release can point at, newest first.
 *
 * Adding a release video means adding one entry here — the player, the label
 * and the duration all follow from it.
 */
const REMOTION_COMPOSITIONS = [
  {
    id: "ReleaseShowcaseV17",
    component: ReleaseShowcaseV17,
    durationInFrames: 2100,
    aliases: ["v1.7", "v17"],
    label: (versionTag: string) =>
      `Demonstração Oficial ${versionTag} (Remotion)`,
  },
  {
    id: "ReleaseShowcaseV16",
    component: ReleaseShowcaseV16,
    durationInFrames: 2250,
    aliases: ["v1.6", "v16", "showcase"],
    label: (versionTag: string) =>
      `Demonstração Oficial ${versionTag} (Remotion)`,
  },
  {
    id: "ProductDemo",
    component: ProductDemo,
    durationInFrames: 2700,
    aliases: ["demo"],
    label: () => "Demonstração da Plataforma (Remotion)",
  },
] as const;

export interface ReleaseVideoPlayerProps {
  videoUrl: string;
  versionTag: string;
}

export function ReleaseVideoPlayer({
  videoUrl,
  versionTag,
}: ReleaseVideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Identify video type
  const videoConfig = useMemo(() => {
    const trimmed = videoUrl.trim();
    const lowered = trimmed.toLowerCase();

    // Exact composition ids win before any fuzzy matching. The loose aliases
    // below exist for hand-typed values, and "showcase"/"demo" would otherwise
    // swallow every future release — v1.8 must not resolve to the v1.7 video.
    const composition = REMOTION_COMPOSITIONS.find(
      (entry) =>
        trimmed === `remotion:${entry.id}` ||
        trimmed === entry.id ||
        entry.aliases.some((alias) => lowered.includes(alias)),
    );

    if (composition) {
      return {
        type: "remotion" as const,
        component: composition.component,
        durationInFrames: composition.durationInFrames,
        fps: 30,
        label: composition.label(versionTag),
      };
    }

    // YouTube
    const ytMatch = trimmed.match(
      /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/,
    );
    if (ytMatch?.[1]) {
      return {
        type: "iframe" as const,
        src: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`,
        label: `Vídeo no YouTube (${versionTag})`,
      };
    }

    // Loom
    const loomMatch = trimmed.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
    if (loomMatch?.[1]) {
      return {
        type: "iframe" as const,
        src: `https://www.loom.com/embed/${loomMatch[1]}?autoplay=1`,
        label: `Gravação no Loom (${versionTag})`,
      };
    }

    // Direct MP4 or Generic Video URL
    return {
      type: "video" as const,
      src: trimmed,
      label: `Vídeo de Lançamento (${versionTag})`,
    };
  }, [videoUrl, versionTag]);

  useEffect(() => {
    if (!isExpanded) return;

    const player = playerRef.current;
    if (!player) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);

    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, [isExpanded]);

  function handleTogglePlay() {
    if (!isExpanded) {
      setIsExpanded(true);
      setIsPlaying(true);
      setTimeout(() => playerRef.current?.play(), 150);
      return;
    }

    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.pause();
        setIsPlaying(false);
      } else {
        playerRef.current.play();
        setIsPlaying(true);
      }
    }
  }

  function handleReset() {
    if (playerRef.current) {
      playerRef.current.seekTo(0);
      playerRef.current.play();
      setIsPlaying(true);
    }
  }

  function handleToggleFullscreen() {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  return (
    <div
      ref={containerRef}
      className="my-4 overflow-hidden rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 via-neutral-900/80 to-purple-950/20 shadow-lg shadow-brand-500/5 transition-all"
    >
      {/* Header bar / Teaser */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400">
            <Video className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-400">
                Vídeo de Lançamento
              </span>
              <span className="rounded-full bg-brand-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-brand-300">
                {versionTag}
              </span>
            </div>
            <p className="text-xs text-neutral-300">{videoConfig.label}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleTogglePlay}
            className="h-8 gap-1.5 bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600"
            aria-label={
              isExpanded && isPlaying ? "Pausar vídeo" : "Reproduzir vídeo"
            }
          >
            {isExpanded && isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                Pausar
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                {isExpanded ? "Continuar" : "Assistir Vídeo"}
              </>
            )}
          </Button>

          {isExpanded && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsExpanded(false);
                setIsPlaying(false);
                playerRef.current?.pause();
              }}
              className="h-8 px-2 text-xs text-neutral-400 hover:text-white"
              aria-label="Recolher player de vídeo"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Player Frame */}
      {isExpanded && (
        <div className="border-t border-white/10 bg-black/90 p-2 sm:p-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-neutral-950 shadow-2xl">
            {videoConfig.type === "remotion" && (
              <Player
                ref={playerRef}
                component={videoConfig.component}
                compositionWidth={1920}
                compositionHeight={1080}
                durationInFrames={videoConfig.durationInFrames}
                fps={videoConfig.fps}
                style={{ width: "100%", height: "100%" }}
                controls={false}
                autoPlay
                loop
              />
            )}

            {videoConfig.type === "iframe" && (
              <iframe
                src={videoConfig.src}
                title={`Vídeo ${versionTag}`}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            )}

            {videoConfig.type === "video" && (
              // biome-ignore lint/a11y/useMediaCaption: User-provided video preview
              <video
                src={videoConfig.src}
                controls
                autoPlay
                className="h-full w-full"
              />
            )}

            {/* Remotion Overlay Controls */}
            {videoConfig.type === "remotion" && (
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-neutral-900/90 p-1.5 backdrop-blur-md">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleReset}
                  className="h-7 w-7 p-0 text-neutral-300 hover:text-white"
                  title="Reiniciar vídeo"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleToggleFullscreen}
                  className="h-7 w-7 p-0 text-neutral-300 hover:text-white"
                  title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
