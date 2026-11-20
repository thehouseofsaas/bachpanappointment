import { describe, expect, it } from "vitest";
import { bookSlot } from "../../src/domain/booking";
import {
  addClass,
  addStudent,
  addTeacher,
  archiveStudent,
  regenerateTeacherLink,
  restoreStudent,
  updateClass,
  updateStudent,
  updateTeacher,
} from "../../src/domain/roster";
import { useTestDb } from "../helpers/db";
import { ADMIN, bookedCount, phoneFor, seedMeeting, seedRoster, slotsOf } from "../helpers/fixtures";

const { db, pool } = useTestDb();
const parent = (n: number) => ({ kind: "parent" as const, phone: phoneFor(n) });

const one = async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
  (await pool.query(text, params)).rows[0] as T;
const phonesOf = async (id: string) =>
  (await pool.query("select phone, label from student_phones where student_id = $1 order by phone", [id])).rows;
const auditActions = async () => (await pool.query("select action from audit_log order by id")).rows.map((r) => r.action);

describe("students", () => {
  it("adds a child with tidied name, admission number and normalized phones", async () => {
    await seedRoster(pool);
    const res = await addStudent(
      db,
      {
        name: "  Aarav   Singh ",
        admissionNo: " a 101 ",
        classSectionId: "c1",
        phones: [
          { phone: "98765 12345", label: "Father" },
          { phone: "" },
          { phone: "+91-98765-12345" }, // the same number again
          { phone: "09876500001", label: "Mother" },
        ],
      },
      ADMIN,
    );
    if (!res.ok) throw new Error(res.error);
    const st = await one("select name, name_key, admission_no, class_section_id, archived_at from students where id = $1", [res.id]);
    expect(st).toEqual({ name: "Aarav Singh", name_key: "aarav singh", admission_no: "A101", class_section_id: "c1", archived_at: null });
    expect(await phonesOf(res.id)).toEqual([
      { phone: "+919876500001", label: "Mother" },
      { phone: "+919876512345", label: "Father" },
    ]);
    expect(await auditActions()).toEqual(["student.add"]);
  });

  it("lets a child have no phone at all, but never more than four", async () => {
    await seedRoster(pool);
    const none = await addStudent(db, { name: "No Phone", classSectionId: "c1", phones: [] }, ADMIN);
    expect(none).toMatchObject({ ok: true });
    const five = await addStudent(
      db,
      { name: "Too Many", classSectionId: "c1", phones: [1, 2, 3, 4, 5].map((n) => ({ phone: `987650000${n}` })) },
      ADMIN,
    );
    expect(five).toEqual({ ok: false, error: "A child can have at most 4 phone numbers." });
  });

  it("rejects a bad phone with the reason and saves nothing", async () => {
    await seedRoster(pool);
    const before = await one<{ n: number }>("select count(*)::int as n from students");
    const res = await addStudent(db, { name: "Bad Phone", classSectionId: "c1", phones: [{ phone: "12345" }] }, ADMIN);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("too short");
    const edit = await updateStudent(db, "s1", { name: "Child 1", classSectionId: "c1", phones: [{ phone: "5123456789" }] }, ADMIN);
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.error).toContain("not a mobile number");
    expect(await one<{ n: number }>("select count(*)::int as n from students")).toEqual(before);
    expect(await phonesOf("s1")).toEqual([{ phone: phoneFor(1), label: null }]);
    expect(await auditActions()).toEqual([]);
  });

  it("refuses a duplicate admission number and names the child who has it", async () => {
    await seedRoster(pool);
    await pool.query("update students set admission_no = 'A7' where id = 's2'");
    const add = await addStudent(db, { name: "New Child", admissionNo: "a7", classSectionId: "c2", phones: [] }, ADMIN);
    expect(add.ok).toBe(false);
    if (!add.ok) expect(add.error).toContain("Admission no. A7 already belongs to Child 2 (Nursery A)");
    const edit = await updateStudent(db, "s1", { name: "Child 1", admissionNo: "A7", classSectionId: "c1", phones: [] }, ADMIN);
    expect(edit.ok).toBe(false);
    // Saving a child with their own number is fine.
    const same = await updateStudent(db, "s2", { name: "Child Two", admissionNo: "A7", classSectionId: "c1", phones: [] }, ADMIN);
    expect(same).toMatchObject({ ok: true, changed: ["name", "phones"] });
  });

  it("requires a name and an existing, active class", async () => {
    await seedRoster(pool);
    expect(await addStudent(db, { name: "  ", classSectionId: "c1", phones: [] }, ADMIN)).toMatchObject({ ok: false });
    expect(await addStudent(db, { name: "X", classSectionId: "nope", phones: [] }, ADMIN)).toEqual({ ok: false, error: "Choose a class." });
    await pool.query("insert into class_sections (id, key, class_name, label, active) values ('c9', 'OLD|', 'Old', 'Old', false)");
    const res = await addStudent(db, { name: "X", classSectionId: "c9", phones: [] }, ADMIN);
    expect(res).toEqual({ ok: false, error: "Old is not an active class. Choose another class." });
  });

  it("edits name and phones without touching the child's booking", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    const res = await updateStudent(
      db,
      "s1",
      { name: "Child One", classSectionId: "c1", phones: [{ phone: phoneFor(1) }, { phone: "9876500002", label: "Mother" }] },
      ADMIN,
    );
    expect(res).toMatchObject({ ok: true, changed: ["name", "phones"], moved: false, bookingsCancelled: 0 });
    expect(await bookedCount(pool)).toBe(1);
    expect(await phonesOf("s1")).toHaveLength(2);
    // Saving again with nothing different is a harmless no-op.
    const again = await updateStudent(
      db,
      "s1",
      { name: "Child One", classSectionId: "c1", phones: [{ phone: "9876500002", label: "Mother" }, { phone: phoneFor(1) }] },
      ADMIN,
    );
    expect(again).toMatchObject({ ok: true, changed: [] });
    expect((await auditActions()).filter((x) => x === "student.update")).toHaveLength(1);
  });

  it("moving a child to another class cancels their future booking and frees the slot", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    const booked = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    if (!booked.ok) throw new Error("setup");

    const res = await updateStudent(db, "s1", { name: "Child 1", classSectionId: "c2", phones: [{ phone: phoneFor(1) }] }, ADMIN);
    expect(res).toMatchObject({ ok: true, moved: true, bookingsCancelled: 1, changed: ["class"] });
    const b = await one("select status, cancelled_by, cancel_reason from bookings where id = $1", [booked.bookingId]);
    expect(b).toEqual({ status: "cancelled", cancelled_by: "school", cancel_reason: "The child moved to another class" });
    // The slot is free again for a classmate, and the child can book with the new class's teacher.
    expect(await bookSlot(db, { slotId: a, studentId: "s2", actor: parent(2) })).toMatchObject({ ok: true });
    const [other] = await slotsOf(pool, meetingId, "t2");
    expect(await bookSlot(db, { slotId: other, studentId: "s1", actor: parent(1) })).toMatchObject({ ok: true });
    expect(await auditActions()).toEqual(expect.arrayContaining(["booking.cancel_by_school", "student.update"]));
  });

  it("a class move leaves bookings for slots that already started alone", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    await pool.query("update slots set starts_at = now() - interval '1 hour', ends_at = now() - interval '50 minutes' where id = $1", [a]);
    const res = await updateStudent(db, "s1", { name: "Child 1", classSectionId: "c2", phones: [] }, ADMIN);
    expect(res).toMatchObject({ ok: true, moved: true, bookingsCancelled: 0 });
    expect(await bookedCount(pool)).toBe(1);
  });

  it("archiving cancels the future booking, frees the slot and signs the child out of booking", async () => {
    await seedRoster(pool);
    const { meetingId } = await seedMeeting(db);
    const [a, b] = await slotsOf(pool, meetingId, "t1");
    const booked = await bookSlot(db, { slotId: a, studentId: "s1", actor: parent(1) });
    if (!booked.ok) throw new Error("setup");

    const res = await archiveStudent(db, "s1", ADMIN);
    expect(res).toEqual({ ok: true, name: "Child 1", bookingsCancelled: 1 });
    const row = await one("select status, cancel_reason from bookings where id = $1", [booked.bookingId]);
    expect(row).toEqual({ status: "cancelled", cancel_reason: "The child is no longer on the class list" });
    expect(await bookSlot(db, { slotId: a, studentId: "s2", actor: parent(2) })).toMatchObject({ ok: true });
    expect(await bookSlot(db, { slotId: b, studentId: "s1", actor: parent(1) })).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(await archiveStudent(db, "s1", ADMIN)).toEqual({ ok: false, error: "Child 1 is already archived." });

    // Restoring brings the child back; the cancelled booking stays cancelled.
    expect(await restoreStudent(db, "s1", ADMIN)).toEqual({ ok: true, name: "Child 1" });
    expect(await bookSlot(db, { slotId: b, studentId: "s1", actor: parent(1) })).toMatchObject({ ok: true });
    expect(await restoreStudent(db, "s1", ADMIN)).toEqual({ ok: false, error: "Child 1 is not archived." });
    expect(await auditActions()).toEqual(expect.arrayContaining(["student.archive", "student.restore"]));
  });

  it("will not restore a child into a class that is no longer active", async () => {
    await seedRoster(pool);
    await pool.query("update students set archived_at = now() where class_section_id = 'c2'");
    await pool.query("update class_sections set active = false where id = 'c2'");
    const res = await restoreStudent(db, "k1", ADMIN);
    expect(res.ok).toBe(false);
    // Changing the class first makes it possible.
    expect(await updateStudent(db, "k1", { name: "Kid One", classSectionId: "c1", phones: [] }, ADMIN)).toMatchObject({ ok: true });
    expect(await restoreStudent(db, "k1", ADMIN)).toMatchObject({ ok: true });
  });
});

