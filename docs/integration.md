# OptSolv Time Tracker — Integration API v1

Internal REST API for service-to-service (M2M) integration across OptSolv apps.

---

## Overview

- **Base URL:** `/api/v1`
- **Auth:** OAuth2 client_credentials via Microsoft Entra ID (M2M only — user tokens rejected)
- **Versioning:** URL-based (`/api/v1/`). This layer is parallel to the existing user-facing API and does not touch it.
- **Interactive docs:** `GET /api/v1/docs` (Swagger UI)
- **OpenAPI spec:** `GET /api/v1/openapi.json`

---

## How to register a consumer app in Entra

### 1. Create an App Registration for your consuming app (e.g. opt-pms)

In Azure Portal → Entra ID → App registrations → New registration:

- **Name:** `opt-pms` (or your app's name)
- **Supported account types:** Accounts in this organizational directory only
- Save the **Application (client) ID** and **Directory (tenant) ID**.

Under **Certificates & secrets → Client secrets**, create a secret and save it securely.

### 2. Expose the API on the opt-time-api App Registration

In the opt-time-api App Registration:

1. **Expose an API** → Set the Application ID URI (e.g. `api://<opt-time-client-id>`).
2. Add app roles (under **App roles**):
   - `opt-time.read` — Display name: "Read time data", Value: `opt-time.read`, Allowed: Applications
   - `opt-time.write` — Value: `opt-time.write`, Allowed: Applications
   - `opt-time.admin` — Value: `opt-time.admin`, Allowed: Applications

### 3. Grant your consuming app the roles it needs

In your consuming app registration (e.g. opt-pms):

1. **API permissions → Add a permission → My APIs → opt-time-api**
2. Select **Application permissions** → check the roles needed (e.g. `opt-time.read`)
3. Click **Grant admin consent**

### 4. Set the environment variable on opt-time

```bash
ENTRA_API_AUDIENCE=api://<opt-time-client-id>
```

---

## How to obtain a token

Use the OAuth2 client_credentials flow against your tenant's token endpoint:

```bash
curl -X POST \
  "https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=<YOUR_APP_CLIENT_ID>" \
  -d "client_secret=<YOUR_APP_CLIENT_SECRET>" \
  -d "scope=api://<OPT_TIME_CLIENT_ID>/.default" \
  -d "grant_type=client_credentials"
```

The response includes an `access_token` (JWT). Use it as a Bearer token in subsequent requests.

---

## curl examples

### Check you get 401 without a token

```bash
curl -i https://time.optsolv.com.br/api/v1/time-entries
# → 401 UNAUTHORIZED
```

### List time entries (requires opt-time.read)

```bash
TOKEN="eyJ..."   # JWT from the token endpoint above

curl -H "Authorization: Bearer $TOKEN" \
  "https://time.optsolv.com.br/api/v1/time-entries?from=2026-05-01&to=2026-05-31&limit=20"
```

### Get a single time entry

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://time.optsolv.com.br/api/v1/time-entries/<entry-id>"
```

### List active users

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://time.optsolv.com.br/api/v1/users"
```

### List projects (filter by status)

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://time.optsolv.com.br/api/v1/projects?status=active"
```

### Register a webhook subscription (requires opt-time.admin)

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://opt-pms.azurewebsites.net/webhooks/opt-time","secret":"your-hmac-secret-min-16-chars","events":["ping"]}' \
  "https://time.optsolv.com.br/api/v1/webhooks/subscriptions"
```

The `secret` is stored encrypted and **never returned again**. Keep it safe — it is used to verify `X-OptSolv-Signature` on every delivery.

### Test a webhook delivery (requires opt-time.admin)

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://opt-pms.azurewebsites.net/webhooks/opt-time","secret":"your-hmac-secret-min-16-chars"}' \
  "https://time.optsolv.com.br/api/v1/webhooks/test-dispatch"
```

---

## Pagination

All list endpoints return `{ data: [...], nextCursor: "..." | null }`.

Pass `nextCursor` as the `?cursor=` parameter in the next request:

```bash
# First page
curl ".../api/v1/time-entries?limit=50"

# Next page (using nextCursor from previous response)
curl ".../api/v1/time-entries?limit=50&cursor=<nextCursor>"
```

---

## Webhook signature verification

Every delivery includes an `X-OptSolv-Signature: sha256=<hex>` header.

Verify it on the receiver side before trusting the payload:

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto'

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

---

## Webhook retry schedule

Failed deliveries are retried up to 5 times with exponential backoff:

| Attempt | Delay after failure |
|---------|---------------------|
| 2       | 1 minute            |
| 3       | 2 minutes           |
| 4       | 4 minutes           |
| 5       | 8 minutes           |
| 6 (final) | 16 minutes → marked `failed` |

The retry cron is triggered via `POST /api/cron/retry-webhooks` with `Authorization: Bearer <CRON_SECRET>`.

---

## Rate limits

Default: **600 requests/minute** per `client_id`. Response headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Max requests per window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

On limit exceeded: `429 RATE_LIMITED`.

> **Note:** The current implementation is in-memory (per process). For multi-instance deployments, migrate the rate limiter to Redis or Upstash (`src/lib/integration/rate-limit.ts`).

---

## Error response format

All errors follow this shape:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid Authorization header",
    "details": null
  }
}
```

Common codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).
