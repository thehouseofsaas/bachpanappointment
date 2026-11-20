// Hand edits to the roster from the admin console: one child, one class or
// one teacher at a time. (Whole-file uploads live in ./import.)
//
// Every function runs in one transaction that also writes its audit row, and
// answers { ok: true, ... } or { ok: false, error } with a message the office
// can read.
import { sql } from "drizzle-orm";
import { pgError, type Db, type Tx } from "@/db/client";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { BADGES, TONES, defaultLook } from "@/theme/tones";
import { cancelBySchool } from "./booking";
import { CLASS_ORDER, nameKey, normalizeClass, teacherKey, tidyAdmissionNo, tidyName } from "./import/normalize-class";
import { normalizePhone } from "./phone";

export type RosterActor = { adminId: string; ip?: string | null };
export type Fail = { ok: false; error: string };

export const MAX_PHONES = 4;
const MAX_NAME = 80;

export const MOVED_REASON = "The child moved to another class";
export const ARCHIVED_REASON = "The child is no longer on the class list";

export type PhoneInput = { phone: unknown; label?: string | null };

export type StudentInput = {
  name: string;
  admissionNo?: string | null;
  classSectionId: string;
  phones: PhoneInput[];
};

class Stop extends Error {}

const by = (a: RosterActor) => ({ actorType: "admin" as const, actor: a.adminId, ip: a.ip });

