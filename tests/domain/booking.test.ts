import { describe, expect, it } from "vitest";
import { bookSlot, cancelBooking, changeSlot, restoreBooking, setAttendance } from "../../src/domain/booking";
import { useTestDb } from "../helpers/db";
import { ADMIN, bookedCount, phoneFor, seedMeeting, seedRoster, slotsOf } from "../helpers/fixtures";

const { db, pool } = useTestDb(40);
const parent = (n: number) => ({ kind: "parent" as const, phone: phoneFor(n) });
const admin = { kind: "admin" as const, adminId: ADMIN.adminId };

describe("booking", () => {
  it("books a slot, and repeating the same request is a harmless success", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    const first = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    expect(first).toMatchObject({ ok: true, slotId: a });
    const again = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    expect(again).toMatchObject({ ok: true, unchanged: true });
    expect(await bookedCount(pool)).toBe(1);
  });

  it("refuses a second slot for the same child and a taken slot for another child", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a, b] = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    expect(await bookSlot(db, { slotId: b, studentId: "s1", actor: parent(1) })).toEqual({ ok: false, code: "ALREADY_BOOKED" });
    expect(await bookSlot(db, { slotId: a, studentId: "s2", actor: parent(2) })).toEqual({ ok: false, code: "SLOT_TAKEN" });
  });

  it("only lets a parent act for their own child, and only with that child's teacher", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    const [other] = await slotsOf(pool, meetingId, "t2");
    expect(await bookSlot(db, { slotId: a, studentId: "s2", actor: parent(1) })).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(await bookSlot(db, { slotId: other, studentId: "s1", actor: parent(1) })).toEqual({ ok: false, code: "NOT_ALLOWED" });
    // The sibling in LKG A shares parent 1's number and can be booked with the LKG teacher.
    expect(await bookSlot(db, { slotId: other, studentId: "k1", actor: parent(1) })).toMatchObject({ ok: true });
    // Someone else's booking cannot be changed or cancelled.
    const mine = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    if (!mine.ok) throw new Error("setup");
    expect(await cancelBooking(db, { bookingId: mine.bookingId, actor: parent(2) })).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(await bookedCount(pool)).toBe(2);
  });

  it("enforces the booking window, pause, draft and cancelled states on the server", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    const tryBook = () => bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });

    await pool.query("update meetings set paused = true where id = $1", [meetingId]);
    expect(await tryBook()).toEqual({ ok: false, code: "PAUSED" });
    await pool.query("update meetings set paused = false, booking_opens_at = now() + interval '1 hour' where id = $1", [meetingId]);
    expect(await tryBook()).toEqual({ ok: false, code: "NOT_OPEN_YET" });
    await pool.query(
      "update meetings set booking_opens_at = now() - interval '2 hour', booking_closes_at = now() - interval '1 hour' where id = $1",
      [meetingId],
    );
    expect(await tryBook()).toEqual({ ok: false, code: "CLOSED" });
    // The office can still book after closing.
    expect(await bookSlot(db, { slotId: a, studentId: "s1", actor: admin })).toMatchObject({ ok: true });
    await pool.query("update meetings set status = 'draft' where id = $1", [meetingId]);
    expect(await bookSlot(db, { slotId: a, studentId: "s2", actor: admin })).toEqual({ ok: false, code: "NOT_FOUND" });
    await pool.query("update meetings set status = 'cancelled' where id = $1", [meetingId]);
    expect(await bookSlot(db, { slotId: a, studentId: "s2", actor: parent(2) })).toEqual({ ok: false, code: "MEETING_CANCELLED" });
  });

  it("refuses blocked slots, started slots, archived children and numbers removed from the roster", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a, b, c] = await slotsOf(pool, meetingId, "t1");
    await pool.query("update slots set state = 'blocked' where id = $1", [a]);
    expect(await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) })).toEqual({ ok: false, code: "SLOT_UNAVAILABLE" });
    // A slot that has already started cannot be booked by a parent, but the office can (walk-in).
    await pool.query("update slots set starts_at = now() - interval '5 minute', ends_at = now() + interval '5 minute' where id = $1", [b]);
    expect(await bookSlot(db, { slotId: b, studentId: "s1", actor: parent(1) })).toEqual({ ok: false, code: "SLOT_UNAVAILABLE" });
    expect(await bookSlot(db, { slotId: b, studentId: "s1", actor: admin })).toMatchObject({ ok: true });
    await pool.query("update students set archived_at = now() where id = 's2'");
    expect(await bookSlot(db, { slotId: c, studentId: "s2", actor: parent(2) })).toEqual({ ok: false, code: "NOT_ALLOWED" });
    await pool.query("delete from student_phones where student_id = 's3'");
    expect(await bookSlot(db, { slotId: c, studentId: "s3", actor: parent(3) })).toEqual({ ok: false, code: "NOT_ALLOWED" });
  });

  it("changes a slot atomically and keeps the original when the target is taken", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a, b, c] = await slotsOf(pool, meetingId, "t1");
    const mine = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    await bookSlot(db, { slotId: b, studentId: "s2", actor: parent(2) });
    if (!mine.ok) throw new Error("setup");
    expect(await changeSlot(db, { bookingId: mine.bookingId, newSlotId: b, actor: parent(1) })).toEqual({ ok: false, code: "SLOT_TAKEN" });
    let row = await pool.query("select slot_id, change_count from bookings where id = $1", [mine.bookingId]);
    expect(row.rows[0]).toEqual({ slot_id: a, change_count: 0 });
    expect(await changeSlot(db, { bookingId: mine.bookingId, newSlotId: c, actor: parent(1) })).toMatchObject({ ok: true, slotId: c });
    row = await pool.query("select slot_id, change_count from bookings where id = $1", [mine.bookingId]);
    expect(row.rows[0]).toEqual({ slot_id: c, change_count: 1 });
    // The old slot is free again.
    expect(await bookSlot(db, { slotId: a, studentId: "s3", actor: parent(3) })).toMatchObject({ ok: true });
  });

  it("caps parent changes and cancellations, but not the office's", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const s = await slotsOf(pool, meetingId, "t1");
    let b = await bookSlot(db, { slotId: s[0], studentId: "s1", actor: parent(1) });
    if (!b.ok) throw new Error("setup");
    expect((await changeSlot(db, { bookingId: b.bookingId, newSlotId: s[1], actor: parent(1), changeLimit: 3 })).ok).toBe(true);
    expect((await cancelBooking(db, { bookingId: b.bookingId, actor: parent(1), changeLimit: 3 })).ok).toBe(true);
    b = await bookSlot(db, { slotId: s[2], studentId: "s1", actor: parent(1) });
    if (!b.ok) throw new Error("setup");
    expect((await changeSlot(db, { bookingId: b.bookingId, newSlotId: s[3], actor: parent(1), changeLimit: 3 })).ok).toBe(true);
    expect(await changeSlot(db, { bookingId: b.bookingId, newSlotId: s[4], actor: parent(1), changeLimit: 3 })).toEqual({ ok: false, code: "CHANGE_LIMIT" });
    expect(await cancelBooking(db, { bookingId: b.bookingId, actor: parent(1), changeLimit: 3 })).toEqual({ ok: false, code: "CHANGE_LIMIT" });
    expect((await changeSlot(db, { bookingId: b.bookingId, newSlotId: s[4], actor: admin })).ok).toBe(true);
  });

  it("stops parents changing a locked booking", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a, b] = await slotsOf(pool, meetingId, "t1");
    const mine = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    if (!mine.ok) throw new Error("setup");
    await pool.query("update bookings set locked = true where id = $1", [mine.bookingId]);
    expect(await changeSlot(db, { bookingId: mine.bookingId, newSlotId: b, actor: parent(1) })).toEqual({ ok: false, code: "LOCKED" });
    expect(await cancelBooking(db, { bookingId: mine.bookingId, actor: parent(1) })).toEqual({ ok: false, code: "LOCKED" });
  });

  it("restores a cancelled booking only if the slot is still free", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    const mine = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    if (!mine.ok) throw new Error("setup");
    await cancelBooking(db, { bookingId: mine.bookingId, actor: admin, reason: "mistake" });
    expect(await restoreBooking(db, { bookingId: mine.bookingId, actor: admin })).toEqual({ ok: true });
    await cancelBooking(db, { bookingId: mine.bookingId, actor: admin });
    await bookSlot(db, { slotId: a, studentId: "s2", actor: parent(2) });
    expect(await restoreBooking(db, { bookingId: mine.bookingId, actor: admin })).toEqual({ ok: false, code: "SLOT_TAKEN" });
  });

  it("only marks attendance on or after the day, and only for the right teacher", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    const mine = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    if (!mine.ok) throw new Error("setup");
    const mark = (teacherId: string) =>
      setAttendance(db, { bookingId: mine.bookingId, attendance: "attended", teacherId, actor: { actorType: "teacher", actor: teacherId } });
    expect(await mark("t1")).toBe(false); // meeting is days away
    await pool.query("set constraints all deferred");
    await pool.query("update slots set starts_at = now() - interval '1 hour', ends_at = now() - interval '50 minute' where id = $1", [a]);
    expect(await mark("t2")).toBe(false);
    expect(await mark("t1")).toBe(true);
  });
});

