import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import type { SectionOption } from "@/components/admin/meeting-form";

export async function sectionOptions(db: DbOrTx): Promise<SectionOption[]> {
  const res = await db.execute<{ id: string; label: string; teacher: string | null; children: number }>(sql`
    select cs.id, cs.label, t.name as teacher,
           (select count(*)::int from students st where st.class_section_id = cs.id and st.archived_at is null) as children
    from class_sections cs left join teachers t on t.id = cs.teacher_id
    where cs.active order by cs.sort_order, cs.label`);
  return res.rows;
}
