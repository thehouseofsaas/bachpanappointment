// Direct SQL against the schema, with no application code in between:
// each rule must hold even if the app has a bug.
import { describe, expect, it } from "vitest";
import { useTestDb } from "../helpers/db";

const { pool } = useTestDb();

async function seed() {
  await pool.query(`
    insert into teachers (id, name, name_key) values ('t1', 'Ms Kaur', 'ms kaur'), ('t2', 'Ms Sharma', 'ms sharma');
    insert into class_sections (id, key, class_name, section, label, teacher_id) values
      ('c1', 'NURSERY|A', 'Nursery', 'A', 'Nursery A', 't1'),
      ('c2', 'LKG|A', 'LKG', 'A', 'LKG A', 't2');
    insert into students (id, name, name_key, class_section_id) values
      ('s1', 'Aarav', 'aarav', 'c1'), ('s2', 'Meher', 'meher', 'c1');
    insert into meetings (id, slug, title, status, meeting_date, booking_opens_at, booking_closes_at,
                          default_start, default_end, slot_minutes) values
      ('m1', 'dec', 'December PTM', 'published', '2026-12-12', '2026-12-01T00:00:00Z', '2026-12-11T14:30:00Z',
       '09:00', '12:00', 10),
      ('m2', 'jan', 'January PTM', 'published', '2027-01-09', '2027-01-01T00:00:00Z', '2027-01-08T14:30:00Z',
       '09:00', '12:00', 10);
    insert into meeting_sessions (id, meeting_id, teacher_id, starts_at, ends_at, slot_minutes) values
      ('ses1', 'm1', 't1', '2026-12-12T03:30:00Z', '2026-12-12T06:30:00Z', 10),
      ('ses2', 'm1', 't2', '2026-12-12T03:30:00Z', '2026-12-12T06:30:00Z', 10);
    insert into slots (id, session_id, meeting_id, teacher_id, starts_at, ends_at) values
      ('sl1', 'ses1', 'm1', 't1', '2026-12-12T03:30:00Z', '2026-12-12T03:40:00Z'),
      ('sl2', 'ses1', 'm1', 't1', '2026-12-12T03:40:00Z', '2026-12-12T03:50:00Z'),
      ('sl3', 'ses2', 'm1', 't2', '2026-12-12T03:30:00Z', '2026-12-12T03:40:00Z');
  `);
}

const book = (id: string, slot: string, teacher: string, student: string) =>
  pool.query(
    `insert into bookings (id, ref_code, slot_id, meeting_id, teacher_id, student_id, source, class_label_snapshot)
     values ($1, $1, $2, 'm1', $3, $4, 'parent', 'Nursery A')`,
    [id, slot, teacher, student],
  );

