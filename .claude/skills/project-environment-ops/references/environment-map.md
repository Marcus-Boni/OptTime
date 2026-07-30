# Environment Map - OptSolv Time Tracker

## Topology

- Source control and collaboration
  - GitHub repository for code hosting and workflow automation
  - Azure DevOps usage in product integration flows
- CI/CD
  - Azure Pipelines file: `azure-pipelines.yml`
  - Build stage: pnpm install, Next build, package artifact
  - Deploy stage: Azure Web App deploy + startup command + health smoke test
- Hosting
  - Azure App Service Linux web app: `prd-opt-time`
  - Resource group: `rsg-opt-time-prd`
  - Runtime stack expected by pipeline: `NODE|24-lts`
- Authentication
  - Better Auth server config in `src/lib/auth.ts`
  - Next route mount in `src/app/api/auth/[...all]/route.ts`
  - Microsoft OAuth through Entra App Registration
- Data
  - Azure Database for PostgreSQL
  - Drizzle schema and migrations

## Critical URLs and routes

- Public app URL: from `NEXT_PUBLIC_APP_URL`
- Better Auth base URL: from `BETTER_AUTH_URL`
- Health endpoint: `/api/health`
- Auth callback (Microsoft): `/api/auth/callback/microsoft`
- Auth session lookup endpoint (used by proxy): `/api/auth/get-session`

## Environment variable matrix

Core runtime:

- `NEXT_PUBLIC_APP_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `DATABASE_URL`

Database tuning:

- `DB_POOL_MAX`
- `DB_POOL_IDLE_TIMEOUT_MS`
- `DB_POOL_CONNECTION_TIMEOUT_MS`
- `DB_SSL_REJECT_UNAUTHORIZED`

Auth provider:

- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`

Integration and secrets:

- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## Ops checklist before touching production

1. Confirm current pipeline succeeds on main.
2. Confirm app startup command still points to Next start.
3. Confirm `/api/health` returns 200 and DB check is up.
4. Confirm login works (Microsoft and/or email/password as applicable).
5. Confirm one protected endpoint returns 401 without session and 200 with session.
6. If cron-related change: confirm scheduler call includes Bearer `CRON_SECRET`.

## Fast triage hints

- Symptom: login loop to `/login`
  - Check `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` consistency
  - Check callback URL registered in Entra app
  - Check `/api/auth/get-session` behavior from proxy flow

- Symptom: health endpoint degraded
  - Check `DATABASE_URL` and SSL params
  - Check PostgreSQL connectivity and cert validation behavior

- Symptom: cron reminders not firing
  - Check GitHub Actions secret `APP_URL`
  - Check GitHub Actions secret `CRON_SECRET`
  - Check endpoint auth and logs
