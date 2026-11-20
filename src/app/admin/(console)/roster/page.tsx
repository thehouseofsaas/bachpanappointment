import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { AdminFrame, AdminLoading, Flash, Panel, adminInput, adminLabel, td, th } from "@/components/admin/frame";
import { PhoneFields } from "@/components/admin/phone-fields";
import { Pill } from "@/components/ui/bits";
import { Button, LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { formatPhone } from "@/domain/phone";
import { requireAdmin } from "@/lib/authz";
import { asTone } from "@/theme/tones";
import { addStudentAction } from "./actions";

export const metadata: Metadata = { title: "Students" };

const MAX_ROWS = 400;

export default function Page({ searchParams }: PageProps<"/admin/roster">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Roster searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

type Row = {
  id: string;
  name: string;
  admission_no: string | null;
  archived: boolean;
  label: string;
  color: string;
  phones: Array<{ phone: string; label: string | null }>;
};

async function Roster({ searchParams }: Pick<PageProps<"/admin/roster">, "searchParams">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const q = one(sp.q).trim().slice(0, 60);
  const classId = one(sp.class).slice(0, 40);
  const showArchived = one(sp.archived) === "1";

  const classes = await db.execute<{ id: string; label: string; active: boolean }>(
    sql`select id, label, active from class_sections order by active desc, sort_order, label`,
  );

  const filters = [sql`true`];
  if (!showArchived) filters.push(sql`st.archived_at is null`);
  if (classId) filters.push(sql`st.class_section_id = ${classId}`);
  if (q) {
    const text = `%${likeEscape(q)}%`;
    const digits = q.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
    const any = [sql`st.name ilike ${text}`, sql`st.admission_no ilike ${text}`];
    if (digits.length >= 3) {
      any.push(sql`exists (select 1 from student_phones p where p.student_id = st.id and p.phone like ${`%${digits}%`})`);
    }
    filters.push(sql`(${sql.join(any, sql` or `)})`);
  }
  const res = await db.execute<Row>(sql`
    select st.id, st.name, st.admission_no, st.archived_at is not null as archived, cs.label, cs.color,
      coalesce((select json_agg(json_build_object('phone', p.phone, 'label', p.label) order by p.phone)
                from student_phones p where p.student_id = st.id), '[]'::json) as phones
    from students st join class_sections cs on cs.id = st.class_section_id
    where ${sql.join(filters, sql` and `)}
    order by cs.sort_order, cs.label, st.name
    limit ${MAX_ROWS + 1}`);
  const rows = res.rows.slice(0, MAX_ROWS);
  const totals = await db.execute<{ active: number; archived: number; no_phone: number }>(sql`
    select count(*) filter (where archived_at is null)::int as active,
           count(*) filter (where archived_at is not null)::int as archived,
           count(*) filter (where archived_at is null
             and not exists (select 1 from student_phones p where p.student_id = st.id))::int as no_phone
    from students st`);
  const t = totals.rows[0];
  const filtered = Boolean(q || classId || showArchived);
  const activeClasses = classes.rows.filter((c) => c.active);

  return (
    <AdminFrame
      admin={admin}
      title="Students"
      current="/admin/roster"
      actions={
        <LinkButton href="/admin/roster/import" variant="secondary" size="sm">
          Upload a roster file
        </LinkButton>
      }
    >
      <Flash ok={sp.ok} error={sp.error} />

      <p className="mb-4 text-muted">
        {t.active} active {t.active === 1 ? "student" : "students"}
        {t.archived > 0 ? `, ${t.archived} archived` : ""}.
        {t.no_phone > 0
          ? ` ${t.no_phone} ${t.no_phone === 1 ? "has" : "have"} no phone number and cannot book online — the office books for them.`
          : ""}
      </p>

      <Panel className="mb-4">
        <Form action="/admin/roster" className="grid gap-3 sm:grid-cols-[1fr_12rem_auto_auto] sm:items-end">
          <div>
            <label htmlFor="q" className={adminLabel}>
              Search by name, admission no. or phone
            </label>
            <input id="q" name="q" type="search" defaultValue={q} maxLength={60} className={adminInput} />
          </div>
          <div>
            <label htmlFor="class" className={adminLabel}>
              Class
            </label>
            <select id="class" name="class" defaultValue={classId} className={adminInput}>
              <option value="">All classes</option>
              {classes.rows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.active ? "" : " (not active)"}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} className="size-5" />
            Show archived
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" size="sm">
              Search
            </Button>
            {filtered ? (
              <LinkButton href="/admin/roster" variant="quiet" size="sm">
                Clear
              </LinkButton>
            ) : null}
          </div>
        </Form>
      </Panel>

      <Panel className="mb-4">
        <details open={one(sp.add) === "1"}>
          <summary className="cursor-pointer text-xl font-extrabold">Add a student</summary>
          {activeClasses.length === 0 ? (
            <p className="mt-3">
              There are no classes yet. <Link href="/admin/classes">Add a class</Link> first.
            </p>
          ) : (
            <form action={addStudentAction} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="add-name" className={adminLabel}>
                    Child&apos;s name
                  </label>
                  <input id="add-name" name="name" required maxLength={80} autoComplete="off" className={adminInput} />
                </div>
                <div>
                  <label htmlFor="add-adm" className={adminLabel}>
                    Admission no. <span className="font-normal text-muted">(recommended)</span>
                  </label>
                  <input id="add-adm" name="admissionNo" maxLength={30} autoComplete="off" className={adminInput} />
                </div>
                <div>
                  <label htmlFor="add-class" className={adminLabel}>
                    Class
                  </label>
                  <select id="add-class" name="classSectionId" required defaultValue={classId} className={adminInput}>
                    <option value="">Choose…</option>
                    {activeClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <PhoneFields idPrefix="add" rows={2} />
              <p className="text-sm text-muted">
                Parents sign in with these numbers. Without a number the parent cannot book online — the office books for them.
                More numbers can be added after saving.
              </p>
              <SubmitButton size="sm">Add student</SubmitButton>
            </form>
          )}
        </details>
      </Panel>

      <Panel>
        {rows.length === 0 ? (
          <p className="text-muted">
            {filtered
              ? "No students match. Try fewer letters, or tick “Show archived”."
              : "No students yet. Upload a roster file, or add a student above."}
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted">
              Showing {rows.length} {rows.length === 1 ? "student" : "students"}
              {res.rows.length > MAX_ROWS ? ` (the first ${MAX_ROWS}; search to narrow down)` : ""}. Tap a name to edit.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-line">
                    <th className={th}>Name</th>
                    <th className={`${th} hidden sm:table-cell`}>Admission no.</th>
                    <th className={`${th} hidden sm:table-cell`}>Class</th>
                    <th className={th}>Phones</th>
                    <th className={`${th} hidden sm:table-cell`}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className={td}>
                        <Link href={`/admin/roster/${r.id}`} className="text-base font-bold">
                          {r.name}
                        </Link>
                        <div className="text-muted sm:hidden">
                          {r.label}
                          {r.admission_no ? ` · Adm. ${r.admission_no}` : ""}
                          {r.archived ? " · Archived" : ""}
                        </div>
                      </td>
                      <td className={`${td} hidden sm:table-cell`}>{r.admission_no ?? <span className="text-muted">—</span>}</td>
                      <td className={`${td} hidden whitespace-nowrap sm:table-cell`}>
                        <Pill tone={asTone(r.color)}>{r.label}</Pill>
                      </td>
                      <td className={td}>
                        {r.phones.length === 0 ? (
                          <span className="font-semibold text-tangerine-ink">
                            No phone: cannot book online — the office books for them
                          </span>
                        ) : (
                          <ul>
                            {r.phones.map((p) => (
                              <li key={p.phone} className="whitespace-nowrap">
                                {formatPhone(p.phone)}
                                {p.label ? <span className="text-muted"> ({p.label})</span> : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className={`${td} hidden sm:table-cell`}>
                        {r.archived ? <Pill tone="tangerine">Archived</Pill> : <Pill tone="leaf">Active</Pill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </AdminFrame>
  );
}
