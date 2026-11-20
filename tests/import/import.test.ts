import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { bookSlot } from "../../src/domain/booking";
import { applyImport, loadSnapshot } from "../../src/domain/import/apply";
import { buildPreview } from "../../src/domain/import/diff";
import { normalizeClass, teacherKey } from "../../src/domain/import/normalize-class";
import { parseRosterFile, type RawRow } from "../../src/domain/import/parse";
import { useTestDb } from "../helpers/db";
import { ADMIN, bookedCount, phoneFor, seedMeeting, seedRoster, slotsOf } from "../helpers/fixtures";

const { db, pool } = useTestDb();

async function xlsx(rows: unknown[][], sheetName = "Students"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEAD = ["Admission No", "Student Name", "Class", "Section", "Class Teacher", "Parent Phone 1", "Parent Phone 2"];

async function parse(rows: unknown[][]): Promise<RawRow[]> {
  const r = await parseRosterFile(await xlsx(rows), "roster.xlsx");
  if (!r.ok) throw new Error(r.error);
  return r.rows;
}

const apply = (rows: RawRow[], extra: Partial<Parameters<typeof applyImport>[1]> = {}) =>
  applyImport(db, { rows, mapping: {}, skipErrors: false, confirmArchive: false, adminId: ADMIN.adminId, ...extra });

describe("normalizing classes and teacher names", () => {
  it("treats spelling variants as one class", () => {
    const keys = ["LKG B", "L.K.G-B", "lkg (b)", "Lower KG B", "KG1 B"].map((c) => normalizeClass(c, "")?.key);
    expect(new Set(keys)).toEqual(new Set(["LKG|B"]));
    expect(normalizeClass("L.K.G", "b")).toMatchObject({ key: "LKG|B", label: "LKG B" });
    expect(normalizeClass("Nur", "")).toMatchObject({ key: "NURSERY|", label: "Nursery" });
    expect(normalizeClass("Play Group", "A")?.label).toBe("Playgroup A");
    expect(normalizeClass("Class Toddlers", "")?.label).toBe("Toddlers");
    expect(normalizeClass("", "A")).toBeNull();
  });
  it("ignores honorifics and dots in teacher names", () => {
    expect(new Set(["Ms. Kaur", "Mrs Kaur", "kaur ma'am", " KAUR "].map(teacherKey))).toEqual(new Set(["kaur"]));
  });
});

describe("reading spreadsheets", () => {
  it("finds the header below a title row, keeps numeric phones exact, and ignores extra columns and blank rows", async () => {
    const rows = await parse([
      ["Bachpan Play School — Class List 2026-27"],
      [],
      ["S.No", "Adm. No.", "Name of Student", "Class", "Sec", "Class Teacher", "Father Mobile", "Mother's Mobile No.", "Bus"],
      [1, 101, "Aarav Singh", "Nursery", "A", "Ms. Kaur", 9876512345, "98765-00000", "R1"],
      [],
      [2, 102, "Meher Gill", "Nursery", "A", "Ms. Kaur", "9876512399 / 9876512388", "", ""],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rowNumber: 4, admissionNo: 101, name: "Aarav Singh", className: "Nursery", section: "A" });
    expect(rows[0].phones).toEqual([
      { label: "Father", value: 9876512345 },
      { label: "Mother", value: "98765-00000" },
    ]);
    expect(rows[1].rowNumber).toBe(6);
  });

  it("reads CSV with a byte-order mark", async () => {
    const csv = "﻿Student Name,Class,Section,Parent Phone 1\nਹਰਲੀਨ ਕੌਰ,LKG,A,9876512345\n";
    const r = await parseRosterFile(Buffer.from(csv, "utf8"), "roster.csv");
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.rows[0].name).toBe("ਹਰਲੀਨ ਕੌਰ");
  });

  it("explains unusable files", async () => {
    expect(await parseRosterFile(Buffer.alloc(0), "a.xlsx")).toMatchObject({ ok: false, error: expect.stringMatching(/empty/) });
    expect(await parseRosterFile(Buffer.from("x"), "a.xls")).toMatchObject({ ok: false, error: expect.stringMatching(/\.xlsx/) });
    expect(await parseRosterFile(Buffer.from("x"), "a.pdf")).toMatchObject({ ok: false });
    expect(await parseRosterFile(Buffer.from("not a zip"), "a.xlsx")).toMatchObject({ ok: false, error: expect.stringMatching(/could not be read/) });
    expect(await parseRosterFile(await xlsx([["Roll", "Marks"], [1, 2]]), "a.xlsx")).toMatchObject({ ok: false, error: expect.stringMatching(/header/) });
    expect(await parseRosterFile(await xlsx([["Student Name", "Class"], ["A", "LKG"]]), "a.xlsx")).toMatchObject({
      ok: false, error: expect.stringMatching(/Parent Phone/),
    });
    expect(await parseRosterFile(await xlsx([HEAD]), "a.xlsx")).toMatchObject({ ok: false, error: expect.stringMatching(/no student rows/) });
  });
});

