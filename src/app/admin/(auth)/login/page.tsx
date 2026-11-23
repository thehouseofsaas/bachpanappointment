import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { Logo } from "@/components/brand";
import { LoginForm } from "@/components/admin/auth-forms";
import { AdminLoading, Flash } from "@/components/admin/frame";
import { DeveloperCredit } from "@/components/credit";
import { getDb } from "@/db/client";
import { currentAdmin } from "@/lib/authz";

export const metadata: Metadata = { title: "Office sign-in" };

export default function Page({ searchParams }: PageProps<"/admin/login">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/admin/login">, "searchParams">) {
  if (await currentAdmin()) redirect("/admin");
  const sp = await searchParams;
  const n = await getDb().execute<{ n: number }>(sql`select count(*)::int as n from admin_users`);
  const firstRun = n.rows[0].n === 0;
  return (
    <main className="grid min-h-dvh content-center justify-items-center gap-6 bg-wash px-4 py-8">
      <div className="w-full max-w-sm rounded-card border-2 border-line bg-paper p-6 sticker">
        <div className="mb-4 flex justify-center">
          <Logo width={180} gap={14} label="Bachpan" priority />
        </div>
        <h1 className="mb-4 text-center text-2xl font-extrabold">PTM office sign-in</h1>
        <Flash ok={sp.ok} error={sp.error} />
        {firstRun ? (
          <p className="text-center">
            No admin account exists yet.{" "}
            <Link href="/admin/setup" className="font-bold">
              Set up the owner account
            </Link>
            .
          </p>
        ) : (
          <LoginForm />
        )}
        <p className="mt-4 text-center text-sm text-muted">
          Parents book at the <Link href="/">front page</Link>.
        </p>
      </div>
      <DeveloperCredit />
    </main>
  );
}
