// Compares an uploaded roster with what is stored and says exactly what
// applying it would do. Pure: no database access, so it is easy to test and
// can be recomputed for the preview and again inside the apply transaction.
import { normalizePhone, splitPhoneCell } from "../phone";
import { nameKey, normalizeClass, teacherKey, tidyAdmissionNo, tidyName, type NormalClass } from "./normalize-class";
import type { RawRow } from "./parse";

export type Snapshot = {
  sections: Array<{ id: string; key: string; label: string; teacherId: string | null }>;
  aliases: Array<{ aliasKey: string; classSectionId: string }>;
  teachers: Array<{ id: string; name: string; nameKey: string }>;
  students: Array<{
    id: string;
    admissionNo: string | null;
    name: string;
    nameKey: string;
    classSectionId: string;
    archived: boolean;
    phones: string[];
  }>;
  /** Students who hold a booking for a slot that has not started yet. */
  studentsWithFutureBookings: string[];
};

/** For class names not seen before: an existing section id, or "new". */
export type ClassMapping = Record<string, string>;

export type RowAction = "add" | "update" | "move" | "restore" | "unchanged" | "error";

export type PreviewRow = {
  rowNumber: number;
  name: string;
  classLabel: string;
  action: RowAction;
  studentId?: string;
  changes: string[];
  warnings: string[];
  errors: string[];
  data?: {
    admissionNo: string | null;
    name: string;
    nameKey: string;
    /** Existing section id, or "new:<key>". */
    sectionRef: string;
    phones: Array<{ phone: string; label: string | null }>;
  };
};

export type Preview = {
  rows: PreviewRow[];
  /** Classes in the file that match nothing stored; the admin maps or creates them. */
  unknownClasses: Array<NormalClass & { rows: number; mappedTo: string }>;
  newSections: NormalClass[];
  newTeachers: Array<{ key: string; name: string }>;
  teacherAssignments: Array<{ sectionRef: string; label: string; teacherKey: string; teacherName: string; from: string | null }>;
  archive: Array<{ studentId: string; name: string; label: string }>;
  /** Sections where more than 20% of children would be archived. */
  guards: Array<{ label: string; archiving: number; of: number }>;
  bookingsToCancel: number;
  counts: Record<RowAction | "archive", number>;
  /** Problems that stop the whole import. */
  blocking: string[];
  warnings: string[];
};

const SHARED_PHONE_LIMIT = 3;