describe("booking under concurrency", () => {
  it("lets exactly one of 50 children win one slot", async () => {
    await seedRoster(pool, 50);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => bookSlot(db, { slotId: a, studentId: `s${i + 1}`, actor: parent(i + 1) })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "SLOT_TAKEN")).toHaveLength(49);
    expect(await bookedCount(pool)).toBe(1);
  });

  it("gives one child exactly one slot when ten are requested at once", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const s = await slotsOf(pool, meetingId, "t1");
    const results = await Promise.all(s.slice(0, 10).map((slotId) => bookSlot(db, { slotId, studentId: "s1", actor: parent(1) })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === "ALREADY_BOOKED")).toBe(true);
    expect(await bookedCount(pool)).toBe(1);
  });

  it("treats twenty identical requests as one booking", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    const results = await Promise.all(Array.from({ length: 20 }, () => bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) })));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.map((r) => (r.ok ? r.bookingId : "")))).toHaveProperty("size", 1);
    expect(await bookedCount(pool)).toBe(1);
  });

  it("lets one of two simultaneous changes take the target; the loser keeps their slot", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a, b, c] = await slotsOf(pool, meetingId, "t1");
    const b1 = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    const b2 = await bookSlot(db, { slotId: b, studentId: "s2", actor: parent(2) });
    if (!b1.ok || !b2.ok) throw new Error("setup");
    const [r1, r2] = await Promise.all([
      changeSlot(db, { bookingId: b1.bookingId, newSlotId: c, actor: parent(1) }),
      changeSlot(db, { bookingId: b2.bookingId, newSlotId: c, actor: parent(2) }),
    ]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    const rows = await pool.query("select student_id, slot_id from bookings where status = 'booked' order by student_id");
    const slotsHeld = rows.rows.map((r) => r.slot_id);
    expect(new Set(slotsHeld).size).toBe(2);
    expect(slotsHeld).toContain(c);
  });

  it("never leaves two active bookings when change and cancel race", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a, b] = await slotsOf(pool, meetingId, "t1");
    for (let round = 0; round < 5; round++) {
      await pool.query("delete from bookings");
      const mine = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
      if (!mine.ok) throw new Error("setup");
      await Promise.all([
        changeSlot(db, { bookingId: mine.bookingId, newSlotId: b, actor: parent(1), changeLimit: 99 }),
        cancelBooking(db, { bookingId: mine.bookingId, actor: parent(1), changeLimit: 99 }),
      ]);
      expect(await bookedCount(pool)).toBeLessThanOrEqual(1);
      const row = await pool.query("select status from bookings where id = $1", [mine.bookingId]);
      expect(row.rows[0].status).toBe("cancelled");
    }
  });
});