describe("previewing and applying a roster", () => {
  const first = [
    HEAD,
    ["A1", "Aarav Singh", "Nursery", "A", "Ms. Kaur", 9876500001, ""],
    ["A2", "Meher Gill", "Nursery", "A", "Ms Kaur", "+91 98765 00002", "98765-00003"],
    ["A3", "Kabir Sandhu", "L.K.G", "A", "Mrs. Sharma", "09876500004", ""],
    ["A4", "Noor Sandhu", "UKG", "", "Mrs. Sharma", "9876500004", ""],
  ];

  it("creates classes, teachers, students and phones on first upload; a second identical upload changes nothing", async () => {
    await pool.query("insert into admin_users (id, name, username, password_hash) values ('admin1', 'Office', 'office', 'x')");
    const rows = await parse(first);
    const preview = buildPreview(rows, await loadSnapshot(db));
    expect(preview.counts).toMatchObject({ add: 4, error: 0, archive: 0 });
    expect(preview.newSections.map((s) => s.label).sort()).toEqual(["LKG A", "Nursery A", "UKG"]);
    expect(preview.newTeachers.map((t) => t.key).sort()).toEqual(["kaur", "sharma"]);
    expect(await apply(rows)).toMatchObject({ ok: true });

    const secs = await pool.query("select label, (select name from teachers t where t.id = teacher_id) as teacher from class_sections order by sort_order");
    expect(secs.rows).toEqual([
      { label: "Nursery A", teacher: "Ms. Kaur" },
      { label: "LKG A", teacher: "Mrs. Sharma" },
      { label: "UKG", teacher: "Mrs. Sharma" },
    ]);
    const phones = await pool.query("select phone from student_phones p join students s on s.id = p.student_id where s.admission_no = 'A2' order by phone");
    expect(phones.rows.map((r) => r.phone)).toEqual(["+919876500002", "+919876500003"]);

    const again = buildPreview(rows, await loadSnapshot(db));
    expect(again.counts).toMatchObject({ add: 0, update: 0, move: 0, unchanged: 4, archive: 0 });
    expect(again.newSections).toEqual([]);
    expect(await apply(rows)).toMatchObject({ ok: true });
    expect((await pool.query("select count(*)::int as n from students")).rows[0].n).toBe(4);
  });

  it("treats the file as the truth only for the classes it contains", async () => {
    await pool.query("insert into admin_users (id, name, username, password_hash) values ('admin1', 'Office', 'office', 'x')");
    await apply(await parse(first));
    // Upload Nursery A alone: one renamed, one phone changed, one new child. LKG and UKG are untouched.
    const rows = await parse([
      HEAD,
      ["A1", "Aarav Singh Gill", "Nursery", "A", "Ms. Kaur", 9876500001, ""],
      ["A2", "Meher Gill", "Nursery", "A", "Ms. Kaur", "9876500002", ""],
      ["A5", "Zoya Khan", "Nursery", "A", "Ms. Kaur", "9876500005", ""],
    ]);
    const p = buildPreview(rows, await loadSnapshot(db));
    expect(p.counts).toMatchObject({ add: 1, update: 2, unchanged: 0, archive: 0 });
    expect(p.rows[0].changes).toEqual(["Name: Aarav Singh → Aarav Singh Gill"]);
    expect(p.rows[1].changes).toEqual(["Phone removed: +919876500003"]);
    await apply(rows);
    const active = await pool.query("select count(*)::int as n from students where archived_at is null");
    expect(active.rows[0].n).toBe(5);
  });

  it("proposes archiving children missing from a class, guards large removals, and cancels their future bookings", async () => {
    await seedRoster(pool, 5); // Nursery A: s1..s5 (no admission numbers), LKG A: k1, k2
    const { meetingId } = await seedMeeting(db);
    const [a, b] = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: a, studentId: "s1", actor: { kind: "parent", phone: phoneFor(1) } });
    await bookSlot(db, { slotId: b, studentId: "s5", actor: { kind: "parent", phone: phoneFor(5) } });
    const rows = await parse([
      HEAD,
      ["", "Child 1", "Nursery", "A", "", phoneFor(1), ""],
      ["", "Child 2", "Nursery", "A", "", phoneFor(2), ""],
      ["", "Child 3", "Nursery", "A", "", phoneFor(3), ""],
    ]);
    const p = buildPreview(rows, await loadSnapshot(db));
    expect(p.archive.map((x) => x.name).sort()).toEqual(["Child 4", "Child 5"]);
    expect(p.guards).toEqual([{ label: "Nursery A", archiving: 2, of: 5 }]);
    expect(p.bookingsToCancel).toBe(1);
    expect(await apply(rows)).toMatchObject({ ok: false, error: expect.stringMatching(/archive many children/) });
    expect(await apply(rows, { confirmArchive: true })).toMatchObject({ ok: true, summary: { archive: 2, bookingsCancelled: 1 } });
    expect(await bookedCount(pool)).toBe(1);
    const lkg = await pool.query("select count(*)::int as n from students where class_section_id = 'c2' and archived_at is null");
    expect(lkg.rows[0].n).toBe(2); // LKG A was not in the file
    // An archived child's parent can no longer book.
    const c = (await slotsOf(pool, meetingId, "t1"))[3];
    expect(await bookSlot(db, { slotId: c, studentId: "s4", actor: { kind: "parent", phone: phoneFor(4) } })).toEqual({ ok: false, code: "NOT_ALLOWED" });
  });

  it("detects a child who moved class (by name and shared phone) and cancels the booking with the old teacher", async () => {
    await seedRoster(pool, 3);
    const { meetingId } = await seedMeeting(db);
    const [a] = await slotsOf(pool, meetingId, "t1");
    await bookSlot(db, { slotId: a, studentId: "s2", actor: { kind: "parent", phone: phoneFor(2) } });
    const rows = await parse([
      HEAD,
      ["", "Kid One", "LKG", "A", "", "9811111111", ""],
      ["", "Kid Two", "LKG", "A", "", "9822222222", ""],
      ["", "Child 2", "LKG", "A", "", phoneFor(2), ""],
    ]);
    const p = buildPreview(rows, await loadSnapshot(db));
    expect(p.counts).toMatchObject({ move: 1, add: 0 });
    expect(p.rows[2]).toMatchObject({ action: "move", studentId: "s2" });
    expect(p.bookingsToCancel).toBe(1);
    await apply(rows);
    expect(await bookedCount(pool)).toBe(0);
    const s2 = await pool.query("select class_section_id from students where id = 's2'");
    expect(s2.rows[0].class_section_id).toBe("c2");
    // They can now book with the new class's teacher.
    const [l] = await slotsOf(pool, meetingId, "t2");
    expect(await bookSlot(db, { slotId: l, studentId: "s2", actor: { kind: "parent", phone: phoneFor(2) } })).toMatchObject({ ok: true });
  });

  it("flags bad rows and bad phones, and only imports good rows when told to", async () => {
    await pool.query("insert into admin_users (id, name, username, password_hash) values ('admin1', 'Office', 'office', 'x')");
    const rows = await parse([
      HEAD,
      ["B1", "Good Child", "Nursery", "A", "Ms Kaur", "9876500001", ""],
      ["B1", "Duplicate Number", "Nursery", "A", "Ms Kaur", "9876500002", ""],
      ["B3", "", "Nursery", "A", "Ms Kaur", "9876500003", ""],
      ["B4", "No Class", "", "", "", "9876500004", ""],
      ["B5", "Bad Phone", "Nursery", "A", "Ms Kaur", "12345", "9.87651E+09"],
      ["B6", "Placeholder", "Nursery", "A", "Ms Kaur", "9999999999", ""],
    ]);
    const p = buildPreview(rows, await loadSnapshot(db));
    expect(p.counts).toMatchObject({ add: 3, error: 3 });
    expect(p.rows[1].errors[0]).toMatch(/also on row 2/);
    expect(p.rows[2].errors[0]).toMatch(/name is missing/);
    expect(p.rows[3].errors[0]).toMatch(/Class is missing/);
    expect(p.rows[4].warnings.join(" ")).toMatch(/too short/);
    expect(p.rows[4].warnings.join(" ")).toMatch(/lost digits/);
    expect(p.rows[4].warnings.join(" ")).toMatch(/cannot book online/);
    expect(p.rows[5].warnings.join(" ")).toMatch(/placeholder/);
    expect(await apply(rows)).toMatchObject({ ok: false, error: expect.stringMatching(/errors/) });
    expect(await apply(rows, { skipErrors: true })).toMatchObject({ ok: true, summary: { add: 3 } });
    expect((await pool.query("select count(*)::int as n from students")).rows[0].n).toBe(3);
  });

  it("blocks a class that lists two teachers, and warns about a number shared by many children", async () => {
    const rows = await parse([
      HEAD,
      ["", "One", "Nursery", "A", "Ms Kaur", "9876500009", ""],
      ["", "Two", "Nursery", "A", "Ms Gill", "9876500009", ""],
      ["", "Three", "Nursery", "A", "", "9876500009", ""],
      ["", "Four", "Nursery", "A", "", "9876500009", ""],
    ]);
    const p = buildPreview(rows, await loadSnapshot(db));
    expect(p.blocking[0]).toMatch(/more than one class teacher/);
    expect(p.rows[0].warnings.join(" ")).toMatch(/is on 4 children/);
    expect(await apply(rows)).toMatchObject({ ok: false });
    expect((await pool.query("select count(*)::int as n from students")).rows[0].n).toBe(0);
  });

  it("maps an unknown class name to an existing class and remembers it", async () => {
    await seedRoster(pool, 1);
    const rows = await parse([HEAD, ["", "Child 1", "Sunflowers", "", "", phoneFor(1), ""], ["", "New Kid", "Sunflowers", "", "", "9876500077", ""]]);
    const p1 = buildPreview(rows, await loadSnapshot(db));
    expect(p1.unknownClasses).toMatchObject([{ label: "Sunflowers", rows: 2, mappedTo: "new" }]);
    const mapping = { [p1.unknownClasses[0].key]: "c1" };
    const p2 = buildPreview(rows, await loadSnapshot(db), mapping);
    expect(p2.newSections).toEqual([]);
    expect(p2.counts).toMatchObject({ unchanged: 1, add: 1 });
    await apply(rows, { mapping });
    const p3 = buildPreview(rows, await loadSnapshot(db)); // no mapping needed any more
    expect(p3.unknownClasses).toEqual([]);
    expect(p3.counts).toMatchObject({ unchanged: 2 });
  });

  it("never archives from a class that has error rows, even when the class was matched by the admin's mapping", async () => {
    await seedRoster(pool, 3);
    const rows = await parse([HEAD, ["", "Child 1", "Sunflowers", "", "", phoneFor(1), ""], ["", "", "Sunflowers", "", "", "9876500077", ""]]);
    const key = buildPreview(rows, await loadSnapshot(db)).unknownClasses[0].key;
    const p = buildPreview(rows, await loadSnapshot(db), { [key]: "c1" });
    expect(p.counts.error).toBe(1);
    expect(p.archive).toEqual([]);
    expect(p.warnings.join(" ")).toMatch(/nobody in it will be archived/);
  });

  it("applies a staged upload only once", async () => {
    await pool.query("insert into admin_users (id, name, username, password_hash) values ('admin1', 'Office', 'office', 'x')");
    const rows = await parse(first);
    await pool.query("insert into roster_imports (id, admin_id, filename, staged) values ('imp1', 'admin1', 'a.xlsx', '{}')");
    expect(await apply(rows, { importId: "imp1" })).toMatchObject({ ok: true });
    expect(await apply(rows, { importId: "imp1" })).toMatchObject({ ok: false, error: expect.stringMatching(/already applied/) });
  });

  it("restores an archived child who reappears with the same admission number", async () => {
    await pool.query("insert into admin_users (id, name, username, password_hash) values ('admin1', 'Office', 'office', 'x')");
    await apply(await parse(first));
    await pool.query("update students set archived_at = now() where admission_no = 'A1'");
    const rows = await parse([HEAD, ["A1", "Aarav Singh", "UKG", "", "Mrs. Sharma", 9876500001, ""], ["A4", "Noor Sandhu", "UKG", "", "Mrs. Sharma", "9876500004", ""]]);
    const p = buildPreview(rows, await loadSnapshot(db));
    expect(p.rows[0].action).toBe("restore");
    await apply(rows);
    const s = await pool.query("select archived_at, (select label from class_sections c where c.id = class_section_id) as label from students where admission_no = 'A1'");
    expect(s.rows[0]).toEqual({ archived_at: null, label: "UKG" });
  });
});