describe("classes", () => {
  it("adds a class with a normalized key and label, and the next default look", async () => {
    await seedRoster(pool);
    const res = await addClass(db, { className: "l.k.g", section: "b", teacherId: "t3" }, ADMIN);
    if (!res.ok) throw new Error(res.error);
    expect(res.label).toBe("LKG B");
    const c = await one("select key, class_name, section, label, color, badge, teacher_id, active from class_sections where id = $1", [res.id]);
    // Two classes existed, so this one takes the third look.
    expect(c).toEqual({ key: "LKG|B", class_name: "LKG", section: "B", label: "LKG B", color: "sky", badge: "elephant", teacher_id: "t3", active: true });
    expect(await auditActions()).toEqual(["class.add"]);
  });

  it("refuses a class that already exists under another spelling, or as an alias", async () => {
    await seedRoster(pool);
    expect(await addClass(db, { className: "Lower KG (A)" }, ADMIN)).toEqual({ ok: false, error: "LKG A already exists." });
    await pool.query("insert into class_aliases (alias_key, class_section_id) values ('TODDLERS|', 'c1')");
    const alias = await addClass(db, { className: "Toddlers" }, ADMIN);
    expect(alias).toEqual({ ok: false, error: '"Toddlers" is already known as another spelling of Nursery A.' });
    expect(await addClass(db, { className: "  " }, ADMIN)).toMatchObject({ ok: false });
  });

  it("updates label, teacher, colour, badge and order, and validates each", async () => {
    await seedRoster(pool);
    const res = await updateClass(db, "c1", { label: "Nursery Stars", teacherId: "t3", color: "grape", badge: "bee", sortOrder: 7 }, ADMIN);
    expect(res).toEqual({ ok: true, label: "Nursery Stars", changed: ["name", "class teacher", "colour", "badge", "order"] });
    const c = await one("select key, label, teacher_id, color, badge, sort_order from class_sections where id = 'c1'");
    expect(c).toEqual({ key: "NURSERY|A", label: "Nursery Stars", teacher_id: "t3", color: "grape", badge: "bee", sort_order: 7 });

    expect(await updateClass(db, "c1", { color: "pink" }, ADMIN)).toMatchObject({ ok: false });
    expect(await updateClass(db, "c1", { badge: "dragon" }, ADMIN)).toMatchObject({ ok: false });
    expect(await updateClass(db, "c1", { sortOrder: -1 }, ADMIN)).toMatchObject({ ok: false });
    expect(await updateClass(db, "c1", { label: "lkg a" }, ADMIN)).toEqual({ ok: false, error: "Another class is already called lkg a." });
    expect(await updateClass(db, "c1", { teacherId: "nobody" }, ADMIN)).toMatchObject({ ok: false });
    expect(await updateClass(db, "c1", { teacherId: null }, ADMIN)).toMatchObject({ ok: true, changed: ["class teacher"] });
    expect(await updateClass(db, "c1", { label: "Nursery Stars", sortOrder: 7 }, ADMIN)).toMatchObject({ ok: true, changed: [] });
  });

  it("refuses to deactivate a class that still has active students", async () => {
    await seedRoster(pool, 3);
    const res = await updateClass(db, "c1", { active: false }, ADMIN);
    expect(res).toEqual({
      ok: false,
      error: "Nursery A still has 3 active students. Move them to another class or archive them first.",
    });
    expect((await one<{ active: boolean }>("select active from class_sections where id = 'c1'")).active).toBe(true);
    for (const id of ["s1", "s2", "s3"]) await archiveStudent(db, id, ADMIN);
    expect(await updateClass(db, "c1", { active: false }, ADMIN)).toMatchObject({ ok: true, changed: ["made inactive"] });
    expect(await updateClass(db, "c1", { active: true }, ADMIN)).toMatchObject({ ok: true, changed: ["made active"] });
  });

  it("will not give a class to a teacher who is not active", async () => {
    await seedRoster(pool);
    await pool.query("update teachers set active = false where id = 't3'");
    expect(await updateClass(db, "c1", { teacherId: "t3" }, ADMIN)).toEqual({
      ok: false,
      error: "Ms Gill is not active. Choose another class teacher.",
    });
    expect(await addClass(db, { className: "UKG", teacherId: "t3" }, ADMIN)).toMatchObject({ ok: false });
  });
});

