import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getServerAppUrl } from "./app-url";
import { db } from "./db";
import { refreshMicrosoftAccessToken } from "./microsoft-oauth";

const microsoftTenantId = process.env.MICROSOFT_TENANT_ID ?? "common";

/**
 * The only domain allowed to sign in. Also the line between an internal
 * colleague and an external participant in Registro por Colaboração.
 */
export const allowedEmailDomain = "@optsolv.com.br";

export const auth = betterAuth({
  baseURL: getServerAppUrl(),
  trustedOrigins: [getServerAppUrl(), "http://localhost:3000"],
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-client-ip"],
    },
    useSecureCookies: true,
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "member",
      },
      department: {
        type: "string",
        required: false,
      },
      managerId: {
        type: "string",
        required: false,
      },
      hourlyRate: {
        type: "number",
        required: false,
      },
      azureId: {
        type: "string",
        required: false,
      },
      weeklyCapacity: {
        type: "number",
        required: true,
        defaultValue: 40,
      },
      timeDefaultView: {
        type: "string",
        required: true,
        defaultValue: "week",
      },
      timeDefaultDuration: {
        type: "number",
        required: true,
        defaultValue: 60,
      },
      timeSubmitMode: {
        type: "string",
        required: true,
        defaultValue: "close",
      },
      timeDefaultBillable: {
        type: "boolean",
        required: true,
        defaultValue: true,
      },
      timeAssistantEnabled: {
        type: "boolean",
        required: true,
        defaultValue: true,
      },
      timeOutlookDefaultOpen: {
        type: "boolean",
        required: true,
        defaultValue: false,
      },
      timeShowWeekends: {
        type: "boolean",
        required: true,
        defaultValue: true,
      },
      isActive: {
        type: "boolean",
        required: true,
        defaultValue: true,
      },
    },
  },
  socialProviders: {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID as string,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
      tenantId: microsoftTenantId,
      scope: [
        "openid",
        "profile",
        "email",
        "User.Read",
        "Calendars.Read",
        "offline_access",
        // ── Scopes below need admin consent in Entra ──
        // This tenant disables user consent, so *every* permission the app
        // requests must be granted on the App Registration first. A scope is
        // sent on every login, so requesting an unconsented one does not
        // degrade its feature — it blocks authentication for the whole
        // organisation with AADSTS65001. Never add one here before the grant.
        //
        // Mirrors the running timer into the Teams status message.
        "Presence.ReadWrite",
        // Viva Insights activity statistics — the daily portrait behind
        // Registro por Colaboração.
        "Analytics.Read",
        // The person's own working hours, timezone and out-of-office. Replaces
        // three hardcoded assumptions: a five-day week for everyone, a single
        // company timezone, and nudging people who are on holiday.
        "MailboxSettings.Read",
        // A granted scope only reaches a session created by a *full* login —
        // a token refresh never adds scopes, so sessions predating the grant
        // keep getting 403. Both features detect that and offer a one-click
        // "entrar de novo" instead of failing silently.
      ],
      refreshAccessToken: refreshMicrosoftAccessToken,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const normalizedEmail = user.email.trim().toLowerCase();

          if (!normalizedEmail.endsWith(allowedEmailDomain)) {
            console.warn(
              "[auth] Rejected user creation for non-OptSolv email",
              {
                email: user.email,
              },
            );
            throw new Error(
              "Apenas e-mails do dominio @optsolv.com.br sao permitidos.",
            );
          }

          return {
            data: {
              ...user,
              email: normalizedEmail,
            },
          };
        },
      },
    },
  },
  onAPIError: {
    onError: (error) => {
      const normalizedError =
        error instanceof Error
          ? { message: error.message, name: error.name }
          : { message: String(error), name: "UnknownError" };

      console.error("[auth] Better Auth API error", {
        ...normalizedError,
      });
    },
    errorURL: "/login",
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["microsoft"],
    },
  },
});
