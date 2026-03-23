"use client";

import { toast } from "sonner";
import { TimeEntryForm } from "@/components/time/TimeEntryForm";
import { dispatchTimeEntriesUpdated } from "@/lib/time-events";
import { useUIStore } from "@/stores/ui.store";

export function QuickEntryDialog() {
  const { quickEntryContext, quickEntryOpen, closeQuickEntry } = useUIStore();

  const handleSubmit = async (data: {
    projectId: string;
    description: string;
    date: string;
    duration: number;
    billable: boolean;
    azureWorkItemId?: number;
    azureWorkItemTitle?: string;
  }) => {
    const res = await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Falha ao criar registro");
    }

    toast.success("Registro de tempo criado com sucesso!");
    dispatchTimeEntriesUpdated();
    closeQuickEntry();
  };

  return (
    <TimeEntryForm
      open={quickEntryOpen}
      onOpenChange={(open) => !open && closeQuickEntry()}
      onSubmit={handleSubmit}
      initialValues={{
        ...quickEntryContext?.initialValues,
        date: quickEntryContext?.initialValues?.date ?? quickEntryContext?.date,
      }}
      mode="create"
    />
  );
}
