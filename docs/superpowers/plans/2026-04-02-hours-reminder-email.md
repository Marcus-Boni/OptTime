# Hours Reminder Email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins/managers to send email reminders to team members about submitting their hours, with both manual (individual or bulk) and scheduled automatic sending.

**Architecture:** New Drizzle tables (`reminderSchedule`, `reminderLog`) + shared utility for recipient resolution + Resend batch email + four API routes + three React UI components integrated into the People page.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle ORM + Azure Database for PostgreSQL, Resend batch email, shadcn/ui (Dialog, Sheet, Switch), Zod, Framer Motion, Sonner toasts.

---

## File Map

| File                                               | Action | Responsibility                                              |
| -------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `src/lib/db/schema.ts`                             | Modify | Add `reminderSchedule` + `reminderLog` tables and relations |
| `src/lib/validations/reminder.schema.ts`           | Create | Zod schemas for schedule config and manual send             |
| `src/lib/notifications/resolve-recipients.ts`      | Create | `getISOWeekPeriod()` + `resolveReminderRecipients()`        |
| `src/lib/email.ts`                                 | Modify | Add `sendHoursReminderBatch()` + HTML template builder      |
| `src/app/api/notifications/reminders/route.ts`     | Create | `POST` — manual reminder send                               |
| `src/app/api/notifications/schedule/route.ts`      | Create | `GET` / `PUT` — schedule configuration                      |
| `src/app/api/notifications/schedule/logs/route.ts` | Create | `GET` — send history (paginated)                            |
| `src/app/api/cron/reminders/route.ts`              | Create | `POST` — cron-triggered batch send                          |
| `src/components/people/ReminderSingleModal.tsx`    | Create | Single-user reminder dialog                                 |
| `src/components/people/ReminderBulkModal.tsx`      | Create | Bulk team reminder dialog                                   |
| `src/components/people/ReminderScheduleDrawer.tsx` | Create | Schedule config + history sheet                             |
| `src/components/people/PersonCard.tsx`             | Modify | Add Bell icon button + ReminderSingleModal                  |
| `src/app/(dashboard)/dashboard/people/page.tsx`    | Modify | Add bulk + schedule action buttons                          |
| `.env.example`                                     | Modify | Add `CRON_SECRET`                                           |
| `.github/workflows/reminder-cron.yml`              | Create | GitHub Actions cron trigger                                 |

---

## Task 1: Schema — Add reminderSchedule and reminderLog tables

**Files:**

- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add the two tables and their relations to schema.ts**

  Open `src/lib/db/schema.ts`. After the `appReleaseRelations` block at the end of the file, append:

  ```typescript
  // ─── Reminder Schedule ────────────────────────────────────────────────────────
  export type ReminderCondition = "all" | "not_submitted";
  export type ReminderTargetScope = "all" | "direct_reports";
  export type ReminderTriggeredBy = "manual" | "schedule";

  export const reminderSchedule = pgTable("reminder_schedule", {
    id: text("id").primaryKey(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    daysOfWeek: integer("days_of_week").array().notNull(),
    hour: integer("hour").notNull().default(16),
    minute: integer("minute").notNull().default(0),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    /** "all" | "not_submitted" */
    condition: text("condition").notNull().default("not_submitted"),
    /** "all" | "direct_reports" */
    targetScope: text("target_scope").notNull().default("direct_reports"),
    lastTriggeredAt: timestamp("last_triggered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  });

  export const reminderLog = pgTable(
    "reminder_log",
    {
      id: text("id").primaryKey(),
      scheduleId: text("schedule_id").references(() => reminderSchedule.id, {
        onDelete: "set null",
      }),
      /** "manual" | "schedule" */
      triggeredBy: text("triggered_by").notNull(),
      triggeredById: text("triggered_by_id").references(() => user.id, {
        onDelete: "set null",
      }),
      personalNote: text("personal_note"),
      recipientCount: integer("recipient_count").notNull().default(0),
      failedCount: integer("failed_count").notNull().default(0),
      createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (table) => [
      index("reminder_log_schedule_idx").on(table.scheduleId),
      index("reminder_log_created_at_idx").on(table.createdAt),
    ],
  );

  export const reminderScheduleRelations = relations(
    reminderSchedule,
    ({ one, many }) => ({
      createdBy: one(user, {
        fields: [reminderSchedule.createdById],
        references: [user.id],
      }),
      logs: many(reminderLog),
    }),
  );

  export const reminderLogRelations = relations(reminderLog, ({ one }) => ({
    schedule: one(reminderSchedule, {
      fields: [reminderLog.scheduleId],
      references: [reminderSchedule.id],
    }),
    triggeredByUser: one(user, {
      fields: [reminderLog.triggeredById],
      references: [user.id],
    }),
  }));
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors on schema.ts.

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/db/schema.ts
  git commit -m "feat: add reminderSchedule and reminderLog tables to schema"
  ```

---

## Task 2: Database Migration

**Files:**

- `drizzle/` (auto-generated)

- [ ] **Step 1: Generate migration file**

  ```bash
  npx drizzle-kit generate
  ```

  Expected: a new `.sql` file created in `./drizzle/` containing `CREATE TABLE reminder_schedule` and `CREATE TABLE reminder_log`.

- [ ] **Step 2: Apply migration to database**

  ```bash
  npx drizzle-kit push
  ```

  Expected: output confirms both tables were created successfully.

- [ ] **Step 3: Commit migration**

  ```bash
  git add drizzle/
  git commit -m "feat: add reminder_schedule and reminder_log migrations"
  ```

---

## Task 3: Zod Validation Schemas

**Files:**

- Create: `src/lib/validations/reminder.schema.ts`

