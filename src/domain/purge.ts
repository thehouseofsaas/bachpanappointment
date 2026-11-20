// Year-end clean-up: removes old meetings and the personal data that came
// with them. Deliberately explicit about order, because bookings and slots do
// not cascade from meetings.
import { sql, type SQL } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { audit } from "@/lib/audit";

export const MIN_PURGE_MONTHS = 6;
export const MAX_PURGE_MONTHS = 120;
export const DEFAULT_PURGE_MONTHS = 12;

export type PurgeCounts = {
  meetings: number;
  bookings: number;
  slots: number;
  auditRows: number;
  students: number;
  importPayloads: number;
  rateLimits: number;
};

/** Reads "how many months" from a form or query string; anything odd becomes the default. */
export function purgeMonths(raw: unknown): number {
  const s = String(raw ?? "").trim();
  const n = Number(s);
  if (!s || !Number.isInteger(n)) return DEFAULT_PURGE_MONTHS;
  return Math.min(MAX_PURGE_MONTHS, Math.max(MIN_PURGE_MONTHS, n));
}

function check(months: number): void {
  if (!Number.isInteger(months) || months < MIN_PURGE_MONTHS || months > MAX_PURGE_MONTHS) {
    throw new RangeError(`months must be a whole number from ${MIN_PURGE_MONTHS} to ${MAX_PURGE_MONTHS}`);
  }
}

// "Old" is measured on the database clock, in India time for meeting dates.
const cutoff = (months: number) => sql`(now() - make_interval(months => ${months}))`;
const oldMeetings = (months: number): SQL =>
  sql`(select id from meetings
       where meeting_date < ((now() at time zone 'Asia/Kolkata')::date - make_interval(months => ${months}))::date)`;
/** Children archived long ago who would have no booking left once old meetings are gone. */
const oldStudents = (months: number): SQL => sql`
  st.archived_at is not null and st.archived_at < ${cutoff(months)}
  and not exists (
    select 1 from bookings b where b.student_id = st.id and b.meeting_id not in ${oldMeetings(months)})`;
const STALE_IMPORT = sql`created_at < now() - interval '30 days' and staged <> '{}'::jsonb`;
const STALE_RATE_LIMIT = sql`window_start < now() - interval '1 day'`;

/** What purgeOldData would remove right now. Changes nothing. */
export async function purgePreview(db: DbOrTx, months: number): Promise<PurgeCounts> {
  check(months);
  const res = await db.execute<PurgeCounts>(sql`
    select
      (select count(*) from meetings where id in ${oldMeetings(months)})::int as "meetings",
      (select count(*) from bookings where meeting_id in ${oldMeetings(months)})::int as "bookings",
      (select count(*) from slots where meeting_id in ${oldMeetings(months)})::int as "slots",
      (select count(*) from audit_log where at < ${cutoff(months)})::int as "auditRows",
      (select count(*) from students st where ${oldStudents(months)})::int as "students",
      (select count(*) from roster_imports where ${STALE_IMPORT})::int as "importPayloads",
      (select count(*) from rate_limits where ${STALE_RATE_LIMIT})::int as "rateLimits"`);
  return res.rows[0];
}

/**
 * Deletes meetings held more than `months` months ago (with their bookings,
 * slots and sessions), activity-log rows of the same age, children archived
 * that long ago who have no bookings left, uploaded roster files older than
 * 30 days, and stale sign-in counters. All or nothing.
 */
export async function purgeOldData(
  db: Db,
  months: number,
  actor: { adminId: string; ip?: string | null },
): Promise<{ ok: true; counts: PurgeCounts } | { ok: false; error: string }> {
  try {
    check(months);
  } catch {
    return { ok: false, error: `Choose a whole number of months from ${MIN_PURGE_MONTHS} to ${MAX_PURGE_MONTHS}.` };
  }
  return db.transaction(async (tx) => {
    // Admin structural edits and bookings lock meetings; take them first so nothing changes underneath.
    const old = await tx.execute<{ id: string }>(sql`
      select id from meetings where id in ${oldMeetings(months)} order by id for update`);
    const ids = old.rows.map((r) => r.id);
    const n = (r: { rowCount: number | null }) => r.rowCount ?? 0;

    const counts: PurgeCounts = { meetings: 0, bookings: 0, slots: 0, auditRows: 0, students: 0, importPayloads: 0, rateLimits: 0 };
    if (ids.length > 0) {
      counts.bookings = n(await tx.execute(sql`delete from bookings where meeting_id in ${ids}`));
      counts.slots = n(await tx.execute(sql`delete from slots where meeting_id in ${ids}`));
      await tx.execute(sql`delete from session_sections where meeting_id in ${ids}`);
      await tx.execute(sql`delete from meeting_sessions where meeting_id in ${ids}`);
      counts.meetings = n(await tx.execute(sql`delete from meetings where id in ${ids}`));
    }
    counts.auditRows = n(await tx.execute(sql`delete from audit_log where at < ${cutoff(months)}`));
    // Phones go with the student (on delete cascade).
    counts.students = n(
      await tx.execute(sql`
        delete from students st
        where st.archived_at is not null and st.archived_at < ${cutoff(months)}
          and not exists (select 1 from bookings b where b.student_id = st.id)`),
    );
    // The uploaded rows hold names and phone numbers; the one-line history entry stays.
    counts.importPayloads = n(
      await tx.execute(sql`
        update roster_imports
        set staged = '{}'::jsonb, status = case when status = 'staged' then 'discarded' else status end
        where ${STALE_IMPORT}`),
    );
    counts.rateLimits = n(await tx.execute(sql`delete from rate_limits where ${STALE_RATE_LIMIT}`));

    await audit(tx, {
      actorType: "admin",
      actor: actor.adminId,
      ip: actor.ip,
      action: "data.purge",
      detail: { months, ...counts },
    });
    return { ok: true as const, counts };
  });
}
