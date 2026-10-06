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
          "flex max-h-[90vh] flex-col overflow-hidden border-none bg-transparent p-0 shadow-none md:flex-row md:items-stretch md:justify-center",
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
            "relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-lg md:max-h-[90vh]",
            asideOpen ? "w-full md:w-[720px]" : "w-full",
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
          </div>
        </div>

        {/*
          One stable agenda instance across breakpoints. On desktop the form
          defines the height and the absolute inner stretches to match it.
          On mobile the agenda has its own bounded scrolling area.
        */}
        <div
          className={cn(
            "relative min-h-0 shrink-0",
            asideOpen && aside
              ? "flex h-[40vh] w-full flex-col md:block md:h-auto md:w-[320px] md:self-stretch"
              : "hidden",
          )}
        >
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background shadow-lg md:absolute md:inset-0">
            {aside}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