- [ ] **Step 1: Create the validation file**

  ```typescript
  // src/lib/validations/reminder.schema.ts
  import { z } from "zod";

  export const sendReminderSchema = z.object({
    userIds: z.array(z.string().min(1)).optional(),
    note: z.string().max(500).optional(),
    scope: z.enum(["all", "direct_reports"]).optional(),
  });

  export type SendReminderInput = z.infer<typeof sendReminderSchema>;

  export const updateScheduleSchema = z.object({
    enabled: z.boolean(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(0).max(7),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    timezone: z.string().min(1).max(100),
    condition: z.enum(["all", "not_submitted"]),
    targetScope: z.enum(["all", "direct_reports"]),
  });

  export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/lib/validations/reminder.schema.ts
  git commit -m "feat: add Zod validation schemas for reminders"
  ```

---

## Task 4: Recipient Resolution Utility

**Files:**

- Create: `src/lib/notifications/resolve-recipients.ts`

- [ ] **Step 1: Create the utility file**

  ```typescript
  // src/lib/notifications/resolve-recipients.ts
  import { and, eq, inArray } from "drizzle-orm";
  import { db } from "@/lib/db";
  import { timesheet, user } from "@/lib/db/schema";

  export interface ReminderRecipient {
    id: string;
    name: string;
    email: string;
  }

  /** Returns current ISO week period string, e.g. "2026-W14" */
  export function getISOWeekPeriod(date: Date = new Date()): string {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const day = d.getUTCDay() || 7; // ISO: Mon=1 … Sun=7
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  export async function resolveReminderRecipients({
    actorId,
    scope,
    condition,
    userIds,
  }: {
    actorId: string;
    scope: "all" | "direct_reports";
    condition: "all" | "not_submitted";
    userIds?: string[];
  }): Promise<ReminderRecipient[]> {
    let candidates: ReminderRecipient[];

    if (userIds && userIds.length > 0) {
      // Individual selection: fetch only the specified users
      const rows = await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(and(inArray(user.id, userIds), eq(user.isActive, true)));
      candidates = rows;
    } else if (scope === "all") {
      // Admin bulk: all active users
      const rows = await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.isActive, true));
      candidates = rows;
    } else {
      // Manager bulk: direct reports only
      const rows = await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(and(eq(user.managerId, actorId), eq(user.isActive, true)));
      candidates = rows;
    }

    if (condition !== "not_submitted") {
      return candidates;
    }

    // Filter: keep only users who have NOT submitted their current week timesheet
    const currentPeriod = getISOWeekPeriod();
    const candidateIds = candidates.map((c) => c.id);

    if (candidateIds.length === 0) return [];

    const submittedRows = await db
      .select({ userId: timesheet.userId })
      .from(timesheet)
      .where(
        and(
          inArray(timesheet.userId, candidateIds),
          eq(timesheet.period, currentPeriod),
          inArray(timesheet.status, ["submitted", "approved"] as string[]),
        ),
      );

    const submittedUserIds = new Set(submittedRows.map((r) => r.userId));
    return candidates.filter((c) => !submittedUserIds.has(c.id));
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/lib/notifications/resolve-recipients.ts
  git commit -m "feat: add resolveReminderRecipients and getISOWeekPeriod utilities"
  ```

---

## Task 5: Email Template — sendHoursReminderBatch

**Files:**

- Modify: `src/lib/email.ts`

