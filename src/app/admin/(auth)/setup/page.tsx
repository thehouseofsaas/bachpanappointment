import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { SetupForm } from "@/components/admin/auth-forms";
import { AdminLoading } from "@/components/admin/frame";
import { getDb } from "@/db/client";

export const metadata: Metadata = { title: "First-time setup" };

export default function Page() {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Setup />
    </Suspense>
  );
}

async function Setup() {
  await connection();
  const n = await getDb().execute<{ n: number }>(sql`select count(*)::int as n from admin_users`);
  if (n.rows[0].n > 0) redirect("/admin/login");
  return (
    <main className="grid min-h-dvh place-items-center bg-wash px-4 py-8">
      <div className="w-full max-w-sm rounded-card border-2 border-line bg-paper p-6 sticker">
        <h1 className="mb-1 text-2xl font-extrabold">First-time setup</h1>
        <p className="mb-4 text-muted">Create the owner account for the school office. This page works only once.</p>
        <SetupForm />
      </div>
    </main>
  );
}
