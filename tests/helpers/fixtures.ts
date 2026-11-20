import type { Pool } from "pg";
import type { Db } from "../../src/db/client";
import { createMeeting, publishMeeting } from "../../src/domain/meetings";
import { addDays, istDate, istToInstant } from "../../src/domain/time";

export const ADMIN = { adminId: "admin1" };

export const phoneFor = (n: number) => `+9198${String(10000000 + n)}`;

/** Two teachers, two sections; `count` children in Nursery A, two in LKG A. */
export async function seedRoster(pool: Pool, count = 3) {
  await pool.query(`
    insert into admin_users (id, name, username, password_hash, role) values ('admin1', 'Office', 'office', 'x', 'owner');
    insert into teachers (id, name, name_key) values
      ('t1', 'Ms Kaur', 'ms kaur'), ('t2', 'Ms Sharma', 'ms sharma'), ('t3', 'Ms Gill', 'ms gill');
    insert into class_sections (id, key, class_name, section, label, teacher_id, sort_order) values
      ('c1', 'NURSERY|A', 'Nursery', 'A', 'Nursery A', 't1', 1),
      ('c2', 'LKG|A', 'LKG', 'A', 'LKG A', 't2', 2);
  `);
  for (let i = 1; i <= count; i++) {
    await pool.query("insert into students (id, name, name_key, class_section_id) values ($1, $2, $3, 'c1')", [
      `s${i}`,
      `Child ${i}`,
      `child ${i}`,
    ]);
    await pool.query("insert into student_phones (student_id, phone) values ($1, $2)", [`s${i}`, phoneFor(i)]);
  }
  await pool.query(`
    insert into students (id, name, name_key, class_section_id) values ('k1', 'Kid One', 'kid one', 'c2'), ('k2', 'Kid Two', 'kid two', 'c2');
    insert into student_phones (student_id, phone) values ('k1', '+919811111111'), ('k2', '+919822222222'),
      ('k1', '${phoneFor(1)}');  -- child 1 has a sibling in LKG A
  `);
}

/** A published meeting a few days from now, booking open, 09:00-11:00 in 10-minute slots (12 per teacher). */
export async function seedMeeting(db: Db, opts: { daysAhead?: number; publish?: boolean; slotMinutes?: number } = {}) {
  const date = addDays(istDate(new Date()), opts.daysAhead ?? 5);
  const created = await createMeeting(
    db,
    {
      title: "Test PTM",
      date,
      startMin: 9 * 60,
      endMin: 11 * 60,
      slotMinutes: opts.slotMinutes ?? 10,
      gapMinutes: 0,
      bookingOpensAt: new Date(Date.now() - 3600_000),
      bookingClosesAt: new Date(istToInstant(date, 9 * 60).getTime() - 3600_000),
      sectionIds: ["c1", "c2"],
    },
    ADMIN,
  );
  if (!created.ok) throw new Error(created.error);
  if (opts.publish !== false) {
    const p = await publishMeeting(db, created.id, ADMIN);
    if (!p.ok) throw new Error(p.error);
  }
  return { meetingId: created.id, date };
}

export async function slotsOf(pool: Pool, meetingId: string, teacherId: string): Promise<string[]> {
  const r = await pool.query(
    "select id from slots where meeting_id = $1 and teacher_id = $2 and state <> 'cancelled' order by starts_at",
    [meetingId, teacherId],
  );
  return r.rows.map((x) => x.id as string);
}

export async function bookedCount(pool: Pool, where = "true"): Promise<number> {
  const r = await pool.query(`select count(*)::int as n from bookings where status = 'booked' and ${where}`);
  return r.rows[0].n;
}
