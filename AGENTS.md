# AGENTS.md — OptSolv Time Tracker

> Ponto de entrada para agentes de IA que geram código neste repositório.
> Leia este arquivo antes de escrever qualquer linha de código.

---

## Onde está cada coisa

| Documento                                              | Para quê                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                | PRD completo: escopo, arquitetura, design system, regras de negócio, checklist de conformidade |
| [`.agents/rules/agents.md`](.agents/rules/agents.md)    | Regras invioláveis e templates de código (Route Handler, componente, schema Zod) |
| [`docs/onboarding.md`](docs/onboarding.md)              | **Contrato de onboarding — obrigatório para toda tela nova**   |
| [`src/app/CLAUDE.md`](src/app/CLAUDE.md)                | Regras de páginas e roteamento (App Router)                    |
| [`src/app/api/CLAUDE.md`](src/app/api/CLAUDE.md)        | Regras de Route Handlers, auth e validação                     |
| [`PRD.md`](PRD.md)                                      | Especificação de produto de referência                         |
| [`README.md`](README.md)                                | Setup local e variáveis de ambiente                            |

---

## Stack

Next.js 16 (App Router) · TypeScript strict · TailwindCSS v4 · shadcn/ui ·
Better Auth (credentials + Microsoft Entra ID) · Azure Database for PostgreSQL +
Drizzle ORM · Zustand · Framer Motion · Recharts · Biome.

Gerenciador de pacotes: **pnpm**.

---

## Regras invioláveis (resumo)

```
❌ NUNCA use any            → unknown com type guard ou tipo explícito
❌ NUNCA use enum           → union type
❌ NUNCA import relativo    → path alias @/
❌ NUNCA escreva no banco sem validação Zod prévia
❌ NUNCA exponha segredo em NEXT_PUBLIC_ ou no bundle do cliente
✅ SEMPRE valide sessão no início de todo Route Handler protegido
✅ SEMPRE tipe o retorno de funções async
✅ SEMPRE anime só transform e opacity, respeitando prefers-reduced-motion
```

Detalhes e exemplos em [`.agents/rules/agents.md`](.agents/rules/agents.md).

---

## Regra específica deste produto: toda tela nova entra no onboarding

O produto tem um onboarding guiado por perfil de acesso (tours com spotlight,
checklist de primeiros passos e Central de Ajuda em `/dashboard/onboarding`).

**Ao criar qualquer tela, aba, widget ou funcionalidade nova, você também deve:**

1. Marcar as âncoras no JSX com `data-tour="<nome-por-função>"`
2. Cobrir a tela em `src/lib/onboarding/tours.ts` — passo novo em um tour
   existente, ou tour novo se for um módulo inteiro
3. Declarar `roles` nos passos restritos a manager/admin
4. Se for marco de adoção, adicionar a tarefa em
   `src/lib/onboarding/checklist.ts` (preferindo `kind: "signal"`)

O contrato completo, incluindo a lista de âncoras já existentes e o que o motor
de tours resolve sozinho, está em [`docs/onboarding.md`](docs/onboarding.md).

> Nenhuma tarefa de onboarding pode premiar registrar **mais horas** — vale a
> mesma regra anti-excesso que governa a gamificação.

---

## Antes de entregar

```bash
pnpm verify:onboarding
```

```bash
npx tsc --noEmit
```

```bash
npx biome check
```

```bash
npx next build
```

Commits em conventional commits: `feat(scope):`, `fix(scope):`, `refactor(scope):`.
