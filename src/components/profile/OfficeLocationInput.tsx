"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  Home,
  Laptop,
  Loader2,
  LocateFixed,
  MapPin,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LocationResult } from "@/lib/location/openstreetmap";
import { cn } from "@/lib/utils";

export interface OfficeLocationInputProps {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

const PRESET_LOCATIONS = [
  { label: "Remoto", icon: Laptop },
  { label: "Sede (Presencial)", icon: Building2 },
  { label: "Híbrido", icon: Home },
];

export default function OfficeLocationInput({
  id = "profile-office",
  value,
  onChange,
  placeholder = "Ex: São Paulo, Sede, Remoto",
  disabled = false,
  error,
}: OfficeLocationInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [results, setResults] = useState<LocationResult[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search OpenStreetMap when user types
  function handleInputChange(text: string) {
    onChange(text);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setIsOpen(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/location/search?q=${encodeURIComponent(trimmed)}`,
        );
        if (!res.ok) throw new Error("Erro na busca");
        const data = (await res.json()) as { results?: LocationResult[] };
        setResults(data.results || []);
      } catch (err: unknown) {
        console.error("[OfficeLocationInput] Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }

  // Detect current location via browser GPS + OpenStreetMap reverse geocoding
  // com fallback automático transparente para IP caso o GPS do desktop não responda
  async function handleDetectLocation() {
    setIsDetecting(true);

    async function tryFallbackToIp(): Promise<boolean> {
      try {
        const res = await fetch("/api/location/search?detect=auto");
        if (!res.ok) return false;
        const data = (await res.json()) as {
          location?: { label: string };
        };
        if (data.location?.label) {
          onChange(data.location.label);
          toast.success("Localização detectada via OpenStreetMap!", {
            description: data.location.label,
          });
          setIsOpen(false);
          return true;
        }
      } catch (err: unknown) {
        console.error("[OfficeLocationInput] fallbackToIp:", err);
      }
      return false;
    }

    if (typeof window === "undefined" || !navigator.geolocation) {
      const ok = await tryFallbackToIp();
      if (!ok) {
        toast.info(
          "Não foi possível detectar automaticamente. Digite sua cidade para buscar no OpenStreetMap.",
        );
      }
      setIsDetecting(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(
            `/api/location/search?lat=${latitude}&lon=${longitude}`,
          );
          if (!res.ok) {
            const ok = await tryFallbackToIp();
            if (!ok) toast.error("Não foi possível identificar o endereço.");
            return;
          }

          const data = (await res.json()) as {
            location?: { label: string; city: string; state: string };
          };

          if (data.location?.label) {
            onChange(data.location.label);
            toast.success("Localização detectada via OpenStreetMap!", {
              description: data.location.label,
            });
            setIsOpen(false);
          } else {
            const ok = await tryFallbackToIp();
            if (!ok) toast.info("Não foi possível obter o nome da cidade.");
          }
        } catch {
          const ok = await tryFallbackToIp();
          if (!ok) toast.error("Erro ao consultar OpenStreetMap.");
        } finally {
          setIsDetecting(false);
        }
      },
      async () => {
        // GPS do navegador indisponível ou deu timeout (comum em desktops sem chip GPS)
        // Dispara o fallback automático por IP integrado ao OpenStreetMap
        const ok = await tryFallbackToIp();
        if (!ok) {
          toast.info(
            "GPS indisponível no dispositivo. Você pode selecionar ou buscar sua cidade no OpenStreetMap.",
          );
        }
        setIsDetecting(false);
      },
      { timeout: 3500, maximumAge: 300000, enableHighAccuracy: false },
    );
  }

  function handleSelect(loc: string) {
    onChange(loc);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative space-y-2">
      {/* Label padronizada com altura h-5 */}
      <div className="flex h-5 items-center">
        <Label
          htmlFor={id}
          className="flex items-center gap-1.5 text-xs font-medium text-foreground"
        >
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          Localização / Escritório
        </Label>
      </div>

      {/* Input container com botão de GPS integrado à direita */}
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="pr-20 text-xs"
        />

        <div className="absolute top-1/2 right-1.5 -translate-y-1/2 flex items-center">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleDetectLocation}
                  disabled={isDetecting || disabled}
                  className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Detectar localização via GPS e OpenStreetMap"
                >
                  {isDetecting ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : (
                    <LocateFixed className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span>{isDetecting ? "Detectando..." : "GPS"}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Detectar automaticamente via GPS e OpenStreetMap
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {/* Autocomplete / Suggestions Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full rounded-xl border border-border/80 bg-card/95 p-2 shadow-xl backdrop-blur-md"
          >
            {/* Quick Presets */}
            <div className="mb-2">
              <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Opções rápidas
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5 px-1">
                {PRESET_LOCATIONS.map((preset) => {
                  const Icon = preset.icon;
                  const isSelected = value === preset.label;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleSelect(preset.label)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors",
                        isSelected
                          ? "border-foreground/30 bg-muted text-foreground font-medium"
                          : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* OpenStreetMap Results */}
            <div className="border-t border-border/40 pt-2">
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Busca OpenStreetMap
                </span>
                {isSearching && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" /> Buscando...
                  </span>
                )}
              </div>

              {results.length > 0 ? (
                <div className="space-y-0.5">
                  {results.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.label)}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">
                          {item.label}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {item.displayName}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : value.trim().length >= 2 && !isSearching ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  Nenhuma cidade encontrada para &quot;{value}&quot;
                </div>
              ) : (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">
                  Digite o nome de uma cidade (ex: Curitiba, Campinas, Lisboa)
                  para buscar.
                </div>
              )}
            </div>

            {/* OpenStreetMap Attribution */}
            <div className="mt-2 border-t border-border/40 px-2 pt-1.5 text-[9px] text-muted-foreground/70">
              Dados geográficos públicos fornecidos por © OpenStreetMap
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