- [ ] **Step 1: Add the interface, batch function, and HTML builder to email.ts**

  Append to the end of `src/lib/email.ts`:

  ```typescript
  // ─── Hours Reminder Email ─────────────────────────────────────────────────────

  export interface HoursReminderEmailData {
    to: string;
    recipientName: string;
    period: string; // e.g. "2026-W14"
    condition: "all" | "not_submitted";
    senderName: string;
    personalNote?: string;
    timesheetUrl: string;
  }

  /**
   * Sends hours reminder emails to multiple recipients using Resend batch API.
   * Automatically splits into chunks of 100 (Resend limit).
   */
  export async function sendHoursReminderBatch(
    recipients: Array<{ id: string; name: string; email: string }>,
    payload: {
      period: string;
      condition: "all" | "not_submitted";
      senderName: string;
      personalNote?: string;
      timesheetUrl: string;
    },
  ): Promise<{ sent: number; failed: number }> {
    const resend = getResendClient();
    const from =
      process.env.RESEND_FROM_EMAIL ?? "OptSolv Time <noreply@optsolv.com.br>";

    const BATCH_SIZE = 100;
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const chunk = recipients.slice(i, i + BATCH_SIZE);
      const emails = chunk.map((r) => ({
        from,
        to: r.email,
        subject: `Lembrete: envie suas horas — ${payload.period}`,
        html: buildHoursReminderEmailHtml({
          to: r.email,
          recipientName: r.name,
          ...payload,
        }),
      }));

      try {
        const { data: batchData, error } = await resend.batch.send(emails);
        if (error) {
          console.error(
            "[sendHoursReminderBatch] Batch error:",
            JSON.stringify(error),
          );
          failed += chunk.length;
        } else {
          sent += batchData?.data?.length ?? chunk.length;
        }
      } catch (err) {
        console.error("[sendHoursReminderBatch] Unexpected error:", err);
        failed += chunk.length;
      }
    }

    return { sent, failed };
  }

  function buildHoursReminderEmailHtml(data: HoursReminderEmailData): string {
    const bodyText =
      data.condition === "not_submitted"
        ? `Identificamos que você ainda não enviou suas horas referentes à semana <strong style="color:#e5e5e5;">${data.period}</strong>.`
        : `Este é um lembrete para enviar suas horas referentes à semana <strong style="color:#e5e5e5;">${data.period}</strong>.`;

    const noteBlock = data.personalNote
      ? `
      <!-- Personal note -->
      <tr>
        <td style="padding:0 40px 24px;">
          <div style="background:#1e1a14;border-left:3px solid #f97316;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="margin:0 0 4px;color:#f97316;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Mensagem de ${data.senderName}</p>
            <p style="margin:0;color:#d4d4d4;font-size:14px;line-height:1.6;">${data.personalNote}</p>
          </div>
        </td>
      </tr>`
      : "";

    return `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Lembrete de horas — OptSolv Time</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background-color:#141414;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;max-width:600px;width:100%;">
  
            <!-- Header -->
            <tr>
              <td style="padding:32px 40px 28px;background:linear-gradient(135deg,#f97316 0%,#c2410c 100%);">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:rgba(255,255,255,0.15);border-radius:10px;padding:8px 14px;">
                      <span style="color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-0.5px;">OptSolv <span style="opacity:0.8;">Time</span></span>
                    </td>
                  </tr>
                </table>
                <h1 style="margin:20px 0 0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.25;">⏰ Lembrete de envio de horas</h1>
                <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">${data.period}</p>
              </td>
            </tr>
  
            <!-- Greeting -->
            <tr>
              <td style="padding:32px 40px 20px;">
                <p style="margin:0 0 8px;color:#a3a3a3;font-size:14px;">Olá, <strong style="color:#e5e5e5;">${data.recipientName}</strong> 👋</p>
                <p style="margin:0;color:#a3a3a3;font-size:14px;line-height:1.7;">${bodyText}</p>
              </td>
            </tr>
  
            ${noteBlock}
  
            <!-- CTA -->
            <tr>
              <td style="padding:0 40px 32px;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);">
                      <a href="${data.timesheetUrl}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">
                        Enviar minhas horas →
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
  
            <!-- Footer -->
            <tr>
              <td style="padding:20px 40px 28px;border-top:1px solid rgba(255,255,255,0.06);">
                <p style="margin:0;color:#525252;font-size:11px;line-height:1.6;">
                  Enviado por <strong style="color:#737373;">${data.senderName}</strong> via <strong style="color:#737373;">OptSolv Time</strong>.
                  Este e-mail foi enviado para <strong style="color:#737373;">${data.to}</strong>.
                </p>
              </td>
            </tr>
  
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
    `.trim();
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors on email.ts.

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/email.ts
  git commit -m "feat: add sendHoursReminderBatch email function and HTML template"
  ```

---

## Task 6: API Route — POST /api/notifications/reminders

**Files:**

- Create: `src/app/api/notifications/reminders/route.ts`

- [ ] **Step 1: Create the route file**

  ```typescript
  // src/app/api/notifications/reminders/route.ts
  import { randomBytes } from "crypto";
  import { z } from "zod";
  import { getActiveSession, getActorContext } from "@/lib/access-control";
  import { getServerAppUrl } from "@/lib/app-url";
  import { db } from "@/lib/db";
  import { reminderLog } from "@/lib/db/schema";
  import { sendHoursReminderBatch } from "@/lib/email";
  import {
    getISOWeekPeriod,
    resolveReminderRecipients,
  } from "@/lib/notifications/resolve-recipients";
  import { sendReminderSchema } from "@/lib/validations/reminder.schema";

  export async function POST(req: Request): Promise<Response> {
    const session = await getActiveSession(req.headers);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = getActorContext(session.user);
    if (actor.role !== "admin" && actor.role !== "manager") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = sendReminderSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    const { userIds, note, scope: requestedScope } = parsed.data;

    // Managers are always restricted to direct_reports
    const scope =
      actor.role === "admin" ? (requestedScope ?? "all") : "direct_reports";

    const recipients = await resolveReminderRecipients({
      actorId: actor.userId,
      scope,
      condition: "all",
      userIds,
    });

    if (recipients.length === 0) {
      return Response.json({ sent: 0, failed: 0, logId: null });
    }

    const timesheetUrl = `${getServerAppUrl()}/dashboard/time`;
    const period = getISOWeekPeriod();

    const { sent, failed } = await sendHoursReminderBatch(recipients, {
      period,
      condition: "all",
      senderName: session.user.name,
      personalNote: note,
      timesheetUrl,
    });

    const logId = randomBytes(16).toString("hex");
    try {
      await db.insert(reminderLog).values({
        id: logId,
        scheduleId: null,
        triggeredBy: "manual",
        triggeredById: actor.userId,
        personalNote: note ?? null,
        recipientCount: recipients.length,
        failedCount: failed,
      });
    } catch (dbErr) {
      console.error(
        "[POST /api/notifications/reminders] log insert failed:",
        dbErr,
      );
    }

    if (sent === 0 && failed > 0) {
      return Response.json(
        { error: "Falha ao enviar e-mails" },
        { status: 502 },
      );
    }

    return Response.json({ sent, failed, logId });
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/notifications/reminders/route.ts
  git commit -m "feat: add POST /api/notifications/reminders endpoint"
  ```

---

## Task 7: API Route — GET + PUT /api/notifications/schedule

**Files:**

- Create: `src/app/api/notifications/schedule/route.ts`