async function run<T extends { ok: true }>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T | Fail> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '5s'`);
      return fn(tx);
    });
  } catch (err) {
    if (err instanceof Stop) return { ok: false, error: err.message };
    const pg = pgError(err);
    if (pg?.code === "23505" && pg.constraint === "students_admission_no_key") {
      return { ok: false, error: "Another student already has that admission number." };
    }
    if (pg?.code === "23505" && pg.constraint === "class_sections_key_key") {
      return { ok: false, error: "That class already exists." };
    }
    if (pg?.code === "23505" && pg.constraint === "teachers_name_key_key") {
      return { ok: false, error: "A teacher with that name already exists." };
    }
    if (pg?.code === "55P03" || pg?.code === "40P01") {
      return { ok: false, error: "The system is busy with another change. Wait a moment and try again." };
    }
    throw err;
  }
}

// ------------------------------------------------------------- students

type CleanPhone = { phone: string; label: string | null };

/** Blank entries are dropped; anything else must be a real number. */
function cleanPhones(input: PhoneInput[]): { phones: CleanPhone[]; warnings: string[] } {
  const phones: CleanPhone[] = [];
  const warnings: string[] = [];
  for (const p of input) {
    if (p.phone === null || p.phone === undefined || String(p.phone).trim() === "") continue;
    const res = normalizePhone(p.phone);
    if (!res.ok) throw new Stop(`Check the phone number: ${res.error}`);
    if (phones.some((x) => x.phone === res.phone)) continue;
    if (res.warning) warnings.push(`${res.phone}: ${res.warning}`);
    phones.push({ phone: res.phone, label: tidyName(p.label ?? "").slice(0, 20) || null });
  }
  if (phones.length > MAX_PHONES) throw new Stop(`A child can have at most ${MAX_PHONES} phone numbers.`);
  return { phones, warnings };
}

function cleanName(raw: string, what: string): string {
  const name = tidyName(raw);
  if (!name) throw new Stop(`Enter the ${what}.`);
  if (name.length > MAX_NAME) throw new Stop(`That ${what} is too long (at most ${MAX_NAME} characters).`);
  return name;
}

function cleanAdmissionNo(raw: string | null | undefined): string | null {
  const v = tidyAdmissionNo(raw);
  if (v.length > 30) throw new Stop("That admission number is too long (at most 30 characters).");
  return v || null;
}

/** Says exactly who already holds an admission number. */
async function refuseAdmissionClash(tx: Tx, admissionNo: string | null, exceptId: string | null): Promise<void> {
  if (!admissionNo) return;
  const res = await tx.execute<{ name: string; label: string; archived: boolean }>(sql`
    select st.name, cs.label, st.archived_at is not null as archived
    from students st join class_sections cs on cs.id = st.class_section_id
    where st.admission_no = ${admissionNo} and st.id <> ${exceptId ?? ""}`);
  const clash = res.rows[0];
  if (!clash) return;
  throw new Stop(
    `Admission no. ${admissionNo} already belongs to ${clash.name} (${clash.label}${clash.archived ? ", archived" : ""}). ` +
      "Each child needs their own number.",
  );
}

/** Share-locks the class so it cannot be deactivated while a child is put into it. */
async function lockClass(tx: Tx, id: string): Promise<{ label: string; active: boolean } | null> {
  const res = await tx.execute<{ label: string; active: boolean }>(
    sql`select label, active from class_sections where id = ${id} for share`,
  );
  return res.rows[0] ?? null;
}

async function writePhones(tx: Tx, studentId: string, phones: CleanPhone[]): Promise<void> {
  await tx.execute(sql`delete from student_phones where student_id = ${studentId}`);
  for (const p of phones) {
    await tx.execute(sql`insert into student_phones (student_id, phone, label) values (${studentId}, ${p.phone}, ${p.label})`);
  }
}

export async function addStudent(
  db: Db,
  input: StudentInput,
  actor: RosterActor,
): Promise<{ ok: true; id: string; name: string; warnings: string[] } | Fail> {
  return run(db, async (tx) => {
    const name = cleanName(input.name, "child's name");
    const admissionNo = cleanAdmissionNo(input.admissionNo);
    const { phones, warnings } = cleanPhones(input.phones);
    const cls = await lockClass(tx, input.classSectionId);
    if (!cls) throw new Stop("Choose a class.");
    if (!cls.active) throw new Stop(`${cls.label} is not an active class. Choose another class.`);
    await refuseAdmissionClash(tx, admissionNo, null);
    const id = newId();
    await tx.execute(sql`
      insert into students (id, admission_no, name, name_key, class_section_id)
      values (${id}, ${admissionNo}, ${name}, ${nameKey(name)}, ${input.classSectionId})`);
    await writePhones(tx, id, phones);
    await audit(tx, {
      ...by(actor),
      action: "student.add",
      entity: "student",
      entityId: id,
      detail: { name, class: cls.label, admissionNo, phones: phones.length },
    });
    return { ok: true as const, id, name, warnings };
  });
}

export async function updateStudent(
  db: Db,
  id: string,
  input: StudentInput,
  actor: RosterActor,
): Promise<{ ok: true; changed: string[]; moved: boolean; bookingsCancelled: number; warnings: string[] } | Fail> {
  return run(db, async (tx) => {
    const cur = await tx.execute<{
      name: string;
      admission_no: string | null;
      class_section_id: string;
      label: string;
      archived: boolean;
    }>(sql`
      select st.name, st.admission_no, st.class_section_id, cs.label, st.archived_at is not null as archived
      from students st join class_sections cs on cs.id = st.class_section_id
      where st.id = ${id} for update of st`);
    const s = cur.rows[0];
    if (!s) throw new Stop("That student no longer exists.");

    const name = cleanName(input.name, "child's name");
    const admissionNo = cleanAdmissionNo(input.admissionNo);
    const { phones, warnings } = cleanPhones(input.phones);
    const moved = input.classSectionId !== s.class_section_id;
    let newLabel = s.label;
    if (moved) {
      const cls = await lockClass(tx, input.classSectionId);
      if (!cls) throw new Stop("Choose a class.");
      if (!cls.active) throw new Stop(`${cls.label} is not an active class. Choose another class.`);
      newLabel = cls.label;
    }
    await refuseAdmissionClash(tx, admissionNo, id);

    const before = await tx.execute<{ phone: string; label: string | null }>(
      sql`select phone, label from student_phones where student_id = ${id} order by phone`,
    );
    const sig = (list: Array<{ phone: string; label: string | null }>) =>
      list
        .map((p) => `${p.phone}|${p.label ?? ""}`)
        .sort()
        .join(",");

    const changed: string[] = [];
    if (name !== s.name) changed.push("name");
    if (admissionNo !== s.admission_no) changed.push("admission no.");
    if (moved) changed.push("class");
    if (sig(before.rows) !== sig(phones)) changed.push("phones");
    if (changed.length === 0) return { ok: true as const, changed, moved: false, bookingsCancelled: 0, warnings };

    await tx.execute(sql`
      update students set name = ${name}, name_key = ${nameKey(name)}, admission_no = ${admissionNo},
        class_section_id = ${input.classSectionId}, updated_at = now()
      where id = ${id}`);
    if (changed.includes("phones")) await writePhones(tx, id, phones);

    // A booking is with the old class's teacher, so it cannot follow the child.
    const cancelled = moved ? await cancelBySchool(tx, { studentIds: [id], futureOnly: true }, MOVED_REASON, by(actor)) : [];
    await audit(tx, {
      ...by(actor),
      action: "student.update",
      entity: "student",
      entityId: id,
      detail: {
        name,
        changed,
        ...(moved ? { from: s.label, to: newLabel, bookingsCancelled: cancelled.length } : {}),
      },
    });
    return { ok: true as const, changed, moved, bookingsCancelled: cancelled.length, warnings };
  });
}

export async function archiveStudent(
  db: Db,
  id: string,
  actor: RosterActor,
): Promise<{ ok: true; name: string; bookingsCancelled: number } | Fail> {
  return run(db, async (tx) => {
    const cur = await tx.execute<{ name: string; archived: boolean }>(
      sql`select name, archived_at is not null as archived from students where id = ${id} for update`,
    );
    const s = cur.rows[0];
    if (!s) throw new Stop("That student no longer exists.");
    if (s.archived) throw new Stop(`${s.name} is already archived.`);
    await tx.execute(sql`update students set archived_at = now(), updated_at = now() where id = ${id}`);
    const cancelled = await cancelBySchool(tx, { studentIds: [id], futureOnly: true }, ARCHIVED_REASON, by(actor));
    await audit(tx, {
      ...by(actor),
      action: "student.archive",
      entity: "student",
      entityId: id,
      detail: { name: s.name, bookingsCancelled: cancelled.length },
    });
    return { ok: true as const, name: s.name, bookingsCancelled: cancelled.length };
  });
}

export async function restoreStudent(db: Db, id: string, actor: RosterActor): Promise<{ ok: true; name: string } | Fail> {
  return run(db, async (tx) => {
    const cur = await tx.execute<{ name: string; archived: boolean; class_section_id: string }>(
      sql`select name, archived_at is not null as archived, class_section_id from students where id = ${id} for update`,
    );
    const s = cur.rows[0];
    if (!s) throw new Stop("That student no longer exists.");
    if (!s.archived) throw new Stop(`${s.name} is not archived.`);
    const cls = await lockClass(tx, s.class_section_id);
    if (!cls?.active) {
      throw new Stop(`${cls?.label ?? "The class"} is no longer an active class. Change ${s.name}'s class first, then restore.`);
    }
    await tx.execute(sql`update students set archived_at = null, updated_at = now() where id = ${id}`);
    await audit(tx, { ...by(actor), action: "student.restore", entity: "student", entityId: id, detail: { name: s.name } });
    return { ok: true as const, name: s.name };
  });
}

