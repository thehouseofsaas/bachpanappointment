import { hash } from "@node-rs/argon2";
import { createDb } from "../../src/db/client";
import { bookSlot } from "../../src/domain/booking";
import { createMeeting, publishMeeting } from "../../src/domain/meetings";
import { addDays, istDate, istToInstant } from "../../src/domain/time";
import { E2E_DB_PORT } from "../../playwright.config";
import { startLocalPg } from "../helpers/pg";

export const ADMIN_PASSWORD = "e2e-password-123";

/** Starts a fresh database and fills it with a small, known school. */
export default async function globalSetup() {
  const pg = await startLocalPg({ dir: ".pgdata-e2e", port: E2E_DB_PORT, fresh: true });
  const { db, pool } = createDb(pg.url, 5);
  await pool.query("insert into admin_users (id, name, username, password_hash, role) values ('admin1', 'Office', 'office', $1, 'owner')", [
    await hash(ADMIN_PASSWORD),
  ]);
  await pool.query(`
    insert into teachers (id, name, name_key) values ('teach1', 'Ms. Kaur', 'kaur'), ('teach2', 'Ms. Sharma', 'sharma'), ('teach3', 'Ms. Gill', 'gill');
    insert into class_sections (id, key, class_name, section, label, sort_order, color, badge, teacher_id) values
      ('nura', 'NURSERY|A', 'Nursery', 'A', 'Nursery A', 200, 'leaf', 'frog', 'teach1'),
      ('lkga', 'LKG|A', 'LKG', 'A', 'LKG A', 300, 'sky', 'elephant', 'teach2');
    insert into students (id, admission_no, name, name_key, class_section_id) values
      ('aarav', 'E1', 'Aarav Singh', 'aarav singh', 'nura'),
      ('kabir', 'E2', 'Kabir Sandhu', 'kabir sandhu', 'nura'),
      ('zoya', 'E3', 'Zoya Khan', 'zoya khan', 'nura'),
      ('meher', 'E4', 'Meher Singh', 'meher singh', 'lkga'),
      ('noor', 'E5', 'Noor Gill', 'noor gill', 'lkga');
    insert into student_phones (student_id, phone) values
      ('aarav', '+919000000001'), ('meher', '+919000000001'),
      ('kabir', '+919000000002'), ('zoya', '+919000000003'), ('noor', '+919000000004');
  `);
  const actor = { adminId: "admin1" };
  const today = istDate(new Date());

  // The meeting parents book in the tests: six days out, 09:00-10:00, six slots per teacher.
  const date = addDays(today, 6);
  const main = await createMeeting(
    db,
    {
      title: "December PTM", date, startMin: 540, endMin: 600, slotMinutes: 10, gapMinutes: 0,
      venue: "Main building", bookingOpensAt: new Date(Date.now() - 3600_000),
      bookingClosesAt: istToInstant(addDays(date, -1), 20 * 60), sectionIds: ["nura", "lkga"],
    },
    actor,
  );
  if (!main.ok) throw new Error(main.error);
  await publishMeeting(db, main.id, actor);

  // A meeting happening today for the teacher-attendance test: created for tomorrow, then moved back a day.
  const tomorrow = addDays(today, 1);
  const live = await createMeeting(
    db,
    {
      title: "Today PTM", date: tomorrow, startMin: 540, endMin: 570, slotMinutes: 10, gapMinutes: 0,
      bookingOpensAt: new Date(Date.now() - 3600_000), bookingClosesAt: new Date(Date.now() - 1000 + 60_000),
      sectionIds: ["lkga"],
    },
    actor,
  );
  if (!live.ok) throw new Error(live.error);
  await publishMeeting(db, live.id, actor);
  const slot = await pool.query("select id from slots where meeting_id = $1 order by starts_at limit 1", [live.id]);
  const booked = await bookSlot(db, { slotId: slot.rows[0].id, studentId: "noor", actor: { kind: "admin", adminId: "admin1" } });
  if (!booked.ok) throw new Error(booked.code);
  await pool.query("update meeting_sessions set starts_at = starts_at - interval '1 day', ends_at = ends_at - interval '1 day' where meeting_id = $1", [live.id]);
  await pool.query("update slots set starts_at = starts_at - interval '1 day', ends_at = ends_at - interval '1 day' where meeting_id = $1", [live.id]);
  await pool.query("update meetings set meeting_date = $2, booking_opens_at = now() - interval '2 days', booking_closes_at = now() - interval '1 day' where id = $1", [live.id, today]);
  await pool.end();

  return async () => {
    await pg.stop();
  };
}
