// Brings the database schema up to date. Runs before every Vercel build
// (see vercel.json) and by hand with `pnpm db:migrate`.
import nextEnv from "@next/env";
import { migrate } from "../src/db/migrate";

nextEnv.loadEnvConfig(process.cwd());
// Neon gives a direct (unpooled) connection string too; schema changes are safer on it.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  if (process.env.VERCEL) {
    // First deploy, before a database is attached: build anyway; the next deploy migrates.
    console.warn("No database connected yet — skipping migrations. Add a database, then redeploy.");
    process.exit(0);
  }
  throw new Error("DATABASE_URL is not set");
}
const applied = await migrate(url);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