// -------------------------------------------------------------- classes

export type ClassPatch = {
  label?: string;
  teacherId?: string | null;
  color?: string;
  badge?: string;
  sortOrder?: number;
  active?: boolean;
};

/** Share-locks the teacher so they cannot be deactivated while being given a class. */
async function lockTeacher(tx: Tx, id: string): Promise<{ name: string; active: boolean } | null> {
  const res = await tx.execute<{ name: string; active: boolean }>(
    sql`select name, active from teachers where id = ${id} for share`,
  );
  return res.rows[0] ?? null;
}

export async function addClass(
  db: Db,
  input: { className: string; section?: string; teacherId?: string | null },
  actor: RosterActor,
): Promise<{ ok: true; id: string; label: string } | Fail> {
  return run(db, async (tx) => {
    // One at a time, so two new classes never get the same default look.
    await tx.execute(sql`select pg_advisory_xact_lock(74210003)`);
    const nc = normalizeClass(input.className, input.section ?? "");
    if (!nc) throw new Stop("Enter the class name, for example LKG.");
    if (nc.label.length > 40) throw new Stop("That class name is too long (at most 40 characters).");

    const dup = await tx.execute<{ label: string }>(sql`
      select label from class_sections where key = ${nc.key}
      union all
      select cs.label from class_aliases a join class_sections cs on cs.id = a.class_section_id where a.alias_key = ${nc.key}`);
    if (dup.rows[0]) {
      throw new Stop(
        dup.rows[0].label === nc.label
          ? `${nc.label} already exists.`
          : `"${nc.label}" is already known as another spelling of ${dup.rows[0].label}.`,
      );
    }
    const teacherId = input.teacherId || null;
    let teacherName: string | null = null;
    if (teacherId) {
      const t = await lockTeacher(tx, teacherId);
      if (!t) throw new Stop("That teacher no longer exists.");
      if (!t.active) throw new Stop(`${t.name} is not active. Choose another class teacher.`);
      teacherName = t.name;
    }
    const n = await tx.execute<{ n: number }>(sql`select count(*)::int as n from class_sections`);
    const look = defaultLook(n.rows[0].n);
    const order = CLASS_ORDER.indexOf(nc.className);
    const sortOrder = (order < 0 ? 50 : order) * 100 + (nc.section ? Math.max(0, Math.min(99, nc.section.charCodeAt(0) - 64)) : 0);
    const id = newId();
    await tx.execute(sql`
      insert into class_sections (id, key, class_name, section, label, sort_order, color, badge, teacher_id)
      values (${id}, ${nc.key}, ${nc.className}, ${nc.section}, ${nc.label}, ${sortOrder}, ${look.color}, ${look.badge}, ${teacherId})`);
    await audit(tx, {
      ...by(actor),
      action: "class.add",
      entity: "class",
      entityId: id,
      detail: { label: nc.label, teacher: teacherName },
    });
    return { ok: true as const, id, label: nc.label };
  });
}

