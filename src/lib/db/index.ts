import { drizzle } from "drizzle-orm/node-postgres/driver";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const globalForDb = globalThis as typeof globalThis & {
  __harvestDbPool?: Pool;
};
const requiresSsl = /sslmode=require/i.test(connectionString);

const pool =
  globalForDb.__harvestDbPool ??
  new Pool({
    connectionString,
    ssl: requiresSsl ? true : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__harvestDbPool = pool;
}

export const dbPool = pool;
export const db = drizzle({ client: pool, schema });
