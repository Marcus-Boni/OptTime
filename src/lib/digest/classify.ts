/**
 * Keyword classifier for the kind of work an entry represents.
 *
 * Time entries do not carry an Azure DevOps work-item type, and fetching one
 * per entry would make the weekly cron unaffordable. So the category is inferred
 * from the words the user themselves wrote. It is a heuristic, and every surface
 * that shows it says so — never presented as authoritative data.
 *
 * Order matters: the first matching category wins, so the more specific
 * vocabularies are checked before the generic ones.
 */

import type { WorkCategory } from "./types";

export const CATEGORY_LABELS: Record<WorkCategory, string> = {
  feature: "Features",
  bugfix: "Correções",
  refactor: "Refatoração",
  meeting: "Reuniões",
  docs: "Documentação",
  support: "Suporte",
  other: "Outros",
};

/** Ordered so specific vocabularies win over broad ones. */
const CATEGORY_KEYWORDS: Array<{
  category: WorkCategory;
  keywords: string[];
}> = [
  {
    category: "meeting",
    keywords: [
      "reuniao",
      "reunião",
      "meeting",
      "daily",
      "planning",
      "retro",
      "retrospectiva",
      "review",
      "alinhamento",
      "call",
      "1:1",
      "grooming",
      "refinamento",
      "kickoff",
      "cerimonia",
      "cerimônia",
    ],
  },
  {
    category: "bugfix",
    keywords: [
      "bug",
      "fix",
      "corrig",
      "correcao",
      "correção",
      "hotfix",
      "erro",
      "falha",
      "defeito",
      "quebrad",
      "ajuste de erro",
      "patch",
      "regressao",
      "regressão",
    ],
  },
  {
    category: "refactor",
    keywords: [
      "refator",
      "refactor",
      "cleanup",
      "limpeza",
      "melhoria tecnica",
      "melhoria técnica",
      "tech debt",
      "debito tecnico",
      "débito técnico",
      "reescrit",
      "otimiza",
      "performance",
      "migracao",
      "migração",
    ],
  },
  {
    category: "docs",
    keywords: [
      "document",
      "docs",
      "readme",
      "manual",
      "especificacao",
      "especificação",
      "adr",
      "wiki",
      "changelog",
    ],
  },
  {
    category: "support",
    keywords: [
      "suporte",
      "support",
      "atendimento",
      "duvida",
      "dúvida",
      "chamado",
      "ticket",
      "incidente",
      "deploy",
      "release",
      "monitora",
      "on-call",
      "plantao",
      "plantão",
    ],
  },
  {
    category: "feature",
    keywords: [
      "feature",
      "implement",
      "desenvolv",
      "criar",
      "criacao",
      "criação",
      "nova tela",
      "novo endpoint",
      "adicion",
      "construir",
      "feat",
      "funcionalidade",
      "integra",
      "tela de",
    ],
  },
];

/** Strips accents so "correção" and "correcao" match the same keywords. */
const DIACRITICS = /[\u0300-\u036f]/g;

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(DIACRITICS, "");
}

/**
 * Classifies one entry. `workItemTitle` is weighed together with the
 * description, since a linked work item often names the intent better.
 */
export function classifyWorkCategory(
  description: string,
  workItemTitle?: string | null,
): WorkCategory {
  const haystack = normalize(`${description} ${workItemTitle ?? ""}`);
  if (!haystack.trim()) return "other";

  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => haystack.includes(normalize(keyword)))) {
      return category;
    }
  }

  return "other";
}