export async function updateClass(
  db: Db,
  id: string,
  patch: ClassPatch,
  actor: RosterActor,
): Promise<{ ok: true; label: string; changed: string[] } | Fail> {
  return run(db, async (tx) => {
    const cur = await tx.execute<{
      label: string;
      teacher_id: string | null;
      color: string;
      badge: string;
      sort_order: number;
      active: boolean;
    }>(sql`select label, teacher_id, color, badge, sort_order, active from class_sections where id = ${id} for update`);
    const c = cur.rows[0];
    if (!c) throw new Stop("That class no longer exists.");

    const next = { ...c };
    const detail: Record<string, unknown> = {};
    const changed: string[] = [];

    if (patch.label !== undefined) {
      const label = tidyName(patch.label);
      if (!label) throw new Stop("Enter a name for the class.");
      if (label.length > 40) throw new Stop("That class name is too long (at most 40 characters).");
      if (label !== c.label) {
        const dup = await tx.execute(sql`select 1 from class_sections where lower(label) = lower(${label}) and id <> ${id}`);
        if (dup.rows.length > 0) throw new Stop(`Another class is already called ${label}.`);
        next.label = label;
        changed.push("name");
        detail.renamedFrom = c.label;
      }
    }
    if (patch.teacherId !== undefined) {
      const teacherId = patch.teacherId || null;
      if (teacherId !== c.teacher_id) {
        if (teacherId) {
          const t = await lockTeacher(tx, teacherId);
          if (!t) throw new Stop("That teacher no longer exists.");
          if (!t.active) throw new Stop(`${t.name} is not active. Choose another class teacher.`);
          detail.teacher = t.name;
        } else {
          detail.teacher = null;
        }
        next.teacher_id = teacherId;
        changed.push("class teacher");
      }
    }
    if (patch.color !== undefined && patch.color !== c.color) {
      if (!(TONES as readonly string[]).includes(patch.color)) throw new Stop("Choose a colour from the list.");
      next.color = patch.color;
      changed.push("colour");
    }
    if (patch.badge !== undefined && patch.badge !== c.badge) {
      if (!(BADGES as readonly string[]).includes(patch.badge)) throw new Stop("Choose a badge from the list.");
      next.badge = patch.badge;
      changed.push("badge");
    }
    if (patch.sortOrder !== undefined && patch.sortOrder !== c.sort_order) {
      if (!Number.isInteger(patch.sortOrder) || patch.sortOrder < 0 || patch.sortOrder > 9999) {
        throw new Stop("Order must be a whole number from 0 to 9999.");
      }
      next.sort_order = patch.sortOrder;
      changed.push("order");
    }
    if (patch.active !== undefined && patch.active !== c.active) {
      if (!patch.active) {
        const n = await tx.execute<{ n: number }>(
          sql`select count(*)::int as n from students where class_section_id = ${id} and archived_at is null`,
        );
        const count = n.rows[0].n;
        if (count > 0) {
          throw new Stop(
            `${c.label} still has ${count} active ${count === 1 ? "student" : "students"}. ` +
              "Move them to another class or archive them first.",
          );
        }
      }
      next.active = patch.active;
      changed.push(patch.active ? "made active" : "made inactive");
    }
    if (changed.length === 0) return { ok: true as const, label: c.label, changed };

    await tx.execute(sql`
      update class_sections set label = ${next.label}, teacher_id = ${next.teacher_id}, color = ${next.color},
        badge = ${next.badge}, sort_order = ${next.sort_order}, active = ${next.active}
      where id = ${id}`);
    await audit(tx, {
      ...by(actor),
      action: "class.update",
      entity: "class",
      entityId: id,
      detail: { label: next.label, changed, ...detail },
    });
    return { ok: true as const, label: next.label, changed };
  });
}

