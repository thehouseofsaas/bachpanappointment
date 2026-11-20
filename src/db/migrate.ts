// Tiny forward-only migrator: applies drizzle/*.sql in name order, once each.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

export async function migrate(connectionString: string, dir = path.join(process.cwd(), "drizzle")) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set((await client.query("select name from _migrations")).rows.map((r) => r.name as string));
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = readFileSync(path.join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _migrations (name) values ($1)", [file]);
        await client.query("commit");
        applied.push(file);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}
