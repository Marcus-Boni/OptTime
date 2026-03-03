---
trigger: always_on
---

# AGENTS.md — OptSolv Time Tracker

> Instruções operacionais para agentes de IA gerando código neste projeto.
> Leia este arquivo inteiro antes de escrever qualquer linha de código.
> Para especificação completa de produto, consulte PRD.md.

---

## 1. Identidade do Projeto

**OptSolv Time Tracker** — sistema interno de registro e gestão de horas de trabalho.
Stack: Next.js 16 App Router · TypeScript strict · TailwindCSS v4 · shadcn/ui · Better Auth · Neon + Drizzle ORM · Zustand · Framer Motion.
Referência de PRD completo: `PRD.md` na raiz do projeto.

---

## 2. Regras Invioláveis

Estas regras se aplicam a **todo e qualquer** arquivo gerado. Sem exceção.

### 2.1 TypeScript

```
❌ NUNCA use `any`           → use `unknown` com type guard ou tipo explícito
❌ NUNCA use `enum`          → use union type: type Status = "a" | "b" | "c"
❌ NUNCA omita return type   → async functions sempre tipam o retorno Promise<T>
❌ NUNCA use import relativo → use path alias: @/components, @/lib, @/hooks
✅ SEMPRE strict: true       → nenhum cast inseguro, nenhum null ignorado
✅ SEMPRE nomeie interfaces  → TimeEntryCardProps, não apenas Props
```

### 2.2 Segurança

```
❌ NUNCA exponha segredos em NEXT_PUBLIC_ ou no bundle do cliente
❌ NUNCA escreva no banco sem validação Zod prévia
❌ NUNCA execute operação em Route Handler sem verificar sessão primeiro
❌ NUNCA armazene o PAT do Azure DevOps em variável de ambiente do cliente
✅ SEMPRE: auth check → zod parse → business logic → db write
```

### 2.3 Qualidade

```
❌ NUNCA deixe TODO ou FIXME no código entregue
❌ NUNCA use console.log → use console.error com contexto: '[Componente] handler:'
❌ NUNCA use alert() → use toast.error() do Sonner
❌ NUNCA faça duplo submit → desabilite o botão durante loading
✅ SEMPRE trate o estado de loading, error e empty em componentes com fetch
✅ SEMPRE cleanup de listeners/subscriptions no return do useEffect
```

### 2.4 Design

```
❌ NUNCA hardcode cores hex no JSX → use tokens CSS ou classes Tailwind do tema
❌ NUNCA anime layout properties (width, height, top) → use transform + opacity
❌ NUNCA ignore dark mode → toda classe de cor precisa ter variante dark:
✅ SEMPRE respeite prefers-reduced-motion nas animações Framer Motion
✅ SEMPRE use next/image com width e height explícitos
```

# AGENTS.md — OptSolv Time Tracker

> Leia este arquivo **inteiro** antes de escrever qualquer linha de código.
> Para especificação completa de produto, consulte `PRD.md`.

---

## Stack

Next.js 15 App Router · TypeScript strict · TailwindCSS v4 · shadcn/ui · Better Auth · Neon + Drizzle ORM · Zustand · Framer Motion · Biome · Vercel

---

## Regras Absolutas

```
❌ any, enum, import relativo (../../), cor hex hardcoded no JSX
❌ console.log, alert(), TODO/FIXME no código entregue
❌ Route Handler sem session check · DB write sem Zod parse
❌ NEXT_PUBLIC_ para segredos · duplo submit · useEffect sem cleanup
✅ unknown + type guard · union types · path alias @/ · dark: em toda cor
✅ Ordem: auth → zod → business logic → db · loading/error/empty states
✅ Conventional commits: feat(scope): · fix(scope): · refactor(scope):
```

---

## Route Handler

```typescript
export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = mySchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  try {
    const result = await db.insert(table).values({ ...parsed.data, userId: session.user.id }).returning()
    return Response.json(result[0], { status: 201 })
  } catch (err) {
    console.error('[POST /api/x]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
```

---

## Componente React