- [ ] **Step 1: Create the route file**

  ```typescript
  // src/app/api/notifications/schedule/route.ts
  import { randomBytes } from "crypto";
  import { z } from "zod";
  import { getActiveSession, getActorContext } from "@/lib/access-control";
  import { db } from "@/lib/db";
  import { reminderSchedule } from "@/lib/db/schema";
  import { updateScheduleSchema } from "@/lib/validations/reminder.schema";

  async function getOrCreateSchedule(actorId: string) {
    const existing = await db.query.reminderSchedule.findFirst();
    if (existing) return existing;

    const id = randomBytes(16).toString("hex");
    const [created] = await db
      .insert(reminderSchedule)
      .values({
        id,
        createdById: actorId,
        enabled: false,
        daysOfWeek: [5], // Friday default
        hour: 16,
        minute: 0,
        timezone: "America/Sao_Paulo",
        condition: "not_submitted",
        targetScope: "direct_reports",
      })
      .returning();
    return created;
  }

  export async function GET(req: Request): Promise<Response> {
    const session = await getActiveSession(req.headers);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = getActorContext(session.user);
    if (actor.role !== "admin" && actor.role !== "manager") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
      const schedule = await getOrCreateSchedule(actor.userId);
      return Response.json(schedule);
    } catch (err) {
      console.error("[GET /api/notifications/schedule]", err);
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
  }

  export async function PUT(req: Request): Promise<Response> {
    const session = await getActiveSession(req.headers);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = getActorContext(session.user);
    if (actor.role !== "admin" && actor.role !== "manager") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = updateScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: z.flattenError(parsed.error).fieldErrors },
        { status: 400 },
      );
    }

    // Managers cannot set targetScope = "all"
    const data = parsed.data;
    if (actor.role === "manager" && data.targetScope === "all") {
      return Response.json(
        { error: "Gerentes não podem selecionar escopo global" },
        { status: 403 },
      );
    }

    try {
      const existing = await getOrCreateSchedule(actor.userId);
      const [updated] = await db
        .update(reminderSchedule)
        .set({
          enabled: data.enabled,
          daysOfWeek: data.daysOfWeek,
          hour: data.hour,
          minute: data.minute,
          timezone: data.timezone,
          condition: data.condition,
          targetScope: data.targetScope,
        })
        .returning();

      // suppress unused warning
      void existing;

      return Response.json(updated);
    } catch (err) {
      console.error("[PUT /api/notifications/schedule]", err);
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/notifications/schedule/route.ts
  git commit -m "feat: add GET/PUT /api/notifications/schedule endpoint"
  ```

---

## Task 8: API Route — GET /api/notifications/schedule/logs

**Files:**

- Create: `src/app/api/notifications/schedule/logs/route.ts`

- [ ] **Step 1: Create the route file**

  ```typescript
  // src/app/api/notifications/schedule/logs/route.ts
  import { desc } from "drizzle-orm";
  import { getActiveSession, getActorContext } from "@/lib/access-control";
  import { db } from "@/lib/db";
  import { reminderLog } from "@/lib/db/schema";

  export async function GET(req: Request): Promise<Response> {
    const session = await getActiveSession(req.headers);
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = getActorContext(session.user);
    if (actor.role !== "admin" && actor.role !== "manager") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 100);
    const offset = Number(url.searchParams.get("offset") ?? "0");

    try {
      const rows = await db
        .select()
        .from(reminderLog)
        .orderBy(desc(reminderLog.createdAt))
        .limit(limit)
        .offset(offset);

      return Response.json({ data: rows, limit, offset });
    } catch (err) {
      console.error("[GET /api/notifications/schedule/logs]", err);
      return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/api/notifications/schedule/logs/route.ts
  git commit -m "feat: add GET /api/notifications/schedule/logs endpoint"
  ```

---

## Task 9: API Route — POST /api/cron/reminders

**Files:**

- Create: `src/app/api/cron/reminders/route.ts`

- [ ] **Step 1: Create the route file**

  ```typescript
  // src/app/api/cron/reminders/route.ts
  import { randomBytes } from "crypto";
  import { eq } from "drizzle-orm";
  import { getServerAppUrl } from "@/lib/app-url";
  import { db } from "@/lib/db";
  import { reminderLog, reminderSchedule } from "@/lib/db/schema";
  import { sendHoursReminderBatch } from "@/lib/email";
  import {
    getISOWeekPeriod,
    resolveReminderRecipients,
  } from "@/lib/notifications/resolve-recipients";

  /** Returns current day-of-week (0=Sun…6=Sat), hour, minute in a given timezone. */
  function getLocalTime(tz: string): {
    dayOfWeek: number;
    hour: number;
    minute: number;
  } {
    const now = new Date();
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
    });
    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const dayStr = dayFormatter.format(now);
    const dayOfWeek = dayMap[dayStr] ?? 0;

    const parts = timeFormatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = parseInt(
      parts.find((p) => p.type === "minute")?.value ?? "0",
    );

    return { dayOfWeek, hour, minute };
  }

  export async function POST(req: Request): Promise<Response> {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return Response.json(
        { error: "CRON_SECRET not configured" },
        { status: 503 },
      );
    }

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token || token !== cronSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schedule = await db.query.reminderSchedule.findFirst({
      where: eq(reminderSchedule.enabled, true),
    });

    if (!schedule) {
      return Response.json({
        triggered: 0,
        skipped: 1,
        message: "No enabled schedule",
      });
    }

    // Idempotency: skip if triggered in the last 50 minutes
    if (schedule.lastTriggeredAt) {
      const diffMs = Date.now() - schedule.lastTriggeredAt.getTime();
      if (diffMs < 50 * 60 * 1000) {
        return Response.json({
          triggered: 0,
          skipped: 1,
          message: "Already triggered recently",
        });
      }
    }

    const { dayOfWeek, hour, minute } = getLocalTime(schedule.timezone);

    const dayMatch = (schedule.daysOfWeek as number[]).includes(dayOfWeek);
    const hourMatch = schedule.hour === hour;
    // Allow ±5 minute window
    const minuteMatch = Math.abs(schedule.minute - minute) <= 5;

    if (!dayMatch || !hourMatch || !minuteMatch) {
      return Response.json({
        triggered: 0,
        skipped: 1,
        message: "Not scheduled for this time",
      });
    }

    const recipients = await resolveReminderRecipients({
      actorId: schedule.createdById,
      scope: schedule.targetScope as "all" | "direct_reports",
      condition: schedule.condition as "all" | "not_submitted",
    });

    if (recipients.length === 0) {
      return Response.json({
        triggered: 1,
        skipped: 0,
        totalSent: 0,
        totalFailed: 0,
      });
    }

    const timesheetUrl = `${getServerAppUrl()}/dashboard/time`;
    const period = getISOWeekPeriod();

    const { sent, failed } = await sendHoursReminderBatch(recipients, {
      period,
      condition: schedule.condition as "all" | "not_submitted",
      senderName: "OptSolv Time",
      timesheetUrl,
    });

    // Update lastTriggeredAt and insert log
    await db
      .update(reminderSchedule)
      .set({ lastTriggeredAt: new Date() })
      .where(eq(reminderSchedule.id, schedule.id));

    const logId = randomBytes(16).toString("hex");
    await db.insert(reminderLog).values({
      id: logId,
      scheduleId: schedule.id,
      triggeredBy: "schedule",
      triggeredById: null,
      personalNote: null,
      recipientCount: recipients.length,
      failedCount: failed,
    });

    return Response.json({
      triggered: 1,
      skipped: 0,
      totalSent: sent,
      totalFailed: failed,
    });
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/cron/reminders/route.ts
  git commit -m "feat: add POST /api/cron/reminders secured cron endpoint"
  ```

