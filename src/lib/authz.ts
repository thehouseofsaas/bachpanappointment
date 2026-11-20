// Data access layer for identity. Every page, Server Action and Route Handler
// that needs to know who is asking goes through here.
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { adminUsers } from "@/db/schema";
import { adminSession, parentSession } from "./session";

export type CurrentAdmin = { id: string; name: string; username: string; role: "owner" | "admin" };

export const currentAdmin = cache(async (): Promise<CurrentAdmin | null> => {
  const session = await adminSession();
  if (!session.adminId) return null;
  const rows = await getDb()
    .select({
      id: adminUsers.id,
      name: adminUsers.name,
      username: adminUsers.username,
      role: adminUsers.role,
      sessionVersion: adminUsers.sessionVersion,
    })
    .from(adminUsers)
    .where(and(eq(adminUsers.id, session.adminId), eq(adminUsers.active, true)));
  const a = rows[0];
  if (!a || a.sessionVersion !== session.v) return null;
  return { id: a.id, name: a.name, username: a.username, role: a.role };
});

export async function requireAdmin(): Promise<CurrentAdmin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function requireOwner(): Promise<CurrentAdmin> {
  const admin = await requireAdmin();
  if (admin.role !== "owner") redirect("/admin?error=" + encodeURIComponent("Only the owner account can do that."));
  return admin;
}

/** The signed-in parent's phone, if it still belongs to an active student. */
export const currentParentPhone = cache(async (): Promise<string | null> => {
  const session = await parentSession();
  if (!session.phone) return null;
  const res = await getDb().execute(sql`
    select 1 from student_phones p join students st on st.id = p.student_id
    where p.phone = ${session.phone} and st.archived_at is null limit 1`);
  return res.rows.length > 0 ? session.phone : null;
});

export async function requireParentPhone(): Promise<string> {
  const phone = await currentParentPhone();
  if (!phone) redirect("/");
  return phone;
}