describe("teachers", () => {
  it("adds a teacher, and treats honorific variants as the same person", async () => {
    await seedRoster(pool);
    await pool.query("update teachers set name_key = 'kaur' where id = 't1'");
    const res = await addTeacher(db, "  Ms.  Bedi ", ADMIN);
    if (!res.ok) throw new Error(res.error);
    expect(await one("select name, name_key, active, link_version from teachers where id = $1", [res.id])).toEqual({
      name: "Ms. Bedi",
      name_key: "bedi",
      active: true,
      link_version: 1,
    });
    const dup = await addTeacher(db, "Mrs Kaur", ADMIN);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toContain("A teacher called Ms Kaur is already on the list");
    expect(await addTeacher(db, "Ms.", ADMIN)).toMatchObject({ ok: false });
    expect(await addTeacher(db, "", ADMIN)).toMatchObject({ ok: false });
  });

  it("renames a teacher and keeps the name unique", async () => {
    await seedRoster(pool);
    expect(await updateTeacher(db, "t3", { name: "Ms Gill-Sandhu" }, ADMIN)).toEqual({ ok: true, name: "Ms Gill-Sandhu", changed: ["name"] });
    expect((await one<{ name_key: string }>("select name_key from teachers where id = 't3'")).name_key).toBe("gill-sandhu");
    await pool.query("update teachers set name_key = 'kaur' where id = 't1'");
    expect(await updateTeacher(db, "t3", { name: "Mrs. Kaur" }, ADMIN)).toMatchObject({ ok: false });
    // Only the title changed: same person, allowed.
    expect(await updateTeacher(db, "t1", { name: "Mrs Kaur" }, ADMIN)).toMatchObject({ ok: true, changed: ["name"] });
  });

  it("refuses to deactivate a teacher who is class teacher of an active class", async () => {
    await seedRoster(pool);
    const res = await updateTeacher(db, "t1", { active: false }, ADMIN);
    expect(res).toEqual({ ok: false, error: "Ms Kaur is the class teacher of Nursery A. Choose another class teacher there first." });
    expect((await one<{ active: boolean }>("select active from teachers where id = 't1'")).active).toBe(true);
    // A teacher without a class can be deactivated, and so can one whose class got another teacher.
    expect(await updateTeacher(db, "t3", { active: false }, ADMIN)).toMatchObject({ ok: true, changed: ["made inactive"] });
    await updateTeacher(db, "t3", { active: true }, ADMIN);
    await updateClass(db, "c1", { teacherId: "t3" }, ADMIN);
    expect(await updateTeacher(db, "t1", { active: false }, ADMIN)).toMatchObject({ ok: true });
  });

  it("making a new schedule link bumps the link version", async () => {
    await seedRoster(pool);
    expect(await regenerateTeacherLink(db, "t1", ADMIN)).toEqual({ ok: true, name: "Ms Kaur", linkVersion: 2 });
    expect(await regenerateTeacherLink(db, "t1", ADMIN)).toMatchObject({ linkVersion: 3 });
    expect((await one<{ link_version: number }>("select link_version from teachers where id = 't2'")).link_version).toBe(1);
    expect(await regenerateTeacherLink(db, "missing", ADMIN)).toEqual({ ok: false, error: "That teacher no longer exists." });
    expect(await auditActions()).toEqual(["teacher.new_link", "teacher.new_link"]);
  });
});
