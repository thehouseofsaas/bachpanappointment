import { describe, expect, it } from "vitest";
import { bookSlot } from "../../src/domain/booking";
import {
  cancelMeeting,
  cancelSession,
  createMeeting,
  postponeMeeting,
  publishMeeting,
  restoreSession,
  setSlotBlocked,
  substituteTeacher,
  updateSession,
  validateMeetingInput,
} from "../../src/domain/meetings";
import { addDays, istDate, istParts, istToInstant } from "../../src/domain/time";
import { useTestDb } from "../helpers/db";
import { ADMIN, bookedCount, phoneFor, seedMeeting, seedRoster, slotsOf } from "../helpers/fixtures";

const { db, pool } = useTestDb(40);
const parent = (n: number) => ({ kind: "parent" as const, phone: phoneFor(n) });

async function sessionOf(meetingId: string, teacherId: string): Promise<string> {
  const r = await pool.query("select id from meeting_sessions where meeting_id = $1 and teacher_id = $2", [meetingId, teacherId]);
  return r.rows[0].id;
}

describe("meeting set-up", () => {
  it("validates the form", () => {
    const now = new Date();
    const date = addDays(istDate(now), 3);
    const good = {
      title: "PTM",
      date,
      startMin: 540,
      endMin: 660,
      slotMinutes: 10,
      gapMinutes: 0,
      bookingOpensAt: now,
      bookingClosesAt: istToInstant(date, 480),
      sectionIds: ["c1"],
    };
    expect(validateMeetingInput(good, now)).toEqual([]);
    expect(validateMeetingInput({ ...good, title: " " }, now)[0]).toMatch(/title/);
    expect(validateMeetingInput({ ...good, date: "2026-02-31" }, now)[0]).toMatch(/does not exist/);
    expect(validateMeetingInput({ ...good, date: addDays(istDate(now), -1) }, now).join()).toMatch(/past/);
    expect(validateMeetingInput({ ...good, bookingClosesAt: istToInstant(date, 600) }, now).join()).toMatch(/before the first slot/);
    expect(validateMeetingInput({ ...good, bookingClosesAt: new Date(now.getTime() - 1) }, now).join()).toMatch(/after it opens/);
    expect(validateMeetingInput({ ...good, sectionIds: [] }, now).join()).toMatch(/at least one class/);
  });

  it("creates one session per class teacher with slots on a fixed grid", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db, { publish: false });
    const sessions = await pool.query("select teacher_id from meeting_sessions where meeting_id = $1 order by teacher_id", [meetingId]);
    expect(sessions.rows.map((r) => r.teacher_id)).toEqual(["t1", "t2"]);
    const slots = await pool.query("select starts_at from slots where meeting_id = $1 and teacher_id = 't1' order by starts_at", [meetingId]);
    expect(slots.rows).toHaveLength(12);
    expect(slots.rows.map((r) => istParts(new Date(r.starts_at)).minutes)).toEqual(
      Array.from({ length: 12 }, (_, i) => 540 + i * 10),
    );
  });

  it("puts a teacher with two sections into one shared session", async () => {
    await seedRoster(pool);
    await pool.query("update class_sections set teacher_id = 't1' where id = 'c2'");
    const { meetingId } = await seedMeeting(db, { publish: false });
    const sessions = await pool.query("select id from meeting_sessions where meeting_id = $1", [meetingId]);
    expect(sessions.rows).toHaveLength(1);
    const secs = await pool.query("select count(*)::int as n from session_sections where session_id = $1", [sessions.rows[0].id]);
    expect(secs.rows[0].n).toBe(2);
  });

  it("refuses a class with no teacher, an empty roster, and booking in a draft", async () => {
    await seedRoster(pool);
    await pool.query("update class_sections set teacher_id = null where id = 'c2'");
    const date = addDays(istDate(new Date()), 4);
    const base = {
      title: "PTM", date, startMin: 540, endMin: 600, slotMinutes: 10, gapMinutes: 0,
      bookingOpensAt: new Date(), bookingClosesAt: istToInstant(date, 480),
    };
    const noTeacher = await createMeeting(db, { ...base, sectionIds: ["c1", "c2"] }, ADMIN);
    expect(noTeacher).toMatchObject({ ok: false, error: expect.stringMatching(/LKG A has no class teacher/) });
    expect((await pool.query("select count(*)::int as n from meetings")).rows[0].n).toBe(0);

    await pool.query("update students set archived_at = now()");
    const m = await createMeeting(db, { ...base, sectionIds: ["c1"] }, ADMIN);
    if (!m.ok) throw new Error(m.error);
    expect(await publishMeeting(db, m.id, ADMIN)).toMatchObject({ ok: false, error: expect.stringMatching(/no students/) });
  });

  it("refuses a second meeting that overlaps a teacher's slots", async () => {
    await seedRoster(pool);
    await seedMeeting(db);
    const date = addDays(istDate(new Date()), 5);
    const clash = await createMeeting(
      db,
      {
        title: "Clash", date, startMin: 600, endMin: 720, slotMinutes: 15, gapMinutes: 0,
        bookingOpensAt: new Date(), bookingClosesAt: istToInstant(date, 480), sectionIds: ["c1"],
      },
      ADMIN,
    );
    expect(clash).toMatchObject({ ok: false, error: expect.stringMatching(/already has slots/) });
  });
});