describe("database constraints", () => {
  it("allows one active booking per slot", async () => {
    await seed();
    await book("b1", "sl1", "t1", "s1");
    await expect(book("b2", "sl1", "t1", "s2")).rejects.toMatchObject({
      code: "23505",
      constraint: "bookings_one_per_slot",
    });
  });

  it("allows one active booking per child, teacher and meeting", async () => {
    await seed();
    await book("b1", "sl1", "t1", "s1");
    await expect(book("b2", "sl2", "t1", "s1")).rejects.toMatchObject({
      code: "23505",
      constraint: "bookings_one_per_child",
    });
  });

  it("frees the slot and the child's allowance when a booking is cancelled", async () => {
    await seed();
    await book("b1", "sl1", "t1", "s1");
    await pool.query(
      "update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'parent' where id = 'b1'",
    );
    await book("b2", "sl1", "t1", "s2"); // someone else takes the slot
    await book("b3", "sl2", "t1", "s1"); // the child rebooks elsewhere
    const { rows } = await pool.query("select count(*)::int as n from bookings where status = 'booked'");
    expect(rows[0].n).toBe(2);
  });

  it("requires cancelled_at exactly when cancelled", async () => {
    await seed();
    await book("b1", "sl1", "t1", "s1");
    await expect(pool.query("update bookings set status = 'cancelled' where id = 'b1'")).rejects.toMatchObject({
      constraint: "bookings_cancel_check",
    });
  });

  it("rejects a booking whose teacher differs from its slot's teacher", async () => {
    await seed();
    await expect(book("b1", "sl1", "t2", "s1")).rejects.toMatchObject({
      code: "23503",
      constraint: "bookings_slot_fk",
    });
  });

  it("rejects overlapping slots for one teacher, even across meetings", async () => {
    await seed();
    await pool.query(`insert into meeting_sessions (id, meeting_id, teacher_id, starts_at, ends_at, slot_minutes)
      values ('ses3', 'm2', 't1', '2026-12-12T03:00:00Z', '2026-12-12T04:00:00Z', 10)`);
    await expect(
      pool.query(`insert into slots (id, session_id, meeting_id, teacher_id, starts_at, ends_at)
        values ('x1', 'ses3', 'm2', 't1', '2026-12-12T03:35:00Z', '2026-12-12T03:45:00Z')`),
    ).rejects.toMatchObject({ code: "23P01", constraint: "slots_no_overlap" });
  });

  it("lets a cancelled slot be replaced, and adjacent slots touch", async () => {
    await seed();
    await pool.query("update slots set state = 'cancelled' where id = 'sl1'");
    await pool.query(`insert into slots (id, session_id, meeting_id, teacher_id, starts_at, ends_at)
      values ('x1', 'ses1', 'm1', 't1', '2026-12-12T03:30:00Z', '2026-12-12T03:40:00Z')`);
    await pool.query(`insert into slots (id, session_id, meeting_id, teacher_id, starts_at, ends_at)
      values ('x2', 'ses1', 'm1', 't1', '2026-12-12T03:50:00Z', '2026-12-12T04:00:00Z')`);
  });

  it("moves slots and bookings with the session when a substitute takes over", async () => {
    await seed();
    await pool.query("insert into teachers (id, name, name_key) values ('t3', 'Ms Gill', 'ms gill')");
    await book("b1", "sl1", "t1", "s1");
    await pool.query("update meeting_sessions set teacher_id = 't3' where id = 'ses1'");
    const slot = await pool.query("select teacher_id from slots where id = 'sl1'");
    const booking = await pool.query("select teacher_id from bookings where id = 'b1'");
    expect(slot.rows[0].teacher_id).toBe("t3");
    expect(booking.rows[0].teacher_id).toBe("t3");
  });

  it("refuses a substitute who is busy at that time", async () => {
    await seed();
    await expect(pool.query("update meeting_sessions set teacher_id = 't2' where id = 'ses1'")).rejects.toMatchObject(
      { code: "23505", constraint: "meeting_sessions_one_per_teacher" },
    );
  });

  it("allows one session per class section in a meeting", async () => {
    await seed();
    await pool.query("insert into session_sections (session_id, meeting_id, class_section_id) values ('ses1', 'm1', 'c1')");
    await expect(
      pool.query("insert into session_sections (session_id, meeting_id, class_section_id) values ('ses2', 'm1', 'c1')"),
    ).rejects.toMatchObject({ constraint: "session_sections_one_session_per_meeting" });
  });

  it("rejects malformed phones, bad booking windows and out-of-range slot lengths", async () => {
    await seed();
    await expect(
      pool.query("insert into student_phones (student_id, phone) values ('s1', '9876543210')"),
    ).rejects.toMatchObject({ code: "23514" });
    await pool.query("insert into student_phones (student_id, phone) values ('s1', '+919876543210')");
    await expect(
      pool.query("update meetings set booking_closes_at = booking_opens_at where id = 'm1'"),
    ).rejects.toMatchObject({ constraint: "meetings_window_check" });
    await expect(pool.query("update meeting_sessions set slot_minutes = 2 where id = 'ses1'")).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("keeps admission numbers unique but optional", async () => {
    await seed();
    await pool.query("update students set admission_no = 'A-101' where id = 's1'");
    await expect(pool.query("update students set admission_no = 'A-101' where id = 's2'")).rejects.toMatchObject({
      constraint: "students_admission_no_key",
    });
  });
});
