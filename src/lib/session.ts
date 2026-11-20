import "server-only";
import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { isProduction, sessionSecret } from "./env";

export type ParentSessionData = { phone?: string };
export type AdminSessionData = { adminId?: string; v?: number };

const base = { httpOnly: true, secure: isProduction, sameSite: "lax" as const, path: "/" };

const PARENT_TTL = 60 * 60 * 24 * 30; // 30 days
const ADMIN_TTL = 60 * 60 * 12; // 12 hours

export async function parentSession(): Promise<IronSession<ParentSessionData>> {
  // Sessions are per request: never part of a prerendered shell. (Unsealing
  // also reads the clock, which is only allowed at request time.)
  await connection();
  return getIronSession<ParentSessionData>(await cookies(), {
    password: sessionSecret(),
    cookieName: "ptm_parent",
    ttl: PARENT_TTL,
    cookieOptions: { ...base, maxAge: PARENT_TTL - 60 },
  });
}

export async function adminSession(): Promise<IronSession<AdminSessionData>> {
  await connection();
  return getIronSession<AdminSessionData>(await cookies(), {
    password: sessionSecret(),
    cookieName: "ptm_admin",
    ttl: ADMIN_TTL,
    cookieOptions: { ...base, path: "/admin", maxAge: ADMIN_TTL - 60 },
  });
}
