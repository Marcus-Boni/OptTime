import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { refreshMicrosoftAccessToken } from "./microsoft-oauth";

const microsoftTenantId = process.env.MICROSOFT_TENANT_ID ?? "common";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
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
      ],
      refreshAccessToken: refreshMicrosoftAccessToken,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!user.email.endsWith("@optsolv.com.br")) {
            throw new Error(
              "Apenas e-mails do domínio @optsolv.com.br são permitidos.",
            );
          }
          return {
            data: user,
          };
        },
      },
    },
  },
  onAPIError: {
    errorURL: "/login",
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["microsoft"],
    },
  },
});