---

## Task 10: ReminderSingleModal Component

**Files:**

- Create: `src/components/people/ReminderSingleModal.tsx`

- [ ] **Step 1: Create the component**

  ```typescript
  // src/components/people/ReminderSingleModal.tsx
  "use client";

  import { Bell, Loader2, X } from "lucide-react";
  import { useState } from "react";
  import { toast } from "sonner";
  import { Button } from "@/components/ui/button";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog";
  import { Label } from "@/components/ui/label";
  import { Textarea } from "@/components/ui/textarea";

  interface ReminderSingleModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    userName: string;
  }

  export default function ReminderSingleModal({
    open,
    onOpenChange,
    userId,
    userName,
  }: ReminderSingleModalProps) {
    const [note, setNote] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    function handleClose() {
      if (isLoading) return;
      setNote("");
      onOpenChange(false);
    }

    async function handleSend() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/notifications/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userIds: [userId],
            note: note.trim() || undefined,
          }),
        });

        const json = await res.json() as { error?: unknown; sent?: number };

        if (!res.ok) {
          const errMsg =
            typeof json.error === "string"
              ? json.error
              : "Erro ao enviar lembrete";
          toast.error(errMsg);
          return;
        }

        toast.success(`Lembrete enviado para ${userName}!`);
        handleClose();
      } catch (err: unknown) {
        console.error("[ReminderSingleModal] handleSend:", err);
        toast.error("Erro inesperado. Tente novamente.");
      } finally {
        setIsLoading(false);
      }
    }

    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent
          className="border-border/50 bg-card sm:max-w-md"
          onEscapeKeyDown={handleClose}
          onInteractOutside={(e) => { if (isLoading) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold">
              <Bell className="h-4 w-4 text-brand-400" aria-hidden="true" />
              Enviar lembrete
            </DialogTitle>
            <DialogDescription>
              Enviar lembrete de submissão de horas para{" "}
              <strong className="text-foreground">{userName}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reminder-note">Nota pessoal (opcional)</Label>
              <Textarea
                id="reminder-note"
                placeholder="Adicione uma mensagem personalizada que aparecerá no e-mail..."
                className="h-24 resize-none bg-background/50"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={isLoading}
                maxLength={500}
              />
              <p className="text-right text-xs text-muted-foreground">
                {note.length}/500
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="ghost"
              onClick={handleClose}
              disabled={isLoading}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancelar
            </Button>
            <Button
              className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
              onClick={handleSend}
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Enviando...
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  Enviar lembrete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/people/ReminderSingleModal.tsx
  git commit -m "feat: add ReminderSingleModal component"
  ```

---

## Task 11: ReminderBulkModal Component

**Files:**

- Create: `src/components/people/ReminderBulkModal.tsx`

