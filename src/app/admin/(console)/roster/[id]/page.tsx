import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { AdminFrame, AdminLoading, Flash, Panel, adminInput, adminLabel, td, th } from "@/components/admin/frame";
import { PhoneFields } from "@/components/admin/phone-fields";
import { Notice, Pill } from "@/components/ui/bits";
import { LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { MAX_PHONES } from "@/domain/roster";
import { formatDayTime } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";
import { archiveStudentAction, restoreStudentAction, updateStudentAction } from "../actions";

export const metadata: Metadata = { title: "Student" };

export default function Page({ params, searchParams }: PageProps<"/admin/roster/[id]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Student params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

type BookingRow = {
  id: string;
  ref_code: string;
  status: "booked" | "cancelled";
  cancelled_by: string | null;
  cancel_reason: string | null;
  attendance: string;
  source: string;
  title: string;
  teacher: string;
  starts_at: Date;
  upcoming: boolean;
};

function bookingStatus(b: BookingRow): { tone: "leaf" | "tangerine" | "sky" | "coral"; text: string } {
  if (b.status === "cancelled") {
    return { tone: "tangerine", text: b.cancelled_by === "school" ? "Cancelled by the school" : "Cancelled by the parent" };
  }
  if (b.attendance === "attended") return { tone: "leaf", text: "Attended" };
  if (b.attendance === "no_show") return { tone: "coral", text: "Did not come" };
  return b.upcoming ? { tone: "sky", text: "Booked" } : { tone: "sky", text: "Booked (time has passed)" };
}

async function Student({ params, searchParams }: PageProps<"/admin/roster/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();

  const found = await db.execute<{
    id: string;
    name: string;
    admission_no: string | null;
    class_section_id: string;
    label: string;
    class_active: boolean;
    teacher: string | null;
    archived_at: Date | null;
  }>(sql`
    select st.id, st.name, st.admission_no, st.class_section_id, cs.label, cs.active as class_active,
           t.name as teacher, st.archived_at
    from students st
    join class_sections cs on cs.id = st.class_section_id
    left join teachers t on t.id = cs.teacher_id
    where st.id = ${id}`);
  const s = found.rows[0];
  if (!s) notFound();

  const phones = await db.execute<{ phone: string; label: string | null }>(
    sql`select phone, label from student_phones where student_id = ${id} order by phone`,
  );
  const classes = await db.execute<{ id: string; label: string; active: boolean }>(
    sql`select id, label, active from class_sections where active or id = ${s.class_section_id} order by sort_order, label`,
  );
  const bookings = await db.execute<BookingRow>(sql`
    select b.id, b.ref_code, b.status, b.cancelled_by, b.cancel_reason, b.attendance, b.source,
           m.title, t.name as teacher, sl.starts_at, sl.starts_at > now() as upcoming
    from bookings b
    join slots sl on sl.id = b.slot_id
    join meetings m on m.id = b.meeting_id
    join teachers t on t.id = b.teacher_id
    where b.student_id = ${id}
    order by sl.starts_at desc, b.created_at desc
    limit 100`);
  const upcoming = bookings.rows.filter((b) => b.status === "booked" && b.upcoming).length;
  const archived = s.archived_at !== null;
  const confirmArchive = one(sp.archive) === "1" && !archived;
  const bookingWord = upcoming === 1 ? "1 upcoming booking" : `${upcoming} upcoming bookings`;

  return (
    <AdminFrame admin={admin} title={s.name} current="/admin/roster" back={{ href: "/admin/roster", label: "All students" }}>
      <Flash ok={sp.ok} error={sp.error} />

      {archived ? (
        <Notice kind="warn" className="mb-4">
          <p>
            Archived on {formatDayTime(new Date(s.archived_at!))}. This child is hidden from parents and cannot be booked for.
          </p>
          <form action={restoreStudentAction} className="mt-2">
            <input type="hidden" name="id" value={s.id} />
            <SubmitButton variant="leaf" size="sm">
              Restore {s.name}
            </SubmitButton>
          </form>
        </Notice>
      ) : null}

      {confirmArchive ? (
        <Notice kind="warn" role="alert" className="mb-4">
          <p className="text-lg font-extrabold">Archive {s.name}?</p>
          <p>
            The child will no longer appear for parents or in new meetings.
            {upcoming > 0
              ? ` ${bookingWord} will be cancelled and the time given back.`
              : " There are no upcoming bookings to cancel."}{" "}
            You can restore the child later, but cancelled bookings do not come back.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={archiveStudentAction}>
              <input type="hidden" name="id" value={s.id} />
              <SubmitButton variant="danger" size="sm">
                Yes, archive
              </SubmitButton>
            </form>
            <LinkButton href={`/admin/roster/${s.id}`} variant="secondary" size="sm">
              No, keep
            </LinkButton>
          </div>
        </Notice>
      ) : null}

      <Panel title="Details" className="mb-4">
        <form action={updateStudentAction} className="space-y-3">
          <input type="hidden" name="id" value={s.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="name" className={adminLabel}>
                Child&apos;s name
              </label>
              <input id="name" name="name" required maxLength={80} defaultValue={s.name} autoComplete="off" className={adminInput} />
            </div>
            <div>
              <label htmlFor="admissionNo" className={adminLabel}>
                Admission no.
              </label>
              <input
                id="admissionNo"
                name="admissionNo"
                maxLength={30}
                defaultValue={s.admission_no ?? ""}
                autoComplete="off"
                className={adminInput}
              />
            </div>
            <div>
              <label htmlFor="classSectionId" className={adminLabel}>
                Class
              </label>
              <select id="classSectionId" name="classSectionId" defaultValue={s.class_section_id} className={adminInput}>
                {classes.rows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {c.active ? "" : " (not active)"}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-muted">Class teacher: {s.teacher ?? "not set"}</p>
            </div>
          </div>
          {upcoming > 0 ? (
            <Notice kind="info">
              This child has {bookingWord}. Changing the class cancels {upcoming === 1 ? "it" : "them"}, because a booking is
              with the class teacher. Changing the name or phones does not.
            </Notice>
          ) : null}
          <PhoneFields idPrefix="edit" rows={MAX_PHONES} phones={phones.rows} />
          <p className="text-sm text-muted">
            Parents sign in with these numbers. Empty a box to remove a number.
            {phones.rows.length === 0 ? " With no number, the parent cannot book online — the office books for them." : ""}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton size="sm">Save changes</SubmitButton>
            {!archived && !confirmArchive ? (
              <Link href={`/admin/roster/${s.id}?archive=1`} className="font-bold text-coral-ink">
                Archive this child…
              </Link>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel title="Bookings">
        {bookings.rows.length === 0 ? (
          <p className="text-muted">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="stack-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-line">
                  <th className={th}>Meeting</th>
                  <th className={th}>Time</th>
                  <th className={th}>Teacher</th>
                  <th className={th}>Status</th>
                  <th className={th}>Ref</th>
                </tr>
              </thead>
              <tbody>
                {bookings.rows.map((b) => {
                  const st = bookingStatus(b);
                  return (
                    <tr key={b.id} className="border-b border-line last:border-0">
                      <td className={`${td} font-bold`}>{b.title}</td>
                      <td data-label="Time" className={`${td} whitespace-nowrap`}>{formatDayTime(new Date(b.starts_at))}</td>
                      <td data-label="Teacher" className={`${td} whitespace-nowrap`}>{b.teacher}</td>
                      <td data-label="Status" className={td}>
                        <Pill tone={st.tone} className="whitespace-nowrap">
                          {st.text}
                        </Pill>
                        {b.status === "cancelled" && b.cancel_reason ? (
                          <div className="mt-1 text-muted sm:min-w-40">{b.cancel_reason}</div>
                        ) : null}
                        {b.status === "booked" && b.source === "admin" ? <div className="mt-1 text-muted">Booked by the office</div> : null}
                      </td>
                      <td data-label="Ref" className={`${td} whitespace-nowrap font-mono`}>{b.ref_code}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AdminFrame>
  );
}
