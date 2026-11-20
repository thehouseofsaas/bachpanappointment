// Applies a roster upload in one transaction: all of it or none of it.
import { sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { defaultLook } from "@/theme/tones";
import { cancelBySchool } from "../booking";
import { buildPreview, type ClassMapping, type Preview, type Snapshot } from "./diff";
import { CLASS_ORDER } from "./normalize-class";
import type { RawRow } from "./parse";

export async function loadSnapshot(db: DbOrTx): Promise<Snapshot> {
  const sections = await db.execute<{ id: string; key: string; label: string; teacher_id: string | null }>(
    sql`select id, key, label, teacher_id from class_sections`,
  );
  const aliases = await db.execute<{ alias_key: string; class_section_id: string }>(
    sql`select alias_key, class_section_id from class_aliases`,
  );
  const teachers = await db.execute<{ id: string; name: string; name_key: string }>(
    sql`select id, name, name_key from teachers`,
  );
  const students = await db.execute<{
    id: string;
    admission_no: string | null;
    name: string;
    name_key: string;
    class_section_id: string;
    archived: boolean;
    phones: string[] | null;
  }>(sql`
    select st.id, st.admission_no, st.name, st.name_key, st.class_section_id, st.archived_at is not null as archived,
           (select array_agg(p.phone) from student_phones p where p.student_id = st.id) as phones
    from students st`);
  const future = await db.execute<{ student_id: string }>(sql`
    select distinct b.student_id from bookings b join slots s on s.id = b.slot_id
    where b.status = 'booked' and s.starts_at > now()`);
  return {
    sections: sections.rows.map((s) => ({ id: s.id, key: s.key, label: s.label, teacherId: s.teacher_id })),
    aliases: aliases.rows.map((a) => ({ aliasKey: a.alias_key, classSectionId: a.class_section_id })),
    teachers: teachers.rows.map((t) => ({ id: t.id, name: t.name, nameKey: t.name_key })),
    students: students.rows.map((s) => ({
      id: s.id,
      admissionNo: s.admission_no,
      name: s.name,
      nameKey: s.name_key,
      classSectionId: s.class_section_id,
      archived: s.archived,
      phones: s.phones ?? [],
    })),
    studentsWithFutureBookings: future.rows.map((r) => r.student_id),
  };
}

export type ApplyOptions = {
  rows: RawRow[];
  mapping: ClassMapping;
  /** Import the good rows and leave rows with errors out. */
  skipErrors: boolean;
  /** The admin typed the confirmation for archiving more than 20% of a class. */
  confirmArchive: boolean;
  adminId: string;
  ip?: string | null;
  importId?: string;
};

export type ApplyResult = { ok: true; summary: Preview["counts"] & { bookingsCancelled: number } } | { ok: false; error: string };

class Stop extends Error {}

export async function applyImport(db: Db, o: ApplyOptions): Promise<ApplyResult> {
  try {
    return await db.transaction(async (tx) => {
      // One import at a time.
      await tx.execute(sql`select pg_advisory_xact_lock(74210001)`);
      if (o.importId) {
        // A double submit must not apply the same upload twice.
        const cur = await tx.execute<{ status: string }>(
          sql`select status from roster_imports where id = ${o.importId} for update`,
        );
        if (cur.rows[0]?.status !== "staged") throw new Stop("This upload was already applied or discarded.");
      }
      const snap = await loadSnapshot(tx);
      const preview = buildPreview(o.rows, snap, o.mapping);
      if (preview.blocking.length) throw new Stop(preview.blocking[0]);
      if (preview.counts.error > 0 && !o.skipErrors) {
        throw new Stop("Some rows have errors. Fix the file, or choose to leave those rows out.");
      }
      if (preview.guards.length > 0 && !o.confirmArchive) {
        throw new Stop("This upload would archive many children. Confirm it before applying.");
      }
      const actor = { actorType: "admin" as const, actor: o.adminId, ip: o.ip };

      // Classes
      const sectionId = new Map<string, string>(); // "new:<key>" -> id
      const existingCount = snap.sections.length;
      let created = 0;
      for (const nc of preview.newSections) {
        const id = newId();
        const look = defaultLook(existingCount + created);
        const order = CLASS_ORDER.indexOf(nc.className);
        const sortOrder = (order < 0 ? 50 : order) * 100 + (nc.section ? nc.section.charCodeAt(0) - 64 : 0);
        await tx.execute(sql`
          insert into class_sections (id, key, class_name, section, label, sort_order, color, badge)
          values (${id}, ${nc.key}, ${nc.className}, ${nc.section}, ${nc.label}, ${sortOrder}, ${look.color}, ${look.badge})`);
        sectionId.set(`new:${nc.key}`, id);
        created++;
      }
      for (const u of preview.unknownClasses) {
        if (u.mappedTo !== "new") {
          await tx.execute(sql`
            insert into class_aliases (alias_key, class_section_id) values (${u.key}, ${u.mappedTo})
            on conflict (alias_key) do update set class_section_id = excluded.class_section_id`);
        }
      }
      const ref = (r: string) => sectionId.get(r) ?? r;

      // Teachers
      const teacherId = new Map(snap.teachers.map((t) => [t.nameKey, t.id]));
      for (const t of preview.newTeachers) {
        const id = newId();
        await tx.execute(sql`insert into teachers (id, name, name_key) values (${id}, ${t.name}, ${t.key})`);
        teacherId.set(t.key, id);
      }
      for (const a of preview.teacherAssignments) {
        await tx.execute(sql`
          update class_sections set teacher_id = ${teacherId.get(a.teacherKey)!} where id = ${ref(a.sectionRef)}`);
      }

      // Students
      const moved: string[] = [];
      for (const row of preview.rows) {
        if (!row.data || row.action === "error") continue;
        const d = row.data;
        let id = row.studentId;
        if (row.action === "add") {
          id = newId();
          await tx.execute(sql`
            insert into students (id, admission_no, name, name_key, class_section_id)
            values (${id}, ${d.admissionNo}, ${d.name}, ${d.nameKey}, ${ref(d.sectionRef)})`);
        } else if (row.action !== "unchanged") {
          await tx.execute(sql`
            update students set name = ${d.name}, name_key = ${d.nameKey},
              admission_no = coalesce(${d.admissionNo}, admission_no),
              class_section_id = ${ref(d.sectionRef)}, archived_at = null, updated_at = now()
            where id = ${id!}`);
          if (row.action === "move") moved.push(id!);
        }
        if (row.action !== "unchanged") {
          await tx.execute(sql`delete from student_phones where student_id = ${id!}`);
          for (const p of d.phones) {
            await tx.execute(sql`
              insert into student_phones (student_id, phone, label) values (${id!}, ${p.phone}, ${p.label})`);
          }
        }
      }

      // Archive, and release bookings that no longer make sense.
      const archiveIds = preview.archive.map((a) => a.studentId);
      if (archiveIds.length) {
        await tx.execute(sql`update students set archived_at = now(), updated_at = now() where id in ${archiveIds}`);
      }
      const cancelledA = await cancelBySchool(tx, { studentIds: archiveIds, futureOnly: true }, "The child is no longer on the class list", actor);
      const cancelledM = await cancelBySchool(tx, { studentIds: moved, futureOnly: true }, "The child moved to another class", actor);

      const summary = { ...preview.counts, bookingsCancelled: cancelledA.length + cancelledM.length };
      if (o.importId) {
        await tx.execute(sql`
          update roster_imports set status = 'applied', applied_at = now(), summary = ${JSON.stringify(summary)}::jsonb
          where id = ${o.importId}`);
      }
      await audit(tx, { ...actor, action: "roster.import", entity: "roster_import", entityId: o.importId, detail: summary });
      return { ok: true as const, summary };
    });
  } catch (err) {
    if (err instanceof Stop) return { ok: false, error: err.message };
    throw err;
  }
}