- [ ] **Step 1: Create the component**

  ```typescript
  // src/components/people/ReminderBulkModal.tsx
  "use client";

  import { Bell, Loader2, Users, X } from "lucide-react";
  import { useState } from "react";
  import { toast } from "sonner";
  import { Button } from "@/components/ui/button";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog";
  import { Label } from "@/components/ui/label";
  import { Textarea } from "@/components/ui/textarea";

  interface ReminderBulkModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** "all" for admins, "direct_reports" for managers */
    scope: "all" | "direct_reports";
  }

  export default function ReminderBulkModal({
    open,
    onOpenChange,
    scope,
  }: ReminderBulkModalProps) {
    const [note, setNote] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ sent: number; failed: number } | null>(
      null,
    );

    function handleClose() {
      if (isLoading) return;
      setNote("");
      setResult(null);
      onOpenChange(false);
    }

    async function handleSend() {
      setIsLoading(true);
      try {
        const res = await fetch("/api/notifications/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope,
            note: note.trim() || undefined,
          }),
        });

        const json = await res.json() as {
          error?: unknown;
          sent?: number;
          failed?: number;
        };

        if (!res.ok) {
          const errMsg =
            typeof json.error === "string"
              ? json.error
              : "Erro ao enviar lembretes";
          toast.error(errMsg);
          return;
        }

        const sent = json.sent ?? 0;
        const failed = json.failed ?? 0;

        if (sent === 0 && failed === 0) {
          toast.info("Nenhum destinatário encontrado para envio.");
          handleClose();
          return;
        }

        setResult({ sent, failed });
        if (failed === 0) {
          toast.success(`${sent} lembrete(s) enviado(s) com sucesso!`);
        } else {
          toast.warning(
            `${sent} enviado(s), ${failed} falhou(ram). Verifique o histórico.`,
          );
        }
      } catch (err: unknown) {
        console.error("[ReminderBulkModal] handleSend:", err);
        toast.error("Erro inesperado. Tente novamente.");
      } finally {
        setIsLoading(false);
      }
    }

    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent
          className="border-border/50 bg-card sm:max-w-md"
          onEscapeKeyDown={handleClose}
          onInteractOutside={(e) => { if (isLoading) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold">
              <Users className="h-4 w-4 text-brand-400" aria-hidden="true" />
              Lembrar toda a equipe
            </DialogTitle>
            <DialogDescription>
              {scope === "all"
                ? "Será enviado um e-mail para todos os usuários ativos."
                : "Será enviado um e-mail para todos os seus subordinados diretos ativos."}
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-center">
              <p className="text-sm font-medium text-foreground">
                Lembretes enviados
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="text-green-400">{result.sent} enviado(s)</span>
                {result.failed > 0 && (
                  <span className="ml-2 text-red-400">
                    {result.failed} falha(s)
                  </span>
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="bulk-note">Nota pessoal (opcional)</Label>
                <Textarea
                  id="bulk-note"
                  placeholder="Adicione uma mensagem personalizada que aparecerá no e-mail de todos os destinatários..."
                  className="h-24 resize-none bg-background/50"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={isLoading}
                  maxLength={500}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {note.length}/500
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="ghost"
              onClick={handleClose}
              disabled={isLoading}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {result ? "Fechar" : "Cancelar"}
            </Button>
            {!result && (
              <Button
                className="gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
                onClick={handleSend}
                disabled={isLoading}
                aria-busy={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" aria-hidden="true" />
                    Enviar lembretes
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/components/people/ReminderBulkModal.tsx
  git commit -m "feat: add ReminderBulkModal component"
  ```

---

## Task 12: ReminderScheduleDrawer Component

**Files:**

- Create: `src/components/people/ReminderScheduleDrawer.tsx`

