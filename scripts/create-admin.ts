// Creates an admin, or resets a password:  pnpm admin:create <username> <password> [name] [owner|admin]
import { hash } from "@node-rs/argon2";
import nextEnv from "@next/env";
import { Client } from "pg";
import { newId } from "../src/lib/ids";
import { passwordProblem } from "../src/lib/passwords";

nextEnv.loadEnvConfig(process.cwd());
const [username, password, name = "School Office", role = "owner"] = process.argv.slice(2);
if (!username || !password) {
  console.error("Usage: pnpm admin:create <username> <password> [name] [owner|admin]");
  process.exit(1);
}
const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const res = await client.query(
  `insert into admin_users (id, name, username, password_hash, role)
   values ($1, $2, $3, $4, $5)
   on conflict (username) do update
     set password_hash = excluded.password_hash, active = true, failed_logins = 0, locked_until = null,
         session_version = admin_users.session_version + 1
   returning (xmax = 0) as created`,
  [newId(), name, username.toLowerCase(), await hash(password), role === "admin" ? "admin" : "owner"],
);
console.log(res.rows[0].created ? `Created ${username}.` : `Password reset for ${username}; old sessions are signed out.`);
await client.end();
