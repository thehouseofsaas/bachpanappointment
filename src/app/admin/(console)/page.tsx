import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminFrame, AdminLoading, Flash, Panel } from "@/components/admin/frame";
import { PHASE_TONE } from "@/components/admin/phase";
import { Notice, Pill } from "@/components/ui/bits";
import { LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { getMeetingDetail, listMeetings, PHASE_LABEL, rosterHealth } from "@/domain/admin-view";
import { formatDate, formatDayTime } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";

export const metadata: Metadata = { title: "PTM office" };

export default function Page({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/admin">, "searchParams">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const [meetings, health] = await Promise.all([listMeetings(db), rosterHealth(db)]);
  // The meeting that matters now: the soonest one that is not finished.
  const upcoming = meetings.filter((m) => m.phase !== "past" && m.phase !== "cancelled").sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0] ? await getMeetingDetail(db, upcoming[0].id) : null;

  return (
    <AdminFrame admin={admin} title="Dashboard" current="/admin" actions={<LinkButton href="/admin/meetings/new">New meeting</LinkButton>}>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="space-y-2">
        {health.students === 0 ? (
          <Notice kind="info">
            Start by <Link href="/admin/roster/import" className="font-bold">uploading the class lists</Link>. Then create a meeting.
          </Notice>
        ) : null}
        {health.noTeacher.length > 0 ? (
          <Notice kind="warn">
            No class teacher set for: {health.noTeacher.join(", ")}.{" "}
            <Link href="/admin/classes" className="font-bold">Set one</Link> before creating a meeting.
          </Notice>
        ) : null}
        {health.noPhone > 0 ? (
          <Notice kind="warn">
            {health.noPhone} {health.noPhone === 1 ? "child has" : "children have"} no phone number and cannot book online.{" "}
            <Link href="/admin/roster?q=&nophone=1" className="font-bold">See the list</Link>.
          </Notice>
        ) : null}
        {health.flood ? (
          <Notice kind="bad">
            Many wrong phone numbers were tried in the last day. If this was not a typing problem in a class group, consider
            turning on the admission-number check under <Link href="/admin/settings" className="font-bold">Settings</Link>.
          </Notice>
        ) : null}
      </div>

      {next ? (
        <Panel className="mt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Pill tone={PHASE_TONE[next.phase]}>{PHASE_LABEL[next.phase]}</Pill>
            <h2 className="text-2xl font-extrabold">
              <Link href={`/admin/meetings/${next.id}`}>{next.title}</Link>
            </h2>
            <p className="font-bold text-muted">{formatDate(next.date)}</p>
          </div>
          <p className="mt-1 text-muted">Booking closes {formatDayTime(next.closesAt)}</p>
          <p className="mt-3 font-display text-3xl font-extrabold">
            {next.totals.booked} <span className="text-lg font-bold text-muted">of {next.totals.children} children booked</span>
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {next.sessions.map((s) => {
              const pct = s.children ? Math.round((s.booked / s.children) * 100) : 0;
              return (
                <li key={s.id} className="rounded-xl border-2 border-line p-3">
                  <p className="font-bold">
                    {s.sections.map((x) => x.label).join(", ")} <span className="font-normal text-muted">· {s.teacherName}</span>
                  </p>
                  {s.active ? (
                    <>
                      <div className="mt-2 h-3 overflow-hidden rounded-full bg-leaf-soft" role="img" aria-label={`${pct}% booked`}>
                        <div className="h-full rounded-full bg-leaf" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-sm">
                        {s.booked} booked · {s.unbooked.length} to go
                        {s.capacity < s.children ? ` · only ${s.capacity} slots for ${s.children} children` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm font-bold text-coral-ink">Session cancelled</p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton href={`/admin/meetings/${next.id}`} size="sm">
              Open meeting
            </LinkButton>
            {next.status !== "draft" ? (
              <LinkButton href={`/admin/meetings/${next.id}/print`} variant="secondary" size="sm">
                Print sheets
              </LinkButton>
            ) : null}
          </div>
        </Panel>
      ) : (
        <Panel className="mt-4">
          <p className="text-lg">No upcoming meeting.</p>
          <p className="text-muted">Create one, check the slots, publish it, then share the parent link in your class groups.</p>
        </Panel>
      )}

      <p className="mt-4 text-sm text-muted">
        {health.students} active students · {meetings.length} meetings so far
      </p>
    </AdminFrame>
  );
}
