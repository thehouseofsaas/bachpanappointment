import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";

/**
 * Fixed-window counter in Postgres. Returns true while the caller is within
 * the limit. Counting happens in one statement, so concurrent requests cannot
 * slip past.
 */
export async function hit(db: DbOrTx, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const res = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count)
    values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}), 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`);
  const count = Number(res.rows[0].count);
  // Opportunistic clean-up of old windows whenever a new window starts.
  if (count === 1) {
    await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  }
  return count <= limit;
}

/** Reads the current count without incrementing. */
export async function peek(db: DbOrTx, key: string, windowSeconds: number): Promise<number> {
  const res = await db.execute<{ count: number }>(sql`
    select count from rate_limits
    where key = ${key}
      and window_start = to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds})`);
  return res.rows[0] ? Number(res.rows[0].count) : 0;
}
