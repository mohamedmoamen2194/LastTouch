import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/lasttouch";

// Browser-safe guard so this module only executes on the server.
const globalForDb = globalThis as unknown as { db?: ReturnType<typeof createDb> };

function createDb() {
  const client = postgres(connectionString, {
    max: 10,
    prepare: false,
    connect_timeout: 20,
    max_lifetime: 30 * 60,
  });
  return drizzle(client, { schema });
}

export const db = globalForDb.db ?? createDb();

if (process.env.NODE_ENV !== "production") globalForDb.db = db;

export type Db = typeof db;
export { schema };