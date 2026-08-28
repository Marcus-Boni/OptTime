# CLAUDE.md - Pages and Routing (Next.js 16)

This guide applies to page and layout work under `src/app/**`.

## Routing model used in this project

- Primary model: Next.js App Router (`page.tsx`, `layout.tsx`, `route.ts`).
- Route groups are used (for example `(auth)` and `(dashboard)`).
- Request interception/auth boundary uses `src/proxy.ts`.
- Legacy Pages Router (`src/pages`) is not the default in this codebase.

## About "Page Router" in this repository

When this project says "page routing", implement new screens with App Router `page.tsx` unless a specific request explicitly asks for legacy `src/pages`.

## File conventions to follow

- Page files: `page.tsx`
- Shared shell per route tree: `layout.tsx`
- Loading state: `loading.tsx` when needed
- Error boundary: `error.tsx` when needed
- Not found UX: `not-found.tsx` when needed
- API endpoints: `route.ts` (never inside page component files)

Do not place `route.ts` and `page.tsx` at the same exact segment level for the same path.

## Server vs client component decision

Use Server Components by default. Add `"use client"` only when required by:

- browser APIs
- stateful hooks (`useState`, `useEffect`)
- interactive event handlers
- client-only libraries

If a page must be client-heavy, keep data/business logic split into hooks/services instead of large monolithic page files.

## Auth and access flow

- Dashboard routes are protected by proxy matcher.
- Protected APIs still enforce session/role checks server-side.
- For page-level secure rendering, keep auth assumptions aligned with API guards.

## Data-loading best practices for pages

- Fetch critical initial data on server when possible.
- Use client hooks for interactive/polling flows.
- Prevent waterfalls by parallelizing independent requests.
- Handle pending/empty/error UI states explicitly.

## UI and UX consistency requirements

- Respect project typography and design tokens from root layout/globals.
- Keep accessibility baseline (labels, keyboard focus, semantic headings).
- Preserve responsive behavior for mobile/tablet/desktop breakpoints.
- Prefer subtle transform/opacity animations that do not introduce layout shift.

## Navigation and redirects

- Route protection redirect logic belongs in proxy and server-side auth checks.
- Client redirects should be used only for UX flows, not as primary security.
- Keep login redirect targets and callback behavior consistent with auth config.

## Metadata and platform conventions

- Root metadata/viewport are defined in `src/app/layout.tsx`.
- Keep metadata changes centralized and intentional.
- Avoid duplicating global concerns in individual pages unless needed.

## Legacy Pages Router rule (only if explicitly requested)

If a task explicitly requires Pages Router:

1. Use `src/pages/*` file-system routing.
2. Keep tests and non-route files outside `src/pages`.
3. Do not mix duplicate routes between App Router and Pages Router.
4. Define migration intent clearly in the task output.

## Guided onboarding (required for every new screen)

Every new route, tab or major widget must be reachable through the guided
onboarding, otherwise new users never discover it.

1. Add `data-tour="<name-by-function>"` to the screen's key anchors.
2. Cover the screen in `src/lib/onboarding/tours.ts` — a new step in an existing
   tour, or a new tour when it is a whole module.
3. Declare `roles` on steps restricted to manager/admin.
4. If the screen is an adoption milestone, add the task to
   `src/lib/onboarding/checklist.ts`, preferring `kind: "signal"`.

Full contract: `docs/onboarding.md`.

## Done criteria for page changes

Before finishing a page task:

1. Route resolves correctly and matches expected URL path.
2. Authentication behavior matches role and session rules.
3. Loading/error/empty states are present where applicable.
4. No API logic is embedded in page rendering code.
5. The screen is covered by the guided onboarding (see section above).
6. `pnpm run build` passes.
