"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

interface TimeEntryDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
}

export function TimeEntryDialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  aside,
}: TimeEntryDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-[min(720px,calc(100vw-1rem))] gap-0 overflow-hidden border-border/60 p-0 min-[1360px]:left-[calc(50%-150px)] min-[1700px]:left-[calc(50%-180px)]"
        onInteractOutside={(e) => {
          if ((e.target as Element).closest("[data-outlook-drawer]")) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4 text-left sm:px-6">
          <DialogTitle className="font-display text-xl font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(90vh-88px)] overflow-y-auto">
          {children}
        </div>
      </DialogContent>

      {aside && <DialogPortal>{aside}</DialogPortal>}
    </Dialog>
  );
}
