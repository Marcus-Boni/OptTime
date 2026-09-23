"use client";

import { motion } from "framer-motion";
import { Image as ImageIcon, Maximize2 } from "lucide-react";
import { useState } from "react";
import type { SuggestionAttachment } from "@/hooks/use-suggestions";
import { formatFileSize } from "@/lib/image-utils";
import SuggestionImageLightbox from "./SuggestionImageLightbox";

export interface SuggestionImageGalleryProps {
  attachments: SuggestionAttachment[];
}

export default function SuggestionImageGallery({
  attachments,
}: SuggestionImageGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!attachments || attachments.length === 0) return null;

  function handleOpen(index: number) {
    setSelectedIdx(index);
    setLightboxOpen(true);
  }

  const gridCols =
    attachments.length === 1
      ? "grid-cols-1"
      : attachments.length === 2
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <>
      <div
        className="mt-3 space-y-1.5"
        data-tour="suggestion-attachments-gallery"
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <ImageIcon className="h-3 w-3 text-brand-400" aria-hidden="true" />
          <span>
            {attachments.length} {attachments.length === 1 ? "anexo" : "anexos"}
          </span>
        </div>

        <div className={`grid gap-2 ${gridCols}`}>
          {attachments.map((att, idx) => (
            <motion.button
              key={att.id || `${att.fileName}-${idx}`}
              type="button"
              onClick={() => handleOpen(idx)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="group relative flex aspect-video w-full overflow-hidden rounded-lg border border-border/60 bg-muted/20 text-left focus:outline-none focus:ring-2 focus:ring-brand-500/50 cursor-pointer"
              aria-label={`Visualizar imagem ${idx + 1}: ${att.fileName}`}
            >
              {/* biome-ignore lint/performance/noImgElement: user-uploaded attachment display */}
              <img
                src={att.url}
                alt={att.fileName}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />

              {/* Hover overlay with zoom icon */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900/80 text-white shadow-md">
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>

              {/* File size chip */}
              <div className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-xs">
                {formatFileSize(att.fileSize)}
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      <SuggestionImageLightbox
        images={attachments}
        initialIndex={selectedIdx}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}
