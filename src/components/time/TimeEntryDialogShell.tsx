"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface TimeEntryDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
  asideOpen?: boolean;
}

export function TimeEntryDialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  aside,
  asideOpen,
}: TimeEntryDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "overflow-hidden border-none bg-transparent p-0 shadow-none transition-all duration-300 ease-out md:flex md:flex-row md:items-start md:justify-center",
          asideOpen ? "md:max-w-[1056px] gap-4" : "md:max-w-[720px] gap-0",
          "w-full max-w-[calc(100vw-1rem)]",
        )}
        onInteractOutside={(e) => {
          if ((e.target as Element).closest("[data-outlook-drawer]")) {
            e.preventDefault();
          }
        }}
      >
        {/* FORMULARIO PRINCIPAL — determina a altura do layout */}
        <div
          className={cn(
            "relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-lg transition-all duration-300 max-h-[90vh]",
            asideOpen ? "md:w-[720px]" : "w-full",
          )}
        >
          <DialogHeader className="border-b border-border/60 px-5 py-4 text-left sm:px-6 pr-12 shrink-0">
            <DialogTitle className="font-display text-xl font-semibold">
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <DialogClose className="absolute right-5 top-5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>

          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            <div className="flex-1">{children}</div>

            {/* MOBILE ONLY ASIDE (Animação de altura fluída) */}
            <div
              className={cn(
                "grid transition-all duration-300 ease-out md:hidden",
                asideOpen && aside
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <div className="border-t border-border/60 bg-muted/10 flex flex-col">
                  {aside}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/*
          AGENDA OUTLOOK DESKTOP
          O wrapper não tem filhos in-flow → contribui 0 para a altura do
          container flex. self-stretch o estica até a altura do formulário
          (o único filho in-flow, que define o container). O inner é
          absolute inset-0, preenchendo exatamente essa altura com scroll
          interno — sem nunca forçar o formulário a crescer.
        */}
        <div
          className={cn(
            "hidden transform-gpu shrink-0 self-stretch relative transition-all duration-300 ease-out md:block",
            asideOpen && aside ? "w-[320px] opacity-100" : "w-0 opacity-0 pointer-events-none",
          )}
        >
          <div className="absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-lg w-[320px]">
            {aside}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
