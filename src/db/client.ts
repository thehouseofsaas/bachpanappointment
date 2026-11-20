import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
/** A Db or an open transaction on it. Domain functions accept either. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export function createDb(connectionString: string, max = 10): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString, max });
  return { db: drizzle(pool, { schema }), pool };
}

// One pool per server process; survives hot reloads in development.
const globalForDb = globalThis as unknown as { __ptmDb?: { db: Db; pool: Pool } };

export function getDb(): Db {
  if (!globalForDb.__ptmDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__ptmDb = createDb(url, Number(process.env.DATABASE_POOL_MAX ?? 5));
  }
  return globalForDb.__ptmDb.db;
}

/** Walks an error's cause chain to find the Postgres error, if any. */
export function pgError(err: unknown): { code?: string; constraint?: string; message: string } | null {
  let e: unknown = err;
  for (let i = 0; i < 5 && e; i++) {
    const anyE = e as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown };
    if (typeof anyE.code === "string" && /^[0-9A-Z]{5}$/.test(anyE.code)) {
      return {
        code: anyE.code,
        constraint: typeof anyE.constraint === "string" ? anyE.constraint : undefined,
        message: String(anyE.message ?? ""),
      };
    }
    e = anyE.cause;
  }
  return null;
}
