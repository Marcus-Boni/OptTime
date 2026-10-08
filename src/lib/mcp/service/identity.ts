import { eq } from "drizzle-orm";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import type { AgentPrincipal } from "../auth";
import type { DaySummary } from "./entries";
import type { MicrosoftConnection } from "./microsoft";

/**
 * What is connected to the account behind a token — enough for an assistant to
 * know up front which tools will work, without calling each one to find out.
 */

export interface IntegrationStatus {
  azureDevOps: { configured: boolean };
  eveningDigestEnabled: boolean;
}

export async function getIntegrationStatus(
  userId: string,
): Promise<IntegrationStatus> {
  const [azureConfig, profile] = await Promise.all([
    findAzureDevopsConfigByUserId(userId),
    db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { eveningDigestEnabled: true },
    }),
  ]);

  return {
    azureDevOps: { configured: azureConfig !== null },
    eveningDigestEnabled: profile?.eveningDigestEnabled ?? false,
  };
}

export interface WhoamiData {
  userId: string;
  name: string;
  email: string;
  role: string;
  scopes: string[];
  tokenName: string;
  timezone: string;
  weeklyCapacityMinutes: number;
  today: {
    date: string;
    totalMinutes: number;
    dailyCapacityMinutes: number;
  };
  microsoft: MicrosoftConnection;
  azureDevOps: { configured: boolean };
  eveningDigestEnabled: boolean;
}

/** The `opt_time_whoami` payload. Pure, so its shape can be verified offline. */
export function buildWhoamiData(input: {
  principal: AgentPrincipal;
  timezone: string;
  summary: Pick<
    DaySummary,
    "date" | "totalMinutes" | "dailyCapacityMinutes" | "weeklyCapacityMinutes"
  >;
  microsoft: MicrosoftConnection;
  integrations: IntegrationStatus;
}): WhoamiData {
  const { principal, summary } = input;

  return {
    userId: principal.userId,
    name: principal.name,
    email: principal.email,
    role: principal.role,
    scopes: principal.scopes,
    tokenName: principal.tokenName,
    timezone: input.timezone,
    weeklyCapacityMinutes: summary.weeklyCapacityMinutes,
    today: {
      date: summary.date,
      totalMinutes: summary.totalMinutes,
      dailyCapacityMinutes: summary.dailyCapacityMinutes,
    },
    microsoft: input.microsoft,
    azureDevOps: input.integrations.azureDevOps,
    eveningDigestEnabled: input.integrations.eveningDigestEnabled,
  };
}