```typescript
// Ordem obrigatória: imports externos → imports @/ → interface Props → constantes → default export

export interface MyComponentProps {
  resourceId: string
  onSuccess?: (result: MyType) => void
}

export default function MyComponent({ resourceId, onSuccess }: MyComponentProps) {
  // hooks no topo — nunca condicionais
  const [isLoading, setIsLoading] = useState(false)
  const { data, mutate } = useMyHook(resourceId)

  // handlers nomeados — nunca funções inline no JSX
  async function handleAction() {
    setIsLoading(true)
    try {
      await fetch(`/api/resource/${resourceId}`, { method: 'POST' })
      mutate()
      toast.success('Feito!')
      onSuccess?.(result)
    } catch (err: unknown) {
      console.error('[MyComponent] handleAction:', err)
      toast.error('Erro ao executar ação')
    } finally {
      setIsLoading(false)
    }
  }

  if (!data) return <Skeleton aria-label="Carregando..." role="status" />

  return (
    <div className="rounded-xl bg-neutral-900 border border-white/10 p-6">
      <Button onClick={handleAction} disabled={isLoading} aria-busy={isLoading}>
        {isLoading ? 'Processando...' : 'Executar'}
      </Button>
    </div>
  )
}
```

---

## Schema Zod

```typescript
export const createTimeEntrySchema = z.object({
  projectId:   z.string().uuid(),
  description: z.string().min(3).max(500),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration:    z.number().int().min(1).max(1440), // minutos
  billable:    z.boolean().default(true),
})
// Sempre inferir tipos — nunca definir manualmente
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>
```

---

## Animações Framer Motion

```typescript
// Stagger (listas de cards)
const container = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } } }

// Page transition
const page = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 } }
// transition: { duration: 0.3, ease: 'easeOut' }

// Scroll reveal — whileInView="visible" initial="hidden" viewport={{ once: true, amount: 0.2 }}
const reveal = { hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } } }

// Cards/botões — whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
// transition={{ type: 'spring', stiffness: 400, damping: 25 }}

// Regra: apenas transform + opacity. Sempre checar prefers-reduced-motion.
```

---

## Design Tokens

```
Backgrounds:  bg-neutral-950 (página) · bg-neutral-900 (card) · bg-neutral-800 (input) · bg-orange-500/10 (brand sutil)
Bordas:       border-white/10 (card) · border-neutral-700 (input) · hover:border-orange-500/30 · focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20
Texto:        text-white · text-neutral-400 (secundário) · text-orange-400 (brand) · text-red-400 (erro) · text-green-400 (sucesso)
Tipografia:   font-sora (headings) · font-sans/DM Sans (body) · font-mono/JetBrains Mono (horas, códigos)
Radius:       rounded-xl (card) · rounded-lg (input/button) · rounded-full (badge)
Espaçamento:  grid de 4pt — múltiplos Tailwind (1,2,3,4,6,8,12,16)
Botão primário: máx. 1 acima do fold · área mínima 44×44px (WCAG)
```

---

## Acessibilidade (WCAG AA — obrigatório)

```
· aria-label em todo elemento interativo sem texto visível
· htmlFor + id em todos os campos de formulário
· aria-describedby no input quando há mensagem de erro
· alt="" em imagens decorativas · alt descritivo em informativas
· Modais: focus trap + Escape para fechar + retorno de foco ao origin
· Contraste mínimo 4.5:1 texto normal · 3:1 texto grande
```

---

## Estrutura de Nova Feature

```
components/[feature]/
  index.ts              ← barrel export
  [Feature]List.tsx
  [Feature]Card.tsx
  [Feature]Form.tsx
  [Feature]Skeleton.tsx

app/api/[feature]/
  route.ts              ← GET + POST
  [id]/route.ts         ← GET + PUT + DELETE

lib/validations/[feature].schema.ts
hooks/use[Feature].ts
```

---

## Checklist Pré-Entrega

```
□ Zero `any` · tipos explícitos · union types · path alias @/
□ Hooks no topo · handlers nomeados · loading/error/empty implementados
□ Skeleton loader em todo data fetching inicial
□ Cores via tokens/Tailwind · dark: em todas · espaçamento 4pt grid
□ Responsivo: 375px → 768px → 1280px · fontes corretas por contexto
□ Animações: transform+opacity only · prefers-reduced-motion respeitado
□ Session check primeiro no Route Handler · Zod antes de qualquer DB write
□ Nenhum segredo em NEXT_PUBLIC_ · useEffect com cleanup
□ next/image com width+height · dynamic() em componentes pesados
□ Sem TODO/FIXME · console.error com contexto · toast.error para usuário
□ Commit: feat(scope): / fix(scope): / refactor(scope):
```

---
