# Design

## Source of truth
Active · 2026-09-29 · Central de Gestão (`/dashboard/hq`). Evidence: CLAUDE.md, .agents/rules/agents.md, docs/onboarding.md, HQ components, API DTOs and budget/allocation/approval services. No supplied visual reference. Other product surfaces retain their existing conventions.

## Brand
OptSolv: precise, calm and professional. Use the existing orange accent, Sora headings, DM Sans body and monospace time values. Trust comes from visible units, timestamps, explanations and reviewable actions. Avoid decorative metrics and fabricated predictions.

## Product goals
Make budget exposure visible, identify allocation conflicts early, and reduce approval review effort. Success signals: administrators can identify contracted/consumed/remaining hours, find an overloaded future week and inspect entries before deciding. No monetary estimates, automatic approvals or incentive to log more hours.

## Personas and jobs
Admins oversee the accessible portfolio. Managers review projects and people within existing permission scopes. Both need scan-first summaries followed by evidence and a concrete next action.

## Information architecture
Keep Radar, Capacidade, Aprovações and Portal do Cliente tabs and URL navigation. Each improved tab has a decision summary, search/filter controls and detailed records. Radar links to the existing project detail and budget editing flow. Capacity edits existing allocations. Approvals reuse existing authorized review endpoints.

## Design principles
Show recorded facts separately from planned work and forecasts. Compare budgeted consumption only against corresponding budgets. Sum positive balances and individual overruns separately. Missing budget is a planning gap; zero is an explicit limit. A clean timesheet means no blocking detector findings, not a guarantee of correctness.

## Visual language
Reuse semantic card/background/border/text tokens and brand classes. Rounded panels, restrained gradient on summary, generous spacing and clear numeric hierarchy. Semantic warnings include text, not only color. Motion uses transform and opacity and respects reduced motion.

## Components
Reuse Card, Badge, Button, Input, Select, Progress, Dialog, AlertDialog and Tooltip. Maintain existing charts, allocation editor and approval mutation controllers. Avoid new dependencies and a parallel token system.

## Accessibility
WCAG AA target: named controls, visible keyboard focus, semantic headings and definition lists, descriptive chart summaries, live result counts and dialog focus handling. Reduced motion disables entrance/chart animations. Every destructive business decision requires existing review and reason semantics.

## Responsive behavior
Summary uses two columns on phones and four on desktop. Detail cards stack before the desktop breakpoint. Tab controls match Registro de Tempo: a compact rounded strip with orange active text and horizontal scrolling on narrow screens. The capacity matrix scrolls horizontally while person identifiers remain visible. Review content scrolls within the dialog.

## Interaction states
Keep initial skeletons, retryable errors, no-data guidance and filter-empty states. Show generated timestamps. Disable conflicting mutations while submitting; show actual batch results. Confirm the exact visible conformant batch before execution.

## Content voice
Brazilian Portuguese, direct and useful. Prefer orçamento de horas, consumido, saldo, excedente, registrado, planejado and revisar. Explain data coverage and forecast method. Do not describe low current-week logging as proven availability.

## Implementation constraints
Next.js App Router, strict TypeScript, existing hooks and scoped authenticated APIs. Derive summaries with pure functions and test budget boundaries, missing data and zero limits. New anchors belong in the management onboarding tour. Run typecheck, Biome, onboarding checks and production build. Visual QA uses local data when an authenticated session is unavailable and must be labeled accordingly.

## Open questions
No design-critical open questions. Production data and authenticated manager/admin tours require an available session for live verification.
