"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ImageIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compressAttachmentImage, formatFileSize } from "@/lib/image-utils";
import type { SuggestionAttachmentInput } from "@/lib/validations/suggestion.schema";

export interface SuggestionImageDropzoneProps {
  attachments: SuggestionAttachmentInput[];
  onChange: (attachments: SuggestionAttachmentInput[]) => void;
  disabled?: boolean;
  maxFiles?: number;
}

const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
];

export default function SuggestionImageDropzone({
  attachments,
  onChange,
  disabled = false,
  maxFiles = 3,
}: SuggestionImageDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const canAddMore = attachments.length < maxFiles;
  const remainingSlots = maxFiles - attachments.length;

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      if (disabled || !canAddMore) return;

      const fileArray = Array.from(files);
      const validImages = fileArray.filter((f) =>
        ACCEPTED_TYPES.includes(f.type),
      );

      if (validImages.length === 0) {
        toast.error("Nenhum arquivo de imagem válido foi selecionado.", {
          description: "Formatos permitidos: PNG, JPG, WEBP e GIF.",
        });
        return;
      }

      if (validImages.length > remainingSlots) {
        toast.warning(
          `Você só pode adicionar mais ${remainingSlots} ${remainingSlots === 1 ? "imagem" : "imagens"}.`,
        );
      }

      const filesToProcess = validImages.slice(0, remainingSlots);

      setIsProcessing(true);
      const processed: SuggestionAttachmentInput[] = [];

      try {
        for (const file of filesToProcess) {
          if (file.size > 10 * 1024 * 1024) {
            toast.error(`O arquivo "${file.name}" excede o limite de 10MB.`);
            continue;
          }

          const compressed = await compressAttachmentImage(file);
          processed.push({
            fileName: compressed.fileName,
            fileSize: compressed.fileSize,
            contentType: compressed.contentType,
            url: compressed.url,
          });
        }

        if (processed.length > 0) {
          onChange([...attachments, ...processed]);
          toast.success(
            `${processed.length} ${processed.length === 1 ? "imagem adicionada" : "imagens adicionadas"} com sucesso.`,
          );
        }
      } catch (err: unknown) {
        console.error("[SuggestionImageDropzone] processFiles:", err);
        toast.error(
          err instanceof Error
            ? err.message
            : "Erro ao processar as imagens selecionadas.",
        );
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [attachments, canAddMore, disabled, onChange, remainingSlots],
  );

  // Clipboard paste support (Ctrl+V)
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      if (disabled || !canAddMore) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            // Rename pasted file with timestamp if generic
            const ext = item.type.split("/")[1] || "png";
            const renamed = new File(
              [file],
              file.name.includes("image")
                ? `print-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.${ext}`
                : file.name,
              { type: file.type },
            );
            imageFiles.push(renamed);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        void processFiles(imageFiles);
      }
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [canAddMore, disabled, processFiles]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (disabled || !canAddMore) return;
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || !canAddMore) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processFiles(e.dataTransfer.files);
    }
  }

  function handleRemove(index: number) {
    if (disabled) return;
    const updated = attachments.filter((_, i) => i !== index);
    onChange(updated);
  }

  return (
    <div
      ref={containerRef}
      className="space-y-3"
      data-tour="suggestion-attachments-upload"
    >
      <div className="flex items-center justify-between">
        <label
          htmlFor="suggestion-attachments-input"
          className="flex items-center gap-1.5 text-xs font-medium text-foreground/80 cursor-pointer"
        >
          <ImageIcon
            className="h-3.5 w-3.5 text-brand-400"
            aria-hidden="true"
          />
          Anexar imagens de exemplo ou mockups (opcional)
        </label>
        <span className="text-[11px] text-muted-foreground">
          {attachments.length}/{maxFiles} imagens
        </span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id="suggestion-attachments-input"
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(",")}
        onChange={(e) => {
          if (e.target.files) void processFiles(e.target.files);
        }}
        className="sr-only"
        disabled={disabled || !canAddMore || isProcessing}
        aria-label="Upload de imagens para a sugestão"
      />

      {/* Dropzone */}
      {canAddMore && (
        <button
          type="button"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isProcessing}
          aria-label="Clique ou arraste imagens aqui, ou use Ctrl+V para colar da área de transferência"
          className={`group relative flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition-all cursor-pointer select-none ${
            isDragging
              ? "border-brand-500 bg-brand-500/10 text-brand-400 scale-[1.01]"
              : "border-border/60 bg-muted/20 hover:border-brand-500/40 hover:bg-muted/40 text-muted-foreground"
          } ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
              <p className="text-xs font-medium text-foreground">
                Otimizando imagem...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/10 text-brand-400 group-hover:scale-110 transition-transform">
                <UploadCloud className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">
                  <span className="text-brand-400 hover:underline">
                    Clique para selecionar
                  </span>{" "}
                  ou arraste para cá
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Você também pode colar prints com{" "}
                  <kbd className="rounded border border-border/80 bg-background/80 px-1 py-0.5 font-mono text-[10px] text-foreground">
                    Ctrl+V
                  </kbd>
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground/75">
                PNG, JPG, WEBP até 10MB (otimizado automaticamente)
              </span>
            </div>
          )}
        </button>
      )}

      {/* Attachment Previews */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-2"
          >
            {attachments.map((att, index) => (
              <motion.div
                key={`${att.fileName}-${index}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/60 p-2 text-xs backdrop-blur-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Thumbnail */}
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/30">
                    {/* biome-ignore lint/performance/noImgElement: local data URL preview */}
                    <img
                      src={att.url}
                      alt={att.fileName}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground text-xs">
                      {att.fileName}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{formatFileSize(att.fileSize)}</span>
                      <span>·</span>
                      <span className="uppercase text-[10px]">
                        {att.contentType.replace("image/", "")}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(index)}
                  disabled={disabled}
                  aria-label={`Remover imagem ${att.fileName}`}
                  className="h-7 w-7 text-muted-foreground hover:bg-red-500/10 hover:text-red-400 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
