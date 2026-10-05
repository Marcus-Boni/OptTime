"use client";

import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ACTIVITY_DESCRIPTIONS,
  ACTIVITY_LABELS,
} from "@/lib/collaboration/analytics";
import type { ActivityKind } from "@/types/collaboration";

interface Entry {
  term: string;
  definition: string;
  /** Where the number comes from, named the way the person would name it. */
  source: string;
}

const MICROSOFT_ORDER: ActivityKind[] = [
  "meeting",
  "call",
  "chat",
  "email",
  "focus",
];

const OUR_TERMS: Entry[] = [
  {
    term: "Maior janela sem reunião",
    definition:
      "UM intervalo: o mais longo do período sem nenhuma reunião, dentro do seu expediente. Não confunda com o 'espaço livre na agenda' acima, que soma TODAS as janelas livres da semana e por isso é muito maior.",
    source: "Agenda + horário de trabalho do Outlook",
  },
  {
    term: "Jornada",
    definition:
      "A sua capacidade semanal distribuída pelos dias úteis do período. É o denominador da carga de reuniões e da meta. Tudo acima disso é hora extra, e esta tela nunca trata hora extra como algo a perseguir.",
    source: "Sua capacidade semanal + dias úteis do Outlook",
  },
  {
    term: "Janela do Outlook",
    definition:
      "O intervalo configurado no seu Teams/Outlook, por exemplo 08:00–17:00. Pode ser maior que a jornada porque inclui almoço ou pausas. Serve só para saber onde reunião cabe e o que é fora de hora; nunca para medir quanto você trabalhou.",
    source: "Horário de trabalho do Outlook",
  },
  {
    term: "Meta do período",
    definition:
      "Sua capacidade semanal distribuída pelos dias úteis do seu horário de trabalho. Dia não útil e dia coberto por resposta automática de ausência não entram na conta.",
    source: "Seu cadastro + horário de trabalho do Outlook",
  },
  {
    term: "Reuniões sem registro",
    definition:
      "Reuniões que aconteceram na sua agenda e ainda não têm um apontamento de horas correspondente. É a diferença entre o seu calendário e o seu timesheet.",
    source: "Agenda do Outlook x seus lançamentos",
  },
  {
    term: "Realizadas",
    definition:
      "Reuniões que de fato aconteceram e entraram na contagem. Já sem convite recusado, evento cancelado, bloqueio de agenda e horário sobreposto.",
    source: "Agenda do Outlook",
  },
  {
    term: "Remarcadas",
    definition:
      "Ocorrências de uma série recorrente que mudaram de horário depois de criadas. Continuam contando como realizadas — só indicam quanto a sua agenda foi reescrita.",
    source: "Agenda do Outlook",
  },
  {
    term: "Sobrepostas",
    definition:
      "Dois compromissos no mesmo horário. Só o mais forte conta, para que a mesma hora nunca seja apontada duas vezes; o outro aparece aqui.",
    source: "Agenda do Outlook",
  },
  {
    term: "Carga de reuniões",
    definition:
      "Quanto do seu expediente foi ocupado por reunião. Minutos fora da janela de trabalho não entram no cálculo — nem no numerador, nem no denominador.",
    source: "Agenda + horário de trabalho do Outlook",
  },
  {
    term: "Reuniões emendadas",
    definition:
      "Reuniões que começam a menos de cinco minutos do fim da anterior, sem respiro entre uma e outra.",
    source: "Agenda do Outlook",
  },
  {
    term: "Com quem você passou o tempo",
    definition:
      "A duração inteira de cada reunião conta para cada participante — uma hora com três pessoas é uma hora com cada uma. Por isso a soma da lista é maior que o seu tempo total, e deve ser mesmo.",
    source: "Participantes da agenda do Outlook",
  },
  {
    term: "Ações realizadas",
    definition:
      "Fatos com data e hora: reunião que aconteceu, pull request concluído, commit enviado, work item movimentado. Tarefa apenas atribuída a você não entra — é estado atual, não algo que aconteceu no período.",
    source: "Agenda do Outlook + Azure DevOps",
  },
];

/**
 * The page's own dictionary.
 *
 * Five Microsoft activity names that sound identical in everyday Portuguese —
 * reunião, chamada, conversa — plus a dozen terms this product invented. A
 * person who cannot tell them apart reads the whole screen as decoration, so
 * the definitions live one click away instead of in a document nobody opens.
 */
export function MyTimeGlossary() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="size-3.5" aria-hidden="true" />O que significa
          cada número
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            O que significa cada número
          </DialogTitle>
          <DialogDescription>
            Nada aqui é estimado ou inventado: cada linha diz de onde o número
            sai.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mr-4 h-[60vh] overflow-hidden pr-4">
          <div className="space-y-6">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Medido pela Microsoft
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Vem do Viva Insights, calculado pela própria Microsoft durante a
                madrugada. Por isso o dia de hoje costuma aparecer vazio.
              </p>

              <dl className="mt-3 space-y-3">
                {MICROSOFT_ORDER.map((kind) => (
                  <div
                    key={kind}
                    className="rounded-xl border border-border/50 bg-muted/20 px-3.5 py-3"
                  >
                    <dt className="text-sm font-medium text-foreground">
                      {ACTIVITY_LABELS[kind]}
                    </dt>
                    <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {ACTIVITY_DESCRIPTIONS[kind]}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* The two metrics people confuse, side by side. Explaining each
                one separately was not enough: the names are what collide. */}
            <section className="rounded-xl border border-brand-500/25 bg-brand-500/[0.04] px-3.5 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Duas medidas parecidas, coisas diferentes
              </h3>
              <dl className="mt-2 space-y-2 text-xs leading-relaxed">
                <div>
                  <dt className="font-medium text-foreground">
                    Espaço livre na agenda — a soma
                  </dt>
                  <dd className="text-muted-foreground">
                    Todas as janelas de 2h+ sem reunião, somadas, e medidas pela
                    Microsoft contra a <strong>janela do Outlook</strong> — não
                    contra a sua jornada. Diz pouco na prática: uma semana com
                    poucas reuniões deixa quase tudo livre. Por isso mora no
                    rodapé da tela, e não entre os números principais.
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">
                    Maior janela sem reunião — o recorde
                  </dt>
                  <dd className="text-muted-foreground">
                    Só o intervalo seguido mais longo. É o que responde
                    "consegui trabalhar sem ser interrompido em algum momento?",
                    e por isso é sempre bem menor.
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Calculado pelo OptSolv Time
              </h3>

              <dl className="mt-3 space-y-3">
                {OUR_TERMS.map((entry) => (
                  <div
                    key={entry.term}
                    className="rounded-xl border border-border/50 bg-muted/20 px-3.5 py-3"
                  >
                    <dt className="text-sm font-medium text-foreground">
                      {entry.term}
                    </dt>
                    <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {entry.definition}
                    </dd>
                    <dd className="mt-1.5 text-[11px] text-muted-foreground/80">
                      Fonte: {entry.source}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