- [ ] **Step 1: Create the component**

  ```typescript
  // src/components/people/ReminderScheduleDrawer.tsx
  "use client";

  import { Calendar, CheckCircle, Loader2, Save } from "lucide-react";
  import { useCallback, useEffect, useState } from "react";
  import { toast } from "sonner";
  import { Button } from "@/components/ui/button";
  import { Label } from "@/components/ui/label";
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select";
  import { Separator } from "@/components/ui/separator";
  import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
  } from "@/components/ui/sheet";
  import { Switch } from "@/components/ui/switch";
  import { Input } from "@/components/ui/input";

  interface ScheduleData {
    id: string;
    enabled: boolean;
    daysOfWeek: number[];
    hour: number;
    minute: number;
    timezone: string;
    condition: "all" | "not_submitted";
    targetScope: "all" | "direct_reports";
    lastTriggeredAt: string | null;
  }

  interface LogEntry {
    id: string;
    triggeredBy: "manual" | "schedule";
    recipientCount: number;
    failedCount: number;
    personalNote: string | null;
    createdAt: string;
  }

  interface ReminderScheduleDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sessionRole: string;
  }

  const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const CONDITION_LABELS: Record<string, string> = {
    all: "Todos os usuários ativos",
    not_submitted: "Apenas quem não submeteu o timesheet da semana",
  };

  const SCOPE_LABELS: Record<string, string> = {
    all: "Toda a organização",
    direct_reports: "Meus subordinados diretos",
  };

  export default function ReminderScheduleDrawer({
    open,
    onOpenChange,
    sessionRole,
  }: ReminderScheduleDrawerProps) {
    const [schedule, setSchedule] = useState<ScheduleData | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const fetchData = useCallback(async () => {
      setIsLoading(true);
      try {
        const [schedRes, logsRes] = await Promise.all([
          fetch("/api/notifications/schedule"),
          fetch("/api/notifications/schedule/logs?limit=5"),
        ]);

        if (!schedRes.ok) {
          toast.error("Erro ao carregar configuração de agendamento.");
          return;
        }

        const schedData = await schedRes.json() as ScheduleData;
        setSchedule(schedData);

        if (logsRes.ok) {
          const logsData = await logsRes.json() as { data: LogEntry[] };
          setLogs(logsData.data ?? []);
        }
      } catch (err) {
        console.error("[ReminderScheduleDrawer] fetchData:", err);
        toast.error("Erro inesperado ao carregar dados.");
      } finally {
        setIsLoading(false);
      }
    }, []);

    useEffect(() => {
      if (open) void fetchData();
    }, [open, fetchData]);

    function toggleDay(day: number) {
      if (!schedule) return;
      const current = schedule.daysOfWeek;
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b);
      setSchedule({ ...schedule, daysOfWeek: next });
    }

    async function handleSave() {
      if (!schedule) return;
      setIsSaving(true);
      try {
        const res = await fetch("/api/notifications/schedule", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: schedule.enabled,
            daysOfWeek: schedule.daysOfWeek,
            hour: schedule.hour,
            minute: schedule.minute,
            timezone: schedule.timezone,
            condition: schedule.condition,
            targetScope: schedule.targetScope,
          }),
        });

        const json = await res.json() as { error?: unknown };
        if (!res.ok) {
          toast.error(
            typeof json.error === "string"
              ? json.error
              : "Erro ao salvar configuração.",
          );
          return;
        }

        toast.success("Agendamento atualizado com sucesso!");
        onOpenChange(false);
      } catch (err) {
        console.error("[ReminderScheduleDrawer] handleSave:", err);
        toast.error("Erro inesperado. Tente novamente.");
      } finally {
        setIsSaving(false);
      }
    }

    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-brand-400" aria-hidden="true" />
              Agendamento automático
            </SheetTitle>
            <SheetDescription>
              Configure quando os lembretes de horas serão enviados
              automaticamente.
            </SheetDescription>
          </SheetHeader>

          {isLoading || !schedule ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {/* Enabled toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="schedule-enabled" className="text-sm font-medium">
                    Agendamento habilitado
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {schedule.enabled ? "Lembretes automáticos ativos" : "Desabilitado por padrão"}
                  </p>
                </div>
                <Switch
                  id="schedule-enabled"
                  checked={schedule.enabled}
                  onCheckedChange={(checked) =>
                    setSchedule({ ...schedule, enabled: checked })
                  }
                />
              </div>

              <Separator />

              {/* Days of week */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Dias da semana</Label>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        schedule.daysOfWeek.includes(day)
                          ? "border-brand-500 bg-brand-500/10 text-brand-400"
                          : "border-border/50 bg-transparent text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hour + Minute */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="schedule-hour">Hora</Label>
                  <Input
                    id="schedule-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={schedule.hour}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        hour: Math.max(0, Math.min(23, Number(e.target.value))),
                      })
                    }
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-minute">Minuto</Label>
                  <Input
                    id="schedule-minute"
                    type="number"
                    min={0}
                    max={59}
                    value={schedule.minute}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        minute: Math.max(0, Math.min(59, Number(e.target.value))),
                      })
                    }
                    className="bg-background/50"
                  />
                </div>
              </div>

              {/* Condition */}
              <div className="space-y-2">
                <Label htmlFor="schedule-condition">Condição de envio</Label>
                <Select
                  value={schedule.condition}
                  onValueChange={(v) =>
                    setSchedule({
                      ...schedule,
                      condition: v as "all" | "not_submitted",
                    })
                  }
                >
                  <SelectTrigger id="schedule-condition" className="bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_submitted">
                      {CONDITION_LABELS.not_submitted}
                    </SelectItem>
                    <SelectItem value="all">{CONDITION_LABELS.all}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Target scope — admins only */}
              {sessionRole === "admin" && (
                <div className="space-y-2">
                  <Label htmlFor="schedule-scope">Destinatários</Label>
                  <Select
                    value={schedule.targetScope}
                    onValueChange={(v) =>
                      setSchedule({
                        ...schedule,
                        targetScope: v as "all" | "direct_reports",
                      })
                    }
                  >
                    <SelectTrigger id="schedule-scope" className="bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{SCOPE_LABELS.all}</SelectItem>
                      <SelectItem value="direct_reports">
                        {SCOPE_LABELS.direct_reports}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              {/* Save button */}
              <Button
                className="w-full gap-2 bg-brand-500 text-white hover:bg-brand-600"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Salvar configuração
                  </>
                )}
              </Button>

              {/* Recent logs */}
              {logs.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Últimos disparos</Label>
                    <div className="space-y-2">
                      {logs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2"
                        >
                          <div>
                            <p className="text-xs font-medium text-foreground">
                              {log.triggeredBy === "manual"
                                ? "Manual"
                                : "Automático"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(log.createdAt).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-400" />
                            <span className="text-xs text-green-400">
                              {log.recipientCount - log.failedCount}
                            </span>
                            {log.failedCount > 0 && (
                              <span className="ml-1 text-xs text-red-400">
                                ({log.failedCount} falha)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/people/ReminderScheduleDrawer.tsx
  git commit -m "feat: add ReminderScheduleDrawer component"
  ```

---

## Task 13: Update PersonCard — Add Per-User Reminder Button

**Files:**

- Modify: `src/components/people/PersonCard.tsx`

- [ ] **Step 1: Add Bell import, state, and ReminderSingleModal**

  In `src/components/people/PersonCard.tsx`:

  **a) Update the lucide-react import** — add `Bell`:

  ```typescript
  import {
    Bell,
    FolderKanban,
    MoreHorizontal,
    UserCheck,
    UserX,
  } from "lucide-react";
  ```

  **b) Add ReminderSingleModal import** after the ManageProjectsDialog import:

  ```typescript
  import ReminderSingleModal from "@/components/people/ReminderSingleModal";
  ```

  **c) Add state** inside the component function, after the existing `useState` declarations:

  ```typescript
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  ```

  **d) Add reminder dropdown item** inside `<DropdownMenuContent>`, after the "Gerenciar projetos" item and its separator:

  ```typescript
  <DropdownMenuItem
    onClick={() => setIsReminderOpen(true)}
    className="text-xs"
  >
    <Bell className="mr-2 h-3.5 w-3.5" />
    Enviar lembrete de horas
  </DropdownMenuItem>
  ```

  **e) Add ReminderSingleModal** at the end of the returned JSX, after the `<ManageProjectsDialog>`:

  ```typescript
  <ReminderSingleModal
    open={isReminderOpen}
    onOpenChange={setIsReminderOpen}
    userId={person.id}
    userName={person.name || "Usuário"}
  />
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/people/PersonCard.tsx
  git commit -m "feat: add per-user reminder button to PersonCard"
  ```