describe("changes after publishing", () => {
  it("extends a window without touching bookings", async () => {
    await seedRoster(pool);
    const { meetingId, date } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    const ses = await sessionOf(meetingId, "t1");
    const r = await updateSession(db, ses, { date, startMin: 540, endMin: 720, slotMinutes: 10, gapMinutes: 0 }, ADMIN);
    expect(r).toMatchObject({ ok: true });
    expect(await slotsOf(pool, meetingId, "t1")).toHaveLength(18);
    expect(await bookedCount(pool)).toBe(1);
  });

  it("asks before shortening over booked slots, then cancels and lists them", async () => {
    await seedRoster(pool);
    const { meetingId, date } = await seedMeeting(db);
    const s = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: s[0], studentId: "s1", actor: parent(1) });
    await bookSlot(db, { slotId: s[11], studentId: "s2", actor: parent(2) });
    const ses = await sessionOf(meetingId, "t1");
    const edit = { date, startMin: 540, endMin: 600, slotMinutes: 10, gapMinutes: 0 };
    const ask = await updateSession(db, ses, edit, ADMIN);
    expect(ask).toMatchObject({ ok: false, needsConfirm: true });
    if (ask.ok || !("impact" in ask)) throw new Error("expected impact");
    expect(ask.impact.map((i) => i.studentId)).toEqual(["s2"]);
    expect(ask.impact[0].phones).toEqual([phoneFor(2)]);
    expect(await bookedCount(pool)).toBe(2); // nothing happened yet
    const done = await updateSession(db, ses, edit, ADMIN, true);
    expect(done).toMatchObject({ ok: true });
    expect(await slotsOf(pool, meetingId, "t1")).toHaveLength(6);
    const rows = await pool.query("select student_id, status, cancelled_by from bookings order by student_id");
    expect(rows.rows).toEqual([
      { student_id: "s1", status: "booked", cancelled_by: null },
      { student_id: "s2", status: "cancelled", cancelled_by: "school" },
    ]);
  });

  it("locks slot length and off-grid starts once bookings exist, but allows them before", async () => {
    await seedRoster(pool);
    const { meetingId, date } = await seedMeeting(db);
    const ses = await sessionOf(meetingId, "t1");
    const free = await updateSession(db, ses, { date, startMin: 545, endMin: 665, slotMinutes: 15, gapMinutes: 5 }, ADMIN);
    expect(free).toMatchObject({ ok: true });
    const s = await slotsOf(pool, meetingId, "t1");
    expect(s).toHaveLength(6);
    await bookSlot(db, { slotId: s[0], studentId: "s1", actor: parent(1) });
    expect(await updateSession(db, ses, { date, startMin: 545, endMin: 665, slotMinutes: 10, gapMinutes: 5 }, ADMIN)).toMatchObject({
      ok: false, error: expect.stringMatching(/Slot length cannot change/),
    });
    expect(await updateSession(db, ses, { date, startMin: 550, endMin: 665, slotMinutes: 15, gapMinutes: 5 }, ADMIN)).toMatchObject({
      ok: false, error: expect.stringMatching(/steps of 20 minutes/),
    });
  });

  it("blocks a booked slot only after confirmation", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    expect(await setSlotBlocked(db, a, true, ADMIN)).toMatchObject({ ok: false, needsConfirm: true });
    expect(await setSlotBlocked(db, a, true, ADMIN, true)).toMatchObject({ ok: true });
    expect(await bookedCount(pool)).toBe(0);
    expect(await bookSlot(db, { slotId: a, studentId: "s2", actor: parent(2) })).toEqual({ ok: false, code: "SLOT_UNAVAILABLE" });
    await setSlotBlocked(db, a, false, ADMIN);
    expect(await bookSlot(db, { slotId: a, studentId: "s2", actor: parent(2) })).toMatchObject({ ok: true });
  });

  it("cancels a session with its bookings and can undo it", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a, b] = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    await bookSlot(db, { slotId: b, studentId: "s2", actor: parent(2) });
    const ses = await sessionOf(meetingId, "t1");
    expect(await cancelSession(db, ses, ADMIN)).toMatchObject({ ok: false, needsConfirm: true });
    expect(await cancelSession(db, ses, ADMIN, true)).toMatchObject({ ok: true });
    expect(await bookedCount(pool)).toBe(0);
    expect(await bookSlot(db, { slotId: a, studentId: "s3", actor: parent(3) })).toEqual({ ok: false, code: "SLOT_UNAVAILABLE" });
    expect(await restoreSession(db, ses, ADMIN)).toMatchObject({ ok: true, restored: 2 });
    expect(await bookedCount(pool)).toBe(2);
  });

  it("hands a session to a substitute, with bookings, unless the substitute is busy", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    const mine = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    const ses = await sessionOf(meetingId, "t1");
    expect(await substituteTeacher(db, ses, "t2", ADMIN)).toMatchObject({ ok: false, error: expect.stringMatching(/already has a session/) });
    expect(await substituteTeacher(db, ses, "t3", ADMIN)).toMatchObject({ ok: true });
    const row = await pool.query("select teacher_id from bookings where id = $1", [mine.ok ? mine.bookingId : ""]);
    expect(row.rows[0].teacher_id).toBe("t3");
    // The child can still change slots with the substitute, and still cannot double-book.
    const s = await slotsOf(pool, meetingId, "t3");
    expect(await bookSlot(db, { slotId: s[3], studentId: "s1", actor: parent(1) })).toEqual({ ok: false, code: "ALREADY_BOOKED" });
    expect(await bookSlot(db, { slotId: s[3], studentId: "s2", actor: parent(2) })).toMatchObject({ ok: true });
  });

  it("postpones to another date keeping times and bookings", async () => {
    await seedRoster(pool);
    const { meetingId, date } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    const newDate = addDays(date, 1); // shifting by one day would collide without deferred checks
    expect(await postponeMeeting(db, meetingId, newDate, ADMIN)).toMatchObject({ ok: true });
    const slot = await pool.query("select starts_at from slots where id = $1", [a]);
    expect(istParts(new Date(slot.rows[0].starts_at))).toEqual({ date: newDate, minutes: 540 });
    const b = await pool.query("select status, time_changed_at is not null as flagged from bookings");
    expect(b.rows).toEqual([{ status: "booked", flagged: true }]);
    const m = await pool.query("select meeting_date::text, date_changed_at is not null as changed from meetings where id = $1", [meetingId]);
    expect(m.rows[0]).toEqual({ meeting_date: newDate, changed: true });
    expect(await postponeMeeting(db, meetingId, addDays(istDate(new Date()), -2), ADMIN)).toMatchObject({ ok: false });
  });

  it("cancels the whole meeting", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    expect(await cancelMeeting(db, meetingId, "School closed for the day", ADMIN)).toMatchObject({ ok: true, cancelled: 1 });
    expect(await bookedCount(pool)).toBe(0);
    expect(await bookSlot(db, { slotId: a, studentId: "s2", actor: parent(2) })).toEqual({ ok: false, code: "MEETING_CANCELLED" });
  });

  it("never leaves an active booking on a cancelled session when the two race", async () => {
    await seedRoster(pool, 12);
    for (let round = 0; round < 4; round++) {
      await pool.query("delete from bookings; delete from meetings");
      const { meetingId } = await seedMeeting(db);
      const s = await slotsOf(pool, meetingId, "t1");
      const ses = await sessionOf(meetingId, "t1");
      await Promise.all([
        ...s.map((slotId, i) => bookSlot(db, { slotId, studentId: `s${i + 1}`, actor: parent(i + 1) })),
        cancelSession(db, ses, ADMIN, true),
      ]);
      const stray = await pool.query(`
        select count(*)::int as n from bookings b join slots sl on sl.id = b.slot_id
        join meeting_sessions ms on ms.id = sl.session_id
        where b.status = 'booked' and ms.status = 'cancelled'`);
      expect(stray.rows[0].n).toBe(0);
    }
  });
});
