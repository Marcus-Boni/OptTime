"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SuggestionAttachment } from "@/hooks/use-suggestions";
import { formatFileSize } from "@/lib/image-utils";

export interface SuggestionImageLightboxProps {
  images: SuggestionAttachment[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function SuggestionImageLightbox({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}: SuggestionImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);

  // Sync index when initialIndex changes
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
      setZoom(1);
    }
  }, [initialIndex, isOpen]);

  const activeImage = images[currentIndex];
  const hasMultiple = images.length > 1;

  const handlePrev = useCallback(() => {
    setZoom(1);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setZoom(1);
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.5, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.5, 0.5));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  // Keyboard navigation & a11y
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleResetZoom();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleNext,
    handlePrev,
    handleResetZoom,
    handleZoomIn,
    handleZoomOut,
    isOpen,
    onClose,
  ]);

  function handleDownload() {
    if (!activeImage) return;
    const a = document.createElement("a");
    a.href = activeImage.url;
    a.download = activeImage.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if (!isOpen || !activeImage) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex flex-col bg-neutral-950/90 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-label={`Visualizador de anexo: ${activeImage.fileName}`}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-white/10 bg-neutral-900/60 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {activeImage.fileName}
            </p>
            <span className="hidden sm:inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-neutral-300">
              {formatFileSize(activeImage.fileSize)}
            </span>
            {hasMultiple && (
              <span className="text-xs text-neutral-400 font-mono">
                {currentIndex + 1} de {images.length}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center gap-1 mr-2 rounded-lg border border-white/10 bg-neutral-800/80 p-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                aria-label="Diminuir zoom"
                className="h-7 w-7 text-neutral-300 hover:text-white hover:bg-white/10"
              >
                <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <span className="px-1.5 text-[11px] font-mono text-neutral-300 select-none">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                aria-label="Aumentar zoom"
                className="h-7 w-7 text-neutral-300 hover:text-white hover:bg-white/10"
              >
                <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              {zoom !== 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleResetZoom}
                  aria-label="Resetar zoom para 100%"
                  className="h-7 w-7 text-neutral-300 hover:text-white hover:bg-white/10"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                </Button>
              )}
            </div>

            {/* Download */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="gap-1.5 h-8 text-neutral-300 hover:text-white hover:bg-white/10 text-xs"
              aria-label={`Baixar imagem ${activeImage.fileName}`}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Baixar</span>
            </Button>

            {/* Close */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-neutral-400 hover:text-white hover:bg-white/10"
              aria-label="Fechar visualizador"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* Viewport Area */}
        <div className="relative flex-1 flex items-center justify-center overflow-hidden p-4 select-none">
          {/* Previous Button */}
          {hasMultiple && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handlePrev}
              aria-label="Imagem anterior"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full border border-white/15 bg-neutral-900/80 text-white shadow-lg backdrop-blur-sm hover:bg-neutral-800"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
          )}

          {/* Centered Image */}
          <div className="max-h-full max-w-full flex items-center justify-center overflow-auto p-2">
            {/* biome-ignore lint/performance/noImgElement: lightbox full image view */}
            <motion.img
              key={activeImage.id || activeImage.fileName}
              src={activeImage.url}
              alt={activeImage.fileName}
              style={{
                scale: zoom,
                transformOrigin: "center center",
              }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="max-h-[calc(100vh-140px)] max-w-[calc(100vw-80px)] object-contain rounded-md shadow-2xl transition-transform"
            />
          </div>

          {/* Next Button */}
          {hasMultiple && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleNext}
              aria-label="Próxima imagem"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full border border-white/15 bg-neutral-900/80 text-white shadow-lg backdrop-blur-sm hover:bg-neutral-800"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* Bottom thumbnail strip if multiple */}
        {hasMultiple && (
          <div className="flex items-center justify-center gap-2 border-t border-white/10 bg-neutral-900/60 py-2.5 px-4 backdrop-blur-sm overflow-x-auto">
            {images.map((img, idx) => (
              <button
                key={img.id || `${img.fileName}-${idx}`}
                type="button"
                onClick={() => {
                  setCurrentIndex(idx);
                  setZoom(1);
                }}
                className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition-all cursor-pointer ${
                  idx === currentIndex
                    ? "border-brand-500 ring-2 ring-brand-500/30 scale-105"
                    : "border-white/20 opacity-60 hover:opacity-100 hover:border-white/50"
                }`}
                aria-label={`Ver imagem ${idx + 1}: ${img.fileName}`}
                aria-current={idx === currentIndex}
              >
                {/* biome-ignore lint/performance/noImgElement: lightbox thumbnail strip */}
                <img
                  src={img.url}
                  alt={img.fileName}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
