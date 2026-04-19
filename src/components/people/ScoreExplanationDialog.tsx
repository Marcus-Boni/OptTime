"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function ScoreExplanationDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
          <span className="sr-only">Como o score é calculado?</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Como o score é calculado?</DialogTitle>
          <DialogDescription>
            O score de performance é uma métrica consolidada (0 a 100) que
            engloba engajamento operacional e boas práticas de gestão no Azure
            DevOps.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2 text-sm text-foreground">
          <div className="grid gap-1">
            <div className="flex justify-between font-semibold">
              <span>Lançamentos e Capacidade</span>
              <span className="tabular-nums text-muted-foreground">50%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Avalia a utilização da capacidade semanal com base nas horas
              lançadas pelo colaborador na plataforma.
            </p>
          </div>

          <div className="grid gap-1">
            <div className="flex justify-between font-semibold">
              <span>Cobertura de Estimativas</span>
              <span className="tabular-nums text-muted-foreground">25%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Proporção de itens ativos do backlog que possuem estimativas de
              esforço cadastradas (horas originais ou horas restantes).
            </p>
          </div>

          <div className="grid gap-1">
            <div className="flex justify-between font-semibold">
              <span>Atualização de Backlog</span>
              <span className="tabular-nums text-muted-foreground">15%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Proporção de itens do backlog com movimentação recente. Penaliza
              tarefas sem atualização há mais de 7 dias.
            </p>
          </div>

          <div className="grid gap-1">
            <div className="flex justify-between font-semibold">
              <span>Fluxo Operacional</span>
              <span className="tabular-nums text-muted-foreground">10%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Saúde do fluxo de trabalho. Penaliza tarefas bloqueadas ou acúmulo
              excessivo de itens em andamento simultâneo (acima de 10).
            </p>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[13px] text-amber-700 dark:text-amber-400">
            <strong>Importante:</strong> colaboradores sem integração com o
            Azure DevOps têm score calculado parcialmente (teto de 55%), com
            base apenas nas horas lançadas e estimativas visíveis.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
