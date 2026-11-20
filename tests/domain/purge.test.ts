import { describe, expect, it } from "vitest";
import { bookSlot } from "../../src/domain/booking";
import { purgeMonths, purgeOldData, purgePreview } from "../../src/domain/purge";
import { useTestDb } from "../helpers/db";
import { ADMIN, phoneFor, seedMeeting, seedRoster, slotsOf } from "../helpers/fixtures";

const { db, pool } = useTestDb();
const admin = { kind: "admin" as const, adminId: ADMIN.adminId };

const count = async (table: string, where = "true") =>
  (await pool.query(`select count(*)::int as n from ${table} where ${where}`)).rows[0].n as number;

/** A published meeting with two bookings, then pushed `months` months into the past. */
async function oldMeeting(months: number) {
  const { meetingId } = await seedMeeting(db);
  const [a, b] = await slotsOf(pool, meetingId, "t1");
  for (const [slot, student] of [
    [a, "s1"],
    [b, "s2"],
  ]) {
    const res = await bookSlot(db, { slotId: slot, studentId: student, actor: admin });
    if (!res.ok) throw new Error(res.code);
  }
  const shift = `interval '${months} months' + interval '10 days'`;
  await pool.query(`update slots set starts_at = starts_at - ${shift}, ends_at = ends_at - ${shift} where meeting_id = $1`, [meetingId]);
  await pool.query(`update meeting_sessions set starts_at = starts_at - ${shift}, ends_at = ends_at - ${shift} where meeting_id = $1`, [meetingId]);
  await pool.query(
    `update meetings set meeting_date = (meeting_date - ${shift})::date,
       booking_opens_at = booking_opens_at - ${shift}, booking_closes_at = booking_closes_at - ${shift} where id = $1`,
    [meetingId],
  );
  return meetingId;
}

