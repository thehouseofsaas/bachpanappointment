import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAdmin } from "@/app/admin/(auth)/actions";
import { LogoMark } from "@/components/brand";
import { Notice } from "@/components/ui/bits";
import type { CurrentAdmin } from "@/lib/authz";

const NAV: Array<[string, string]> = [
  ["/admin", "Dashboard"],
  ["/admin/meetings", "Meetings"],
  ["/admin/roster", "Students"],
  ["/admin/classes", "Classes & teachers"],
  ["/admin/roster/import", "Upload roster"],
  ["/admin/settings", "Settings"],
  ["/admin/audit", "Activity log"],
];

/** Calm frame for the office: same colours and fonts as the parent pages, less decoration. */
export function AdminFrame({
  admin,
  title,
  current,
  back,
  actions,
  children,
}: {
  admin: CurrentAdmin;
  title: string;
  /** The nav entry to highlight, e.g. "/admin/meetings". */
  current: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
}) {
  const currentLabel = NAV.find(([href]) => href === current)?.[1] ?? title;
  return (
    <div className="min-h-dvh bg-paper">
      <header className="no-print safe-top border-b-2 border-line bg-wash">
        <div className="safe-x mx-auto flex max-w-5xl items-center gap-2 py-1.5">
          <Link href="/admin" className="flex min-h-11 items-center gap-2 font-display text-lg font-extrabold no-underline">
            <LogoMark width={30} /> PTM office
          </Link>
          <span className="ml-auto hidden truncate text-sm text-muted sm:inline">{admin.name}</span>
          <form action={signOutAdmin} className="ml-auto sm:ml-0">
            <button type="submit" className="min-h-11 cursor-pointer px-2 text-sm font-bold underline underline-offset-4">
              Sign out
            </button>
          </form>
        </div>
        {/* Wide screens: tabs. */}
        <nav aria-label="Admin" className="safe-x mx-auto hidden max-w-5xl md:block">
          <ul className="flex gap-1 whitespace-nowrap">
            {NAV.map(([href, label]) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current === href ? "page" : undefined}
                  className={`block rounded-t-xl px-3 py-2.5 text-sm font-bold no-underline ${
                    current === href ? "bg-paper text-navy" : "text-muted hover:text-navy"
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {/* Phones and small tablets: one menu button. Keyed by page so it closes after navigating. */}
        <details key={current} className="group md:hidden">
          <summary className="safe-x flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 border-t-2 border-line bg-paper font-bold [&::-webkit-details-marker]:hidden">
            <span className="truncate">{currentLabel}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
              Menu
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="transition-transform group-open:rotate-180">
                <path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </summary>
          <nav aria-label="Admin" className="safe-x bg-paper pb-2">
            <ul className="grid gap-1 sm:grid-cols-2">
              {NAV.map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={current === href ? "page" : undefined}
                    className={`flex min-h-12 items-center rounded-xl px-3 font-bold no-underline ${
                      current === href ? "bg-sky-soft text-sky-ink" : "text-navy"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </details>
      </header>
      <main className="safe-x safe-bottom mx-auto max-w-5xl pt-5">
        {back ? (
          <p className="no-print mb-1 text-sm">
            <Link href={back.href} className="inline-flex min-h-10 items-center font-bold text-muted">
              ← {back.label}
            </Link>
          </p>
        ) : null}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-2xl font-extrabold break-words sm:text-3xl">{title}</h1>
          {actions ? <div className="no-print ml-auto flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        {children}
      </main>
    </div>
  );
}

/** Shows the ?ok= / ?error= message left by the previous action. */
export function Flash({ ok, error }: { ok?: string | string[]; error?: string | string[] }) {
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const o = one(ok);
  const e = one(error);
  if (!o && !e) return null;
  return (
    <div className="no-print mb-4 space-y-2">
      {e ? (
        <Notice kind="bad" role="alert">
          {e}
        </Notice>
      ) : null}
      {o ? (
        <Notice kind="good" role="status">
          {o}
        </Notice>
      ) : null}
    </div>
  );
}

export function AdminLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper" role="status">
      <p className="font-display text-lg font-bold text-muted">Loading…</p>
    </div>
  );
}

/** A plain white panel. */
export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border-2 border-line bg-paper p-4 ${className}`}>
      {title ? <h2 className="mb-3 text-xl font-extrabold">{title}</h2> : null}
      {children}
    </section>
  );
}

export const adminInput =
  "block w-full min-h-11 rounded-xl border-2 border-line bg-paper px-3 text-base text-navy focus:border-grape focus:outline-none";
export const adminLabel = "mb-1 block text-sm font-bold";
export const th = "px-2 py-2 text-left text-xs font-bold tracking-wide text-muted uppercase";
export const td = "px-2 py-2 align-top";