---

## Task 14: Update PeoplePage — Add Bulk Reminder and Schedule Buttons

**Files:**

- Modify: `src/app/(dashboard)/dashboard/people/page.tsx`

- [ ] **Step 1: Add imports**

  After the existing imports in `src/app/(dashboard)/dashboard/people/page.tsx`:

  ```typescript
  import { Bell, Calendar } from "lucide-react";
  import ReminderBulkModal from "@/components/people/ReminderBulkModal";
  import ReminderScheduleDrawer from "@/components/people/ReminderScheduleDrawer";
  import { Button } from "@/components/ui/button";
  ```

- [ ] **Step 2: Add state for modals**

  Inside `PeoplePage`, after the existing `useState` declarations:

  ```typescript
  const [isReminderBulkOpen, setIsReminderBulkOpen] = useState(false);
  const [isScheduleDrawerOpen, setIsScheduleDrawerOpen] = useState(false);
  ```

- [ ] **Step 3: Update the header section**

  Replace the header `<motion.div>` block (lines 79–92) with:

  ```tsx
  <motion.div
    variants={itemVariants}
    className="flex items-center justify-between gap-4"
  >
    <div>
      <h1 className="font-display text-2xl font-bold text-foreground">
        Equipe
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gerencie os colaboradores da sua organização.
      </p>
    </div>
    {canInvite && (
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setIsScheduleDrawerOpen(true)}
          aria-label="Configurar agendamento de lembretes"
        >
          <Calendar className="h-4 w-4" aria-hidden="true" />
          Agendamento
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setIsReminderBulkOpen(true)}
          aria-label="Enviar lembrete para toda a equipe"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          Lembrar equipe
        </Button>
        <InviteUserDialog sessionRole={sessionRole} />
      </div>
    )}
  </motion.div>
  ```

- [ ] **Step 4: Add modals to JSX**

  At the end of the returned `<motion.div>`, before its closing tag, add:

  ```tsx
  {
    canInvite && (
      <>
        <ReminderBulkModal
          open={isReminderBulkOpen}
          onOpenChange={setIsReminderBulkOpen}
          scope={sessionRole === "admin" ? "all" : "direct_reports"}
        />
        <ReminderScheduleDrawer
          open={isScheduleDrawerOpen}
          onOpenChange={setIsScheduleDrawerOpen}
          sessionRole={sessionRole}
        />
      </>
    );
  }
  ```

- [ ] **Step 5: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/(dashboard)/dashboard/people/page.tsx
  git commit -m "feat: add bulk reminder and schedule buttons to PeoplePage"
  ```

---

## Task 15: Environment Variables and GitHub Actions Cron

**Files:**

- Modify: `.env.example`
- Create: `.github/workflows/reminder-cron.yml`

- [ ] **Step 1: Add CRON_SECRET to .env.example**

  In `.env.example`, after the `ENCRYPTION_KEY` block, append:

  ```
  # ─────────────────────────────────────────────────────────────────────────────
  # Cron secret for POST /api/cron/reminders
  # Shared between the app and the external scheduler (GitHub Actions, Azure, etc.)
  # Generate: openssl rand -base64 32
  # ─────────────────────────────────────────────────────────────────────────────
  CRON_SECRET=""
  ```

- [ ] **Step 2: Create GitHub Actions workflow**

  Create `.github/workflows/reminder-cron.yml`:

  ```yaml
  name: Hours Reminder Cron

  on:
    schedule:
      # Runs every 5 minutes — the app decides whether to fire based on schedule config
      - cron: "*/5 * * * *"
    workflow_dispatch: # allows manual trigger for testing

  jobs:
    trigger:
      runs-on: ubuntu-latest
      steps:
        - name: Trigger hours reminder cron
          run: |
            curl -f -X POST "${{ secrets.APP_URL }}/api/cron/reminders" \
              -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
              -H "Content-Type: application/json" \
              --max-time 30
  ```

  > **Note:** Add `APP_URL` (e.g. `https://yourapp.azurewebsites.net`) and `CRON_SECRET` to your GitHub repository secrets before activating this workflow.

- [ ] **Step 3: Verify next build succeeds**

  ```bash
  npx next build
  ```

  Expected: build completes without TypeScript or lint errors.

- [ ] **Step 4: Commit**

  ```bash
  git add .env.example .github/workflows/reminder-cron.yml
  git commit -m "feat: add CRON_SECRET env var and GitHub Actions reminder cron workflow"
  ```

---

## Self-Review Checklist

After writing, verify spec coverage:

| Spec Requirement                                            | Task                      |
| ----------------------------------------------------------- | ------------------------- |
| Manual individual reminder (People page, per-user)          | Task 13, 10               |
| Manual bulk reminder (People page, whole team)              | Task 14, 11               |
| Optional personal note                                      | Tasks 10, 11, 6           |
| Template padrão + nota opcional                             | Task 5                    |
| Agendamento automático desabilitado por padrão              | Task 7 (`enabled: false`) |
| Dias da semana + horário + condição                         | Tasks 3, 7, 9, 12         |
| Condition `not_submitted` filters by current week timesheet | Task 4                    |
| Batch send via Resend batch API                             | Task 5                    |
| CRON_SECRET protection                                      | Task 9, 15                |
| Idempotência (50-min window)                                | Task 9                    |
| reminderLog histórico                                       | Tasks 6, 8, 9             |
| Histórico de disparos na UI                                 | Task 12                   |
| Dark email template (#0a0a0a, #f97316)                      | Task 5                    |
| role-based scoping (manager = direct_reports only)          | Tasks 6, 7, 14            |
| .env.example + GitHub Actions workflow                      | Task 15                   |