export function buildPreview(rows: RawRow[], snap: Snapshot, mapping: ClassMapping = {}): Preview {
  const sectionByKey = new Map(snap.sections.map((s) => [s.key, s]));
  const sectionById = new Map(snap.sections.map((s) => [s.id, s]));
  const aliasTo = new Map(snap.aliases.map((a) => [a.aliasKey, a.classSectionId]));
  const teacherByKey = new Map(snap.teachers.map((t) => [t.nameKey, t]));
  const teacherById = new Map(snap.teachers.map((t) => [t.id, t]));

  const blocking: string[] = [];
  const warnings: string[] = [];
  const unknown = new Map<string, NormalClass & { rows: number; mappedTo: string }>();
  const newSections = new Map<string, NormalClass>();

  /** Resolves a file class to an existing section id or "new:<key>". */
  function resolve(nc: NormalClass): string {
    const direct = sectionByKey.get(nc.key);
    if (direct) return direct.id;
    const alias = aliasTo.get(nc.key);
    if (alias && sectionById.has(alias)) return alias;
    const mapped = mapping[nc.key];
    const entry = unknown.get(nc.key) ?? { ...nc, rows: 0, mappedTo: "new" };
    entry.rows++;
    if (mapped && mapped !== "new" && sectionById.has(mapped)) {
      entry.mappedTo = mapped;
      unknown.set(nc.key, entry);
      return mapped;
    }
    unknown.set(nc.key, entry);
    newSections.set(nc.key, nc);
    return `new:${nc.key}`;
  }

  const labelOf = (ref: string) =>
    ref.startsWith("new:") ? (newSections.get(ref.slice(4))?.label ?? ref) : (sectionById.get(ref)?.label ?? ref);

  // ---- pass 1: read and validate each row
  type Work = PreviewRow & { sectionRef?: string; teacherRaw?: string };
  const work: Work[] = [];
  const seenAdmission = new Map<string, number>();
  const phoneUse = new Map<string, Set<string>>(); // phone -> child identities

  for (const r of rows) {
    const name = tidyName(r.name);
    const nc = normalizeClass(r.className, r.section);
    const row: Work = {
      rowNumber: r.rowNumber,
      name: name || "(no name)",
      classLabel: nc?.label ?? String(r.className ?? "").trim(),
      action: "error",
      changes: [],
      warnings: [],
      errors: [],
    };
    if (!name) row.errors.push("Student name is missing.");
    if (!nc) row.errors.push("Class is missing.");

    const admissionNo = tidyAdmissionNo(r.admissionNo) || null;
    if (admissionNo) {
      const prev = seenAdmission.get(admissionNo);
      if (prev) row.errors.push(`Admission no. ${admissionNo} is also on row ${prev}.`);
      else seenAdmission.set(admissionNo, r.rowNumber);
    }

    const phones: Array<{ phone: string; label: string | null }> = [];
    for (const cell of r.phones) {
      for (const part of splitPhoneCell(cell.value)) {
        const p = normalizePhone(part);
        if (!p.ok) {
          row.warnings.push(`Phone ignored: ${p.error}`);
          continue;
        }
        if (p.warning) row.warnings.push(`${p.phone}: ${p.warning}`);
        if (!phones.some((x) => x.phone === p.phone)) phones.push({ phone: p.phone, label: cell.label || null });
      }
    }
    if (phones.length === 0 && row.errors.length === 0) {
      row.warnings.push("No usable phone number: this parent cannot book online. The office can book for them.");
    }

    if (row.errors.length === 0 && nc) {
      const sectionRef = resolve(nc);
      row.sectionRef = sectionRef;
      row.classLabel = labelOf(sectionRef);
      row.teacherRaw = tidyName(r.teacher);
      row.data = { admissionNo, name, nameKey: nameKey(name), sectionRef, phones };
      const identity = admissionNo ?? `${nameKey(name)}@${sectionRef}`;
      for (const p of phones) {
        if (!phoneUse.has(p.phone)) phoneUse.set(p.phone, new Set());
        phoneUse.get(p.phone)!.add(identity);
      }
    }
    work.push(row);
  }

  // ---- class teachers: every section must agree on one
  const teacherAssignments: Preview["teacherAssignments"] = [];
  const newTeachers = new Map<string, string>();
  const bySection = new Map<string, Work[]>();
  for (const w of work) if (w.sectionRef) bySection.set(w.sectionRef, [...(bySection.get(w.sectionRef) ?? []), w]);
  for (const [ref, list] of bySection) {
    const named = new Map<string, { name: string; rows: number[] }>();
    for (const w of list) {
      if (!w.teacherRaw) continue;
      const k = teacherKey(w.teacherRaw);
      if (!k) continue;
      const e = named.get(k) ?? { name: w.teacherRaw, rows: [] };
      e.rows.push(w.rowNumber);
      named.set(k, e);
    }
    const label = labelOf(ref);
    const current = ref.startsWith("new:") ? null : (sectionById.get(ref)?.teacherId ?? null);
    if (named.size > 1) {
      const parts = [...named.values()].map((n) => `"${n.name}" (row ${n.rows[0]}${n.rows.length > 1 ? " and others" : ""})`);
      blocking.push(`${label} lists more than one class teacher: ${parts.join(", ")}. Each class needs exactly one.`);
      continue;
    }
    if (named.size === 0) {
      if (!current) warnings.push(`${label} has no class teacher yet. Set one under Classes before creating a meeting.`);
      continue;
    }
    const [k, v] = [...named.entries()][0];
    const existing = teacherByKey.get(k);
    if (!existing) newTeachers.set(k, v.name);
    if (!existing || existing.id !== current) {
      teacherAssignments.push({
        sectionRef: ref,
        label,
        teacherKey: k,
        teacherName: existing?.name ?? v.name,
        from: current ? (teacherById.get(current)?.name ?? null) : null,
      });
    }
  }

  // ---- pass 2: match rows to stored students
  const used = new Set<string>();
  const byAdmission = new Map<string, Snapshot["students"][number]>();
  for (const s of snap.students) if (s.admissionNo) byAdmission.set(s.admissionNo, s);
  const active = snap.students.filter((s) => !s.archived);

  const compatible = (s: Snapshot["students"][number], admissionNo: string | null) =>
    !used.has(s.id) && !(admissionNo && s.admissionNo && s.admissionNo !== admissionNo);

  // Admission numbers first, so a name match can never steal a child that a later row identifies exactly.
  for (const w of work) {
    if (!w.data?.admissionNo) continue;
    const s = byAdmission.get(w.data.admissionNo);
    if (s && !used.has(s.id)) {
      w.studentId = s.id;
      used.add(s.id);
    }
  }
  for (const w of work) {
    if (!w.data || w.studentId) continue;
    const d = w.data;
    let s = active.find((x) => x.classSectionId === d.sectionRef && x.nameKey === d.nameKey && compatible(x, d.admissionNo));
    if (!s && d.phones.length) {
      s = active.find(
        (x) => x.nameKey === d.nameKey && compatible(x, d.admissionNo) && x.phones.some((p) => d.phones.some((q) => q.phone === p)),
      );
    }
    if (s) {
      w.studentId = s.id;
      used.add(s.id);
    }
  }

  const studentById = new Map(snap.students.map((s) => [s.id, s]));
  const moved: string[] = [];
  const duplicateNames = new Map<string, number>();
  for (const w of work) {
    if (!w.data) continue;
    const k = `${w.data.nameKey}@${w.data.sectionRef}`;
    duplicateNames.set(k, (duplicateNames.get(k) ?? 0) + 1);
  }

  for (const w of work) {
    if (!w.data) continue;
    const d = w.data;
    if ((duplicateNames.get(`${d.nameKey}@${d.sectionRef}`) ?? 0) > 1 && !d.admissionNo) {
      w.warnings.push("Another child in this class has the same name. Add admission numbers to tell them apart.");
    }
    for (const p of d.phones) {
      const n = phoneUse.get(p.phone)?.size ?? 0;
      if (n > SHARED_PHONE_LIMIT) {
        w.warnings.push(`${p.phone} is on ${n} children. Whoever has this number can see and book for all of them.`);
      }
    }
    if (!w.studentId) {
      w.action = "add";
      continue;
    }
    const s = studentById.get(w.studentId)!;
    if (s.name !== d.name) w.changes.push(`Name: ${s.name} → ${d.name}`);
    if ((s.admissionNo ?? null) !== d.admissionNo && d.admissionNo) w.changes.push(`Admission no.: ${s.admissionNo ?? "none"} → ${d.admissionNo}`);
    const before = [...s.phones].sort();
    const after = d.phones.map((p) => p.phone).sort();
    const added = after.filter((p) => !before.includes(p));
    const removed = before.filter((p) => !after.includes(p));
    if (added.length) w.changes.push(`Phone added: ${added.join(", ")}`);
    if (removed.length) w.changes.push(`Phone removed: ${removed.join(", ")}`);
    const sectionChanged = s.classSectionId !== d.sectionRef;
    if (sectionChanged) w.changes.push(`Class: ${sectionById.get(s.classSectionId)?.label ?? "?"} → ${labelOf(d.sectionRef)}`);
    if (s.archived) {
      w.action = "restore";
      w.changes.unshift("Was archived; will be active again.");
    } else if (sectionChanged) {
      w.action = "move";
      moved.push(s.id);
    } else {
      w.action = w.changes.length ? "update" : "unchanged";
    }
  }

  // ---- archive: children missing from a section the file covers completely
  const sectionsWithErrors = new Set<string>();
  for (const w of work) {
    if (w.errors.length === 0) continue;
    const nc = normalizeClass(rows.find((r) => r.rowNumber === w.rowNumber)?.className, rows.find((r) => r.rowNumber === w.rowNumber)?.section);
    if (nc) {
      // Same resolution as resolve(): stored key, saved alias, or the admin's mapping.
      const mapped = mapping[nc.key];
      const id = sectionByKey.get(nc.key)?.id ?? aliasTo.get(nc.key) ?? (mapped && mapped !== "new" ? mapped : undefined);
      if (id) sectionsWithErrors.add(id);
    }
  }
  const covered = new Set([...bySection.keys()].filter((ref) => !ref.startsWith("new:")));
  const archive: Preview["archive"] = [];
  const guards: Preview["guards"] = [];
  for (const ref of covered) {
    const label = labelOf(ref);
    if (sectionsWithErrors.has(ref)) {
      warnings.push(`${label} has rows with errors, so nobody in it will be archived by this upload.`);
      continue;
    }
    const current = active.filter((s) => s.classSectionId === ref);
    const missing = current.filter((s) => !used.has(s.id));
    for (const s of missing) archive.push({ studentId: s.id, name: s.name, label });
    if (current.length > 0 && missing.length / current.length > 0.2) {
      guards.push({ label, archiving: missing.length, of: current.length });
    }
  }

  const future = new Set(snap.studentsWithFutureBookings);
  const bookingsToCancel = [...archive.map((a) => a.studentId), ...moved].filter((id) => future.has(id)).length;

  const counts: Preview["counts"] = { add: 0, update: 0, move: 0, restore: 0, unchanged: 0, error: 0, archive: archive.length };
  for (const w of work) {
    if (w.errors.length) w.action = "error";
    counts[w.action]++;
  }
  if (work.length > 0 && counts.error === work.length) blocking.push("Every row has an error. Nothing can be imported from this file.");

  return {
    rows: work.map((w) => {
      const row: PreviewRow = { ...w };
      delete (row as Work).sectionRef;
      delete (row as Work).teacherRaw;
      return row;
    }),
    unknownClasses: [...unknown.values()],
    newSections: [...newSections.values()],
    newTeachers: [...newTeachers.entries()].map(([key, name]) => ({ key, name })),
    teacherAssignments,
    archive,
    guards,
    bookingsToCancel,
    counts,
    blocking,
    warnings,
  };
}
