import type { Metadata } from "next";
import Form from "next/form";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { AdminFrame, AdminLoading, Flash, Panel, adminInput, adminLabel, td, th } from "@/components/admin/frame";
import { Button, LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { formatPhone } from "@/domain/phone";
import { formatDate, formatDayTime, isValidDate } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";

export const metadata: Metadata = { title: "Activity log" };

const LIMIT = 200;

export default function Page({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

type Detail = Record<string, unknown>;
type Row = {
  id: number;
  at: Date;
  actor_type: "admin" | "parent" | "teacher" | "system";
  actor: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: Detail | null;
};

type Names = {
  admins: Map<string, string>;
  teachers: Map<string, string>;
  students: Map<string, string>;
  meetings: Map<string, string>;
  sessions: Map<string, string>;
};

const text = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const count = (v: unknown, one: string, many: string) => {
  const n = typeof v === "number" ? v : 0;
  return `${n} ${n === 1 ? one : many}`;
};
const day = (v: unknown) => (typeof v === "string" && isValidDate(v) ? formatDate(v, "short") : text(v));

/** A plain sentence for the actions we know; null means "show the code". */
function sentence(r: Row, n: Names): string | null {
  const d = r.detail ?? {};
  const student = n.students.get(text(d.studentId) || (r.entity === "student" ? (r.entity_id ?? "") : "")) ?? text(d.name);
  const child = student || "a child";
  const meetingId = r.entity === "meeting" ? (r.entity_id ?? "") : text(d.meetingId);
  const meeting = n.meetings.get(meetingId) ?? text(d.title);
  const m = meeting ? `“${meeting}”` : "a meeting";
  const session = (r.entity === "session" && n.sessions.get(r.entity_id ?? "")) || "a teacher's session";
  const named = text(d.name) || text(d.label);

  switch (r.action) {
    case "admin.login":
      return "Signed in";
    case "admin.login_failed":
      return `Wrong password tried for ${n.admins.get(r.entity_id ?? "") ?? "an admin account"}`;
    case "admin.add":
      return `Made an admin account for ${named}`;
    case "admin.enable":
      return `Enabled ${named}'s admin account`;
    case "admin.disable":
      return `Disabled ${named}'s admin account`;
    case "admin.password_reset":
      return `Set a new password for ${named}`;
    case "admin.password_change":
      return "Changed their own password";
    case "booking.create":
      return `Booked a time for ${child}${meeting ? ` in ${m}` : ""}`;
    case "booking.change":
      return `Changed the booked time for ${child}`;
    case "booking.cancel":
      return `Cancelled the booking for ${child}`;
    case "booking.cancel_by_school":
      return `Cancelled ${count(Array.isArray(d.ids) ? d.ids.length : 0, "booking", "bookings")} for the school`;
    case "booking.restore":
      return "Brought back a cancelled booking";
    case "booking.lock":
      return "Locked a booking so the parent cannot change it";
    case "booking.unlock":
      return "Unlocked a booking";
    case "booking.attendance":
      return `Marked a booking as ${d.attendance === "attended" ? "attended" : d.attendance === "no_show" ? "did not come" : "not yet marked"}`;
    case "meeting.create":
      return `Created the meeting ${m}`;
    case "meeting.update":
      return d.paused === true ? `Saved ${m} with booking paused` : `Changed the details of ${m}`;
    case "meeting.rebuild":
      return `Changed the draft timetable of ${m}`;
    case "meeting.publish":
      return `Published ${m}`;
    case "meeting.delete":
      return "Deleted a draft meeting";
    case "meeting.postpone":
      return `Moved ${m} from ${day(d.from)} to ${day(d.to)}`;
    case "meeting.cancel":
      return `Cancelled ${m} (${count(d.cancelled, "booking", "bookings")} cancelled)`;
    case "session.update":
      return `Changed ${session}`;
    case "session.cancel":
      return `Cancelled ${session} (${count(d.cancelled, "booking", "bookings")} cancelled)`;
    case "session.restore":
      return `Brought back ${session}`;
    case "session.substitute":
      return `Substitute teacher: ${n.teachers.get(text(d.from)) ?? "one teacher"} → ${n.teachers.get(text(d.to)) ?? "another"}`;
    case "slot.block":
      return "Blocked a time slot";
    case "slot.unblock":
      return "Opened a blocked time slot";
    case "roster.upload":
      return `Uploaded the roster file ${text(d.filename)}`;
    case "roster.import":
      return "Applied a roster upload";
    case "roster.discard":
      return `Discarded the roster file ${text(d.filename)}`;
    case "student.add":
      return `Added the student ${child}`;
    case "student.update":
      return `Edited the student ${child}`;
    case "student.archive":
      return `Archived the student ${child}`;
    case "student.restore":
      return `Restored the student ${child}`;
    case "class.add":
      return `Added the class ${named}`;
    case "class.update":
      return `Changed the class ${named}`;
    case "teacher.add":
      return `Added the teacher ${named}`;
    case "teacher.update":
      return `Changed the teacher ${named}`;
    case "teacher.new_link":
      return `Made a new schedule link for ${named}`;
    case "settings.update":
      return "Changed the settings";
    case "settings.logo":
      return d.removed === true ? "Removed the school logo" : "Changed the school logo";
    case "data.export":
      return "Downloaded everything as a spreadsheet";
    case "data.purge":
      return `Cleared data older than ${text(d.months)} months`;
    case "signin.flood":
      return "Many failed parent sign-ins within one hour";
    default:
      return null;
  }
}

/** The stored detail as short text: internal ids and things the sentence already says are left out. */
function detailText(r: Row): string {
  if (!r.detail) return "";
  const hide = new Set(["name", "label", "title", "filename", "note"]);
  if (r.action === "booking.change" || r.action === "session.substitute" || r.action === "meeting.postpone") {
    hide.add("from");
    hide.add("to");
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(r.detail)) {
    if (hide.has(key) || /ids?$/i.test(key) || value === null || value === undefined || value === "" || value === 0) continue;
    const shown = Array.isArray(value)
      ? value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")
      : typeof value === "object"
        ? JSON.stringify(value)
        : value === true
          ? "yes"
          : value === false
            ? "no"
            : String(value);
    if (shown) parts.push(`${key}: ${shown}`);
  }
  const out = parts.join(" · ");
  return out.length > 180 ? `${out.slice(0, 177)}…` : out;
}

async function Audit({ searchParams }: Pick<PageProps<"/admin/audit">, "searchParams">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const q = one(sp.q).trim().slice(0, 60);
  const like = `%${likeEscape(q)}%`;

  const res = await db.execute<Row>(sql`
    select l.id, l.at, l.actor_type, l.actor, l.action, l.entity, l.entity_id, l.detail
    from audit_log l
    left join admin_users a on l.actor_type = 'admin' and a.id = l.actor
    left join teachers t on l.actor_type = 'teacher' and t.id = l.actor
    where ${q
      ? sql`(l.action ilike ${like} or l.entity ilike ${like} or l.actor ilike ${like}
             or l.actor_type ilike ${like} or a.name ilike ${like} or t.name ilike ${like})`
      : sql`true`}
    order by l.at desc, l.id desc
    limit ${LIMIT}`);
  const rows = res.rows;

  // Names for the ids the log mentions, fetched once.
  const ids = { admins: new Set<string>(), teachers: new Set<string>(), students: new Set<string>(), meetings: new Set<string>(), sessions: new Set<string>() };
  for (const r of rows) {
    const d = r.detail ?? {};
    if (r.actor_type === "admin" && r.actor) ids.admins.add(r.actor);
    if (r.actor_type === "teacher" && r.actor) ids.teachers.add(r.actor);
    if (r.entity === "admin" && r.entity_id) ids.admins.add(r.entity_id);
    if (r.entity === "student" && r.entity_id) ids.students.add(r.entity_id);
    if (r.entity === "meeting" && r.entity_id) ids.meetings.add(r.entity_id);
    if (r.entity === "session" && r.entity_id) ids.sessions.add(r.entity_id);
    if (typeof d.studentId === "string") ids.students.add(d.studentId);
    if (typeof d.meetingId === "string") ids.meetings.add(d.meetingId);
    if (r.action === "session.substitute") {
      for (const v of [d.from, d.to]) if (typeof v === "string") ids.teachers.add(v);
    }
  }
  async function lookup(set: Set<string>, query: (list: string[]) => ReturnType<typeof sql>): Promise<Map<string, string>> {
    if (set.size === 0) return new Map();
    const found = await db.execute<{ id: string; name: string }>(query([...set]));
    return new Map(found.rows.map((x) => [x.id, x.name]));
  }
  const names: Names = {
    admins: await lookup(ids.admins, (l) => sql`select id, name from admin_users where id in ${l}`),
    teachers: await lookup(ids.teachers, (l) => sql`select id, name from teachers where id in ${l}`),
    students: await lookup(ids.students, (l) => sql`select id, name from students where id in ${l}`),
    meetings: await lookup(ids.meetings, (l) => sql`select id, title as name from meetings where id in ${l}`),
    sessions: await lookup(
      ids.sessions,
      (l) => sql`
        select ms.id, t.name || '''s session in “' || m.title || '”' as name
        from meeting_sessions ms join teachers t on t.id = ms.teacher_id join meetings m on m.id = ms.meeting_id
        where ms.id in ${l}`,
    ),
  };

  function who(r: Row): string {
    if (r.actor_type === "admin") return names.admins.get(r.actor ?? "") ?? "An admin (account removed)";
    if (r.actor_type === "parent") return r.actor ? `Parent ${formatPhone(r.actor)}` : "A parent";
    if (r.actor_type === "teacher") return names.teachers.get(r.actor ?? "") ?? "A teacher";
    return "System";
  }

  return (
    <AdminFrame admin={admin} title="Activity log" current="/admin/audit">
      <Flash ok={sp.ok} error={sp.error} />
      <Panel className="mb-4">
        <Form action="/admin/audit" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="q" className={adminLabel}>
              Filter by person or kind of action
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={60}
              placeholder="e.g. booking, student, roster, a name"
              className={adminInput}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" size="sm">
              Filter
            </Button>
            {q ? (
              <LinkButton href="/admin/audit" variant="quiet" size="sm">
                Clear
              </LinkButton>
            ) : null}
          </div>
        </Form>
      </Panel>

      <Panel>
        {rows.length === 0 ? (
          <p className="text-muted">{q ? "Nothing in the log matches that." : "Nothing has been recorded yet."}</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted">
              {rows.length === LIMIT ? `The newest ${LIMIT} entries` : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
              {q ? ` matching “${q}”` : ""}, newest first. Times are India time. The log cannot be edited.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-line">
                    <th className={th}>When</th>
                    <th className={`${th} hidden sm:table-cell`}>Who</th>
                    <th className={th}>
                      <span className="sm:hidden">Who and what</span>
                      <span className="hidden sm:inline">What</span>
                    </th>
                    <th className={`${th} hidden sm:table-cell`}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const what = sentence(r, names);
                    const details = detailText(r);
                    return (
                      <tr key={r.id} className="border-b border-line last:border-0">
                        <td className={`${td} w-24 sm:w-auto sm:whitespace-nowrap`}>{formatDayTime(new Date(r.at))}</td>
                        <td className={`${td} hidden min-w-28 sm:table-cell`}>{who(r)}</td>
                        <td className={`${td} sm:min-w-52`}>
                          {/* On a phone, who and the details sit with the sentence so nothing is off-screen. */}
                          <div className="font-bold sm:hidden">{who(r)}</div>
                          {what ?? <span className="font-mono">{r.action}</span>}
                          {what ? <div className="font-mono text-xs text-muted">{r.action}</div> : null}
                          {details ? <div className="mt-1 break-words text-muted sm:hidden">{details}</div> : null}
                        </td>
                        <td className={`${td} hidden min-w-40 break-words text-muted sm:table-cell`}>{details}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </AdminFrame>
  );
}