// ------------------------------------------------------------- teachers

function cleanTeacher(raw: string): { name: string; key: string } {
  const name = cleanName(raw, "teacher's name");
  const key = teacherKey(name);
  if (!key) throw new Stop('Enter the teacher\'s own name, not only a title like "Ms".');
  return { name, key };
}

async function refuseTeacherClash(tx: Tx, key: string, exceptId: string | null): Promise<void> {
  const res = await tx.execute<{ name: string; active: boolean }>(
    sql`select name, active from teachers where name_key = ${key} and id <> ${exceptId ?? ""}`,
  );
  const clash = res.rows[0];
  if (clash) {
    throw new Stop(
      `A teacher called ${clash.name} is already on the list${clash.active ? "" : " (not active — you can make them active again)"}.`,
    );
  }
}

export async function addTeacher(db: Db, rawName: string, actor: RosterActor): Promise<{ ok: true; id: string; name: string } | Fail> {
  return run(db, async (tx) => {
    const { name, key } = cleanTeacher(rawName);
    await refuseTeacherClash(tx, key, null);
    const id = newId();
    await tx.execute(sql`insert into teachers (id, name, name_key) values (${id}, ${name}, ${key})`);
    await audit(tx, { ...by(actor), action: "teacher.add", entity: "teacher", entityId: id, detail: { name } });
    return { ok: true as const, id, name };
  });
}

export async function updateTeacher(
  db: Db,
  id: string,
  patch: { name?: string; active?: boolean },
  actor: RosterActor,
): Promise<{ ok: true; name: string; changed: string[] } | Fail> {
  return run(db, async (tx) => {
    const cur = await tx.execute<{ name: string; name_key: string; active: boolean }>(
      sql`select name, name_key, active from teachers where id = ${id} for update`,
    );
    const t = cur.rows[0];
    if (!t) throw new Stop("That teacher no longer exists.");
    const next = { ...t };
    const changed: string[] = [];
    const detail: Record<string, unknown> = {};

    if (patch.name !== undefined) {
      const { name, key } = cleanTeacher(patch.name);
      if (name !== t.name) {
        if (key !== t.name_key) await refuseTeacherClash(tx, key, id);
        next.name = name;
        next.name_key = key;
        changed.push("name");
        detail.renamedFrom = t.name;
      }
    }
    if (patch.active !== undefined && patch.active !== t.active) {
      if (!patch.active) {
        const classes = await tx.execute<{ label: string }>(
          sql`select label from class_sections where teacher_id = ${id} and active order by sort_order, label`,
        );
        if (classes.rows.length > 0) {
          const labels = classes.rows.map((c) => c.label).join(", ");
          throw new Stop(`${t.name} is the class teacher of ${labels}. Choose another class teacher there first.`);
        }
      }
      next.active = patch.active;
      changed.push(patch.active ? "made active" : "made inactive");
    }
    if (changed.length === 0) return { ok: true as const, name: t.name, changed };

    await tx.execute(sql`update teachers set name = ${next.name}, name_key = ${next.name_key}, active = ${next.active} where id = ${id}`);
    await audit(tx, {
      ...by(actor),
      action: "teacher.update",
      entity: "teacher",
      entityId: id,
      detail: { name: next.name, changed, ...detail },
    });
    return { ok: true as const, name: next.name, changed };
  });
}

/** Makes every schedule link handed out so far stop working. */
export async function regenerateTeacherLink(
  db: Db,
  id: string,
  actor: RosterActor,
): Promise<{ ok: true; name: string; linkVersion: number } | Fail> {
  return run(db, async (tx) => {
    const res = await tx.execute<{ name: string; link_version: number }>(
      sql`update teachers set link_version = link_version + 1 where id = ${id} returning name, link_version`,
    );
    const t = res.rows[0];
    if (!t) throw new Stop("That teacher no longer exists.");
    await audit(tx, {
      ...by(actor),
      action: "teacher.new_link",
      entity: "teacher",
      entityId: id,
      detail: { name: t.name, linkVersion: t.link_version },
    });
    return { ok: true as const, name: t.name, linkVersion: t.link_version };
  });
}
