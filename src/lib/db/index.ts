import { drizzle } from "drizzle-orm/node-postgres/driver";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const SSL_CONNECTION_PARAMS = [
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "sslcrl",
] as const;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isTruthy(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
}

function buildPoolConnectionConfig(rawUrl: string): {
  connectionString: string;
  requiresSsl: boolean;
} {
  const parsedUrl = new URL(rawUrl);
  const sslMode = parsedUrl.searchParams.get("sslmode")?.toLowerCase();
  const isAzurePostgresHost = parsedUrl.hostname.endsWith(".postgres.database.azure.com");
  const requiresSsl =
    isAzurePostgresHost ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full";

  // Avoid node-postgres SSL object override when ssl params are present in URL.
  for (const param of SSL_CONNECTION_PARAMS) {
    parsedUrl.searchParams.delete(param);
  }

  return {
    connectionString: parsedUrl.toString(),
    requiresSsl,
  };
}

const globalForDb = globalThis as typeof globalThis & {
  __harvestDbPool?: Pool;
};
const { connectionString: normalizedConnectionString, requiresSsl } =
  buildPoolConnectionConfig(connectionString);
const sslRejectUnauthorized = isTruthy(
  process.env.DB_SSL_REJECT_UNAUTHORIZED,
  true,
);

const pool =
  globalForDb.__harvestDbPool ??
  new Pool({
    connectionString: normalizedConnectionString,
    max: parsePositiveInt(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: parsePositiveInt(
      process.env.DB_POOL_IDLE_TIMEOUT_MS,
      30_000,
    ),
    connectionTimeoutMillis: parsePositiveInt(
      process.env.DB_POOL_CONNECTION_TIMEOUT_MS,
      5_000,
    ),
    ssl: requiresSsl ? { rejectUnauthorized: sslRejectUnauthorized } : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__harvestDbPool = pool;
}

export const dbPool = pool;
export const db = drizzle({ client: pool, schema });
