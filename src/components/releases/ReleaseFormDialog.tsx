"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, PencilLine, Plus } from "lucide-react";
import { useEffect, useState } from "react";
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
import type { Release } from "@/hooks/use-releases";
import {
  createReleaseSchema,
  type CreateReleaseInput,
} from "@/lib/validations/release.schema";

export interface ReleaseFormDialogProps {
  /** If provided, the dialog opens in edit mode */
  release?: Release;
  onSubmit: (data: CreateReleaseInput) => Promise<Release>;
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function ReleaseFormDialog({
  release,
  onSubmit,
  onSuccess,
  open,
  onOpenChange,
}: ReleaseFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  function handleOpenChange(val: boolean) {
    if (isControlled && onOpenChange) {
      onOpenChange(val);
    } else {
      setInternalOpen(val);
    }
  }

  const isEdit = !!release;

  const form = useForm<CreateReleaseInput>({
    resolver: zodResolver(createReleaseSchema),
    defaultValues: {
      versionTag: release?.versionTag ?? "",
      title: release?.title ?? "",
      description: release?.description ?? "",
    },
  });

  useEffect(() => {
    if (isOpen && release) {
      form.reset({
        versionTag: release.versionTag,
        title: release.title,
        description: release.description,
      });
    } else if (isOpen && !release) {
      form.reset({ versionTag: "", title: "", description: "" });
    }
  }, [form, isOpen, release]);

  async function handleSubmit(values: CreateReleaseInput) {
    try {
      await onSubmit(values);
      toast.success(
        isEdit
          ? "Release atualizada com sucesso!"
          : "Release criada como rascunho!",
      );
      handleOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      console.error("[ReleaseFormDialog] handleSubmit:", err);
      toast.error(
        err instanceof Error ? err.message : "Erro ao salvar release",
      );
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          {isEdit ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              aria-label={`Editar release ${release.versionTag}`}
            >
              <PencilLine className="mr-1.5 h-3.5 w-3.5" />
              Editar
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-brand-500 text-white hover:bg-brand-600"
              aria-label="Criar nova release"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nova Versão
            </Button>
          )}
        </DialogTrigger>
      )}

      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-4">
          <DialogTitle>
            {isEdit ? `Editar ${release.versionTag}` : "Nova Release"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Edite os detalhes da release. Ela só pode ser alterada enquanto for um rascunho."
              : "Preencha os detalhes da nova versão. Ela será salva como rascunho até você publicar."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <FormField
                control={form.control}
                name="versionTag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="release-version-tag">
                      Tag da versão
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="release-version-tag"
                        placeholder="v1.2.0"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Formato semântico: v1.2.0 ou v2.0.0-beta.1
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="release-title">Título</FormLabel>
                    <FormControl>
                      <Input
                        id="release-title"
                        placeholder="Ex: Melhorias no relatório de horas"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="release-description">
                      Release Notes
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        id="release-description"
                        placeholder={`## Novidades\n- Adicionamos X\n- Melhoramos Y\n\n## Correções\n- Corrigimos Z`}
                        className="min-h-[240px] resize-y font-mono text-sm"
                        aria-describedby="release-description-hint"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription
                      id="release-description-hint"
                      className="text-xs"
                    >
                      Suporta Markdown simples: ## Título, - lista, **negrito**
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="shrink-0 border-t border-border/60 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="bg-brand-500 text-white hover:bg-brand-600"
                aria-busy={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : isEdit ? (
                  "Salvar alterações"
                ) : (
                  "Criar rascunho"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
