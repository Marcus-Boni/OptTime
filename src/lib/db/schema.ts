import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";
export type InvitationRole = "admin" | "manager" | "member";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text("role").default("member").notNull(),
  department: text("department"),
  managerId: text("manager_id"),
  hourlyRate: integer("hourly_rate"),
  azureId: text("azure_id"),
  weeklyCapacity: integer("weekly_capacity").default(40).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  /** Token for the Azure DevOps browser extension (Bearer auth) */
  extensionToken: text("extension_token").unique(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  invitationsSent: many(invitation, { relationName: "inviter" }),
  managedProjects: many(project),
  projectMemberships: many(projectMember),
  azureDevopsConfig: one(azureDevopsConfig, {
    fields: [user.id],
    references: [azureDevopsConfig.userId],
  }),
  timeEntries: many(timeEntry),
  timesheets: many(timesheet),
  activeTimer: one(activeTimer, {
    fields: [user.id],
    references: [activeTimer.userId],
  }),
  approvalsGiven: many(timesheet, { relationName: "approver" }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    token: text("token").notNull().unique(),
    invitedById: text("invited_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("invitation_token_idx").on(table.token),
    index("invitation_email_idx").on(table.email),
    index("invitation_invitedBy_idx").on(table.invitedById),
  ],
);

export const invitationRelations = relations(invitation, ({ one }) => ({
  invitedBy: one(user, {
    fields: [invitation.invitedById],
    references: [user.id],
    relationName: "inviter",
  }),
}));

// ─── Project ───────────────────────────────────────────────────────────
export type ProjectStatus = "active" | "archived" | "completed";
export type ProjectSource = "manual" | "azure-devops";

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    description: text("description"),
    clientName: text("client_name"),
    color: text("color").notNull().default("#6366f1"),
    status: text("status").notNull().default("active"),
    billable: boolean("billable").notNull().default(true),
    /** Budget in hours */
    budget: integer("budget"),
    /** Origin of the project: manually created or imported from Azure DevOps */
    source: text("source").notNull().default("manual"),
    /** Azure DevOps project ID (set when imported or linked) */
    azureProjectId: text("azure_project_id"),
    /** Direct link to the Azure DevOps project */
    azureProjectUrl: text("azure_project_url"),
    /** Cover image for the project (base64 data URI or remote URL) */
    imageUrl: text("image_url"),
    managerId: text("manager_id").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("project_status_idx").on(table.status),
    index("project_azure_id_idx").on(table.azureProjectId),
    index("project_manager_idx").on(table.managerId),
  ],
);

export const projectMember = pgTable(
  "project_member",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("project_member_project_idx").on(table.projectId),
    index("project_member_user_idx").on(table.userId),
  ],
);

export const projectRelations = relations(project, ({ one, many }) => ({
  manager: one(user, {
    fields: [project.managerId],
    references: [user.id],
  }),
  members: many(projectMember),
  timeEntries: many(timeEntry),
}));

export const projectMemberRelations = relations(projectMember, ({ one }) => ({
  project: one(project, {
    fields: [projectMember.projectId],
    references: [project.id],
  }),
  user: one(user, {
    fields: [projectMember.userId],
    references: [user.id],
  }),
}));

// ─── Azure DevOps Config ──────────────────────────────────────────────
export const azureDevopsConfig = pgTable("azure_devops_config", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  organizationUrl: text("organization_url").notNull(),
  pat: text("pat").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const azureDevopsConfigRelations = relations(
  azureDevopsConfig,
  ({ one }) => ({
    user: one(user, {
      fields: [azureDevopsConfig.userId],
      references: [user.id],
    }),
  }),
);

// ─── Time Entry ───────────────────────────────────────────────────────
export type AzdoSyncStatus = "none" | "pending" | "synced" | "failed";

export const timeEntry = pgTable(
  "time_entry",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    timesheetId: text("timesheet_id").references(() => timesheet.id),
    description: text("description").notNull(),
    /** Date in YYYY-MM-DD format */
    date: text("date").notNull(),
    /** Duration in minutes */
    duration: integer("duration").notNull(),
    billable: boolean("billable").notNull().default(true),
    /** Azure DevOps Work Item numeric ID */
    azureWorkItemId: integer("azure_work_item_id"),
    /** Azure DevOps Work Item title (cached) */
    azureWorkItemTitle: text("azure_work_item_title"),
    /** Start time for timer-created entries */
    startTime: timestamp("start_time"),
    /** End time for timer-created entries */
    endTime: timestamp("end_time"),
    /** none | pending | synced | failed */
    azdoSyncStatus: text("azdo_sync_status").notNull().default("none"),
    /** Soft delete timestamp */
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("time_entry_user_date_idx").on(table.userId, table.date),
    index("time_entry_project_date_idx").on(table.projectId, table.date),
    index("time_entry_timesheet_idx").on(table.timesheetId),
    index("time_entry_azure_wi_idx").on(table.azureWorkItemId),
  ],
);

export const timeEntryRelations = relations(timeEntry, ({ one }) => ({
  user: one(user, {
    fields: [timeEntry.userId],
    references: [user.id],
  }),
  project: one(project, {
    fields: [timeEntry.projectId],
    references: [project.id],
  }),
  timesheet: one(timesheet, {
    fields: [timeEntry.timesheetId],
    references: [timesheet.id],
  }),
}));

// ─── Timesheet ────────────────────────────────────────────────────────
export type TimesheetStatus = "open" | "submitted" | "approved" | "rejected";
export type TimesheetPeriodType = "weekly" | "monthly";

export const timesheet = pgTable(
  "timesheet",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Period identifier: "2026-W10" for weekly, "2026-03" for monthly */
    period: text("period").notNull(),
    /** weekly | monthly */
    periodType: text("period_type").notNull().default("weekly"),
    /** Total minutes from all entries */
    totalMinutes: integer("total_minutes").notNull().default(0),
    /** Total billable minutes */
    billableMinutes: integer("billable_minutes").notNull().default(0),
    /** open | submitted | approved | rejected */
    status: text("status").notNull().default("open"),
    submittedAt: timestamp("submitted_at"),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at"),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("timesheet_user_period_idx").on(table.userId, table.period),
    index("timesheet_status_idx").on(table.status),
  ],
);

export const timesheetRelations = relations(timesheet, ({ one, many }) => ({
  user: one(user, {
    fields: [timesheet.userId],
    references: [user.id],
  }),
  approver: one(user, {
    fields: [timesheet.approvedBy],
    references: [user.id],
    relationName: "approver",
  }),
  entries: many(timeEntry),
}));

// ─── Active Timer ─────────────────────────────────────────────────────
export const activeTimer = pgTable(
  "active_timer",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" })
      .unique(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    description: text("description").notNull().default(""),
    /** Azure DevOps Work Item numeric ID */
    azureWorkItemId: integer("azure_work_item_id"),
    /** Azure DevOps Work Item title (cached) */
    azureWorkItemTitle: text("azure_work_item_title"),
    billable: boolean("billable").notNull().default(true),
    /** When the timer was started */
    startedAt: timestamp("started_at").notNull(),
    /** When the timer was paused (null if running) */
    pausedAt: timestamp("paused_at"),
    /** Accumulated milliseconds from previous pause/resume cycles */
    accumulatedMs: integer("accumulated_ms").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("active_timer_user_idx").on(table.userId)],
);

export const activeTimerRelations = relations(activeTimer, ({ one }) => ({
  user: one(user, {
    fields: [activeTimer.userId],
    references: [user.id],
  }),
  project: one(project, {
    fields: [activeTimer.projectId],
    references: [project.id],
  }),
}));