describe("clearing old data", () => {
  it("reads the number of months safely", () => {
    expect(purgeMonths("12")).toBe(12);
    expect(purgeMonths("3")).toBe(6);
    expect(purgeMonths("0")).toBe(6);
    expect(purgeMonths("9999")).toBe(120);
    expect(purgeMonths("abc")).toBe(12);
    expect(purgeMonths(undefined)).toBe(12);
    expect(purgeMonths("7.5")).toBe(12);
  });

  it("refuses fewer than six months", async () => {
    await seedRoster(pool);
    expect(await purgeOldData(db, 5, ADMIN)).toMatchObject({ ok: false });
    expect(await purgeOldData(db, 6.5, ADMIN)).toMatchObject({ ok: false });
    await expect(purgePreview(db, 2)).rejects.toThrow(RangeError);
    expect(await count("audit_log")).toBe(0);
  });

  it("removes old meetings with everything under them, and keeps recent ones whole", async () => {
    await seedRoster(pool);
    const old = await oldMeeting(13);
    const recent = await oldMeeting(7);
    const { meetingId: upcoming } = await seedMeeting(db, { daysAhead: 9 });
    const [u] = await slotsOf(pool, upcoming, "t1");
    await bookSlot(db, { slotId: u, studentId: "s1", actor: admin });
    await pool.query("delete from audit_log");

    const preview = await purgePreview(db, 12);
    expect(preview).toMatchObject({ meetings: 1, bookings: 2, slots: 24, auditRows: 0, students: 0 });
    // Looking changes nothing.
    expect(await count("meetings")).toBe(3);

    const res = await purgeOldData(db, 12, ADMIN);
    expect(res).toEqual({ ok: true, counts: preview });
    for (const table of ["meetings", "meeting_sessions", "session_sections", "slots", "bookings"]) {
      const col = table === "meetings" ? "id" : "meeting_id";
      expect(await count(table, `${col} = '${old}'`), table).toBe(0);
      expect(await count(table, `${col} = '${recent}'`), table).toBeGreaterThan(0);
      expect(await count(table, `${col} = '${upcoming}'`), table).toBeGreaterThan(0);
    }
    expect(await count("bookings")).toBe(3);
    expect(await count("students")).toBe(5);

    const log = (await pool.query("select actor_type, actor, action, detail from audit_log")).rows;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor_type: "admin", actor: "admin1", action: "data.purge", detail: { months: 12, meetings: 1, bookings: 2 } });

    // A shorter window now takes the seven-month-old meeting too.
    expect(await purgeOldData(db, 6, ADMIN)).toMatchObject({ ok: true, counts: { meetings: 1, bookings: 2 } });
    expect(await count("meetings")).toBe(1);
  });

  it("deletes long-archived children only once they have no bookings left", async () => {
    await seedRoster(pool);
    const old = await oldMeeting(13); // s1 and s2 have bookings in it
    const recent = await oldMeeting(7); // and in this one
    await pool.query("delete from bookings where meeting_id = $1 and student_id = 's2'", [recent]);
    await pool.query(`
      update students set archived_at = now() - interval '14 months' where id in ('s1', 's2', 'k1');
      update students set archived_at = now() - interval '2 months' where id = 'k2';`);

    // s2: only an old booking -> goes. k1: none -> goes. s1: still in the recent meeting -> stays.
    // k2: archived recently -> stays. s3: active -> stays.
    expect(await purgePreview(db, 12)).toMatchObject({ meetings: 1, students: 2 });
    const res = await purgeOldData(db, 12, ADMIN);
    expect(res).toMatchObject({ ok: true, counts: { meetings: 1, students: 2 } });
    const left = (await pool.query("select id from students order by id")).rows.map((r) => r.id);
    expect(left).toEqual(["k2", "s1", "s3"]);
    expect(await count("student_phones", "student_id in ('s2', 'k1')")).toBe(0);
    expect(await count("student_phones", `phone = '${phoneFor(1)}'`)).toBe(1);
    expect(await count("meetings", `id = '${old}'`)).toBe(0);
  });

  it("trims the activity log, uploaded files and sign-in counters by age", async () => {
    await seedRoster(pool);
    await pool.query(`
      insert into audit_log (at, actor_type, action) values
        (now() - interval '13 months', 'system', 'old.one'), (now() - interval '25 months', 'admin', 'old.two'),
        (now() - interval '11 months', 'system', 'keep.one'), (now(), 'admin', 'keep.two');
      insert into roster_imports (id, admin_id, filename, status, staged, created_at) values
        ('i1', 'admin1', 'old-applied.xlsx', 'applied', '{"rows":[{"name":"A"}]}', now() - interval '31 days'),
        ('i2', 'admin1', 'old-staged.xlsx', 'staged', '{"rows":[{"name":"B"}]}', now() - interval '40 days'),
        ('i3', 'admin1', 'new-staged.xlsx', 'staged', '{"rows":[{"name":"C"}]}', now() - interval '29 days'),
        ('i4', 'admin1', 'already-empty.xlsx', 'discarded', '{}', now() - interval '90 days');
      insert into rate_limits (key, window_start, count) values
        ('a', now() - interval '2 days', 3), ('b', now() - interval '25 hours', 1), ('c', now() - interval '1 hour', 2);`);

    const preview = await purgePreview(db, 12);
    expect(preview).toEqual({ meetings: 0, bookings: 0, slots: 0, auditRows: 2, students: 0, importPayloads: 2, rateLimits: 2 });
    expect(await purgeOldData(db, 12, ADMIN)).toEqual({ ok: true, counts: preview });

    const actions = (await pool.query("select action from audit_log order by at")).rows.map((r) => r.action);
    expect(actions).toEqual(["keep.one", "keep.two", "data.purge"]);
    const imports = (await pool.query("select id, status, staged from roster_imports order by id")).rows;
    expect(imports).toEqual([
      { id: "i1", status: "applied", staged: {} },
      { id: "i2", status: "discarded", staged: {} },
      { id: "i3", status: "staged", staged: { rows: [{ name: "C" }] } },
      { id: "i4", status: "discarded", staged: {} },
    ]);
    expect((await pool.query("select key from rate_limits")).rows).toEqual([{ key: "c" }]);

    // Running it again finds nothing more to do.
    expect(await purgeOldData(db, 12, ADMIN)).toMatchObject({
      ok: true,
      counts: { auditRows: 0, importPayloads: 0, rateLimits: 0 },
    });
  });
});
