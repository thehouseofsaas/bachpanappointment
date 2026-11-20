// Starts a real Postgres for tests and local development (no Docker needed).
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { migrate } from "../../src/db/migrate";

export type LocalPg = { url: string; stop: () => Promise<void> };

export async function startLocalPg(opts: { dir: string; port: number; fresh: boolean }): Promise<LocalPg> {
  const dataDir = path.resolve(opts.dir);
  if (opts.fresh && existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });
  const isNew = !existsSync(path.join(dataDir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: "postgres",
    port: opts.port,
    persistent: !opts.fresh,
    // Postgres refuses to run as root; in a root container use a system user.
    createPostgresUser: process.getuid?.() === 0,
    onLog: () => {},
    onError: () => {},
  });
  if (isNew) await pg.initialise();
  await pg.start();
  if (isNew) await pg.createDatabase("ptm");
  const url = `postgres://postgres:postgres@127.0.0.1:${opts.port}/ptm`;
  await migrate(url);
  return { url, stop: () => pg.stop() };
}
