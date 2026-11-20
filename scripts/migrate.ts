import nextEnv from "@next/env";
import { migrate } from "../src/db/migrate";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const applied = await migrate(url);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
