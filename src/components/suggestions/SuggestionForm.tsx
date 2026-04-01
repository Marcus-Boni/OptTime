"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { Lightbulb, Loader2, Send, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Suggestion } from "@/hooks/use-suggestions";
import {
  type CreateSuggestionInput,
  createSuggestionSchema,
} from "@/lib/validations/suggestion.schema";

export interface SuggestionFormProps {
  onSuccess: (suggestion: Suggestion) => void;
  onSubmit: (data: CreateSuggestionInput) => Promise<Suggestion>;
}

export default function SuggestionForm({
  onSuccess,
  onSubmit,
}: SuggestionFormProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<CreateSuggestionInput>({
    resolver: zodResolver(createSuggestionSchema),
    defaultValues: {
      title: "",
      description: "",
    },
  });

  const isLoading = form.formState.isSubmitting;

  function handleClose() {
    if (isLoading) return;
    setOpen(false);
    form.reset();
  }

  async function handleSubmit(data: CreateSuggestionInput) {
    try {
      const created = await onSubmit(data);
      toast.success("Sugestão enviada com sucesso!", {
        description: "Obrigado por contribuir para a melhoria do sistema.",
      });
      onSuccess(created);
      handleClose();
    } catch (err: unknown) {
      console.error("[SuggestionForm] handleSubmit:", err);
      toast.error(
        err instanceof Error ? err.message : "Erro ao enviar sugestão",
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button
          className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
          aria-label="Enviar nova sugestão de melhoria"
        >
          <Lightbulb className="h-4 w-4" aria-hidden="true" />
          Nova Sugestão
        </Button>
      </DialogTrigger>

      <DialogContent
        className="border-border/50 bg-card sm:max-w-lg"
        onEscapeKeyDown={handleClose}
        onInteractOutside={(e) => {
          if (isLoading) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold">
            <Lightbulb className="h-4 w-4 text-brand-400" aria-hidden="true" />
            Sugerir Melhoria
          </DialogTitle>
          <DialogDescription>
            Compartilhe sua ideia para tornar o sistema ainda melhor. Nossa
            equipe avaliará todas as sugestões.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <motion.form
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={form.handleSubmit(handleSubmit)}
            id="suggestion-form"
            className="space-y-4 py-2"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="suggestion-title">
                    Título da sugestão
                  </FormLabel>
                  <FormControl>
                    <Input
                      id="suggestion-title"
                      placeholder="Ex: Adicionar exportação em PDF nos relatórios"
                      className="bg-background/50"
                      disabled={isLoading}
                      aria-describedby="suggestion-title-desc"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription id="suggestion-title-desc">
                    Um título curto e objetivo (5–120 caracteres)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="suggestion-description">
                    Descrição detalhada
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      id="suggestion-description"
                      placeholder="Descreva sua sugestão em detalhes. Qual é o problema atual? Como sua ideia resolve?"
                      className="min-h-[120px] resize-none bg-background/50"
                      disabled={isLoading}
                      aria-describedby="suggestion-description-desc"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription id="suggestion-description-desc">
                    {field.value?.length ?? 0}/2000 caracteres
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </motion.form>
        </Form>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isLoading}
            className="gap-1.5"
            type="button"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Cancelar
          </Button>
          <Button
            form="suggestion-form"
            type="submit"
            className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden="true" />
                Enviar sugestão
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
