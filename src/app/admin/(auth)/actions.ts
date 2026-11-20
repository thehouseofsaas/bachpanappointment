"use server";

import { hash, verify } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { adminUsers } from "@/db/schema";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { passwordProblem } from "@/lib/passwords";
import { hit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { adminSession } from "@/lib/session";

export type AuthState = { error?: string; username?: string };

const MAX_FAILS = 5;
const WRONG = "Wrong username or password.";

export async function signInAdmin(_prev: AuthState, form: FormData): Promise<AuthState> {
  const db = getDb();
  const ip = await clientIp();
  const username = String(form.get("username") ?? "").trim().toLowerCase().slice(0, 60);
  const password = String(form.get("password") ?? "").slice(0, 200);
  if (!username || !password) return { error: "Enter your username and password.", username };
  if (!(await hit(db, `admin-login:${ip}`, 30, 15 * 60))) {
    return { error: "Too many tries. Wait fifteen minutes and try again.", username };
  }

  const rows = await db.select().from(adminUsers).where(eq(adminUsers.username, username));
  const user = rows[0];
  if (!user || !user.active) {
    // Spend the same time as a real check so usernames cannot be probed.
    await hash(password);
    return { error: WRONG, username };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { error: "This account is locked after too many wrong passwords. Try again in fifteen minutes.", username };
  }
  const good = await verify(user.passwordHash, password).catch(() => false);
  if (!good) {
    await db.execute(sql`
      update admin_users
      set failed_logins = failed_logins + 1,
          locked_until = case when failed_logins + 1 >= ${MAX_FAILS} then now() + interval '15 minutes' else locked_until end
      where id = ${user.id}`);
    await audit(db, { actorType: "system", action: "admin.login_failed", entity: "admin", entityId: user.id, ip });
    return { error: WRONG, username };
  }
  await db.execute(sql`update admin_users set failed_logins = 0, locked_until = null where id = ${user.id}`);
  const session = await adminSession();
  session.adminId = user.id;
  session.v = user.sessionVersion;
  await session.save();
  await audit(db, { actorType: "admin", actor: user.id, action: "admin.login", ip });
  redirect("/admin");
}

export async function signOutAdmin(): Promise<void> {
  const session = await adminSession();
  session.destroy();
  redirect("/admin/login");
}

/** First-run only: creates the owner account while no admin exists. */
export async function setupOwner(_prev: AuthState, form: FormData): Promise<AuthState> {
  const db = getDb();
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const username = String(form.get("username") ?? "").trim().toLowerCase().slice(0, 60);
  const password = String(form.get("password") ?? "");
  const token = String(form.get("token") ?? "");
  const expected = process.env.SETUP_TOKEN ?? "";
  if (!(await hit(db, `admin-setup:${await clientIp()}`, 10, 15 * 60))) return { error: "Too many tries. Wait and try again." };
  if (!expected || token !== expected) return { error: "The setup code is not right. It is the SETUP_TOKEN value in the hosting settings.", username };
  const problem = passwordProblem(password);
  if (!name || !/^[a-z0-9._-]{3,60}$/.test(username)) return { error: "Give a name and a username (letters, digits, dots; at least 3).", username };
  if (problem) return { error: problem, username };
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(74210002)`);
    const n = await tx.execute<{ n: number }>(sql`select count(*)::int as n from admin_users`);
    if (n.rows[0].n > 0) return false;
    await tx.insert(adminUsers).values({ id: newId(), name, username, passwordHash: await hash(password), role: "owner" });
    return true;
  });
  if (!created) return { error: "An admin account already exists. Sign in instead." };
  redirect("/admin/login?ok=" + encodeURIComponent("Owner account created. Sign in."));
}
