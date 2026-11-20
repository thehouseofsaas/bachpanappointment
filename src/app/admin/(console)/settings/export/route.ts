import ExcelJS from "exceljs";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { istDate } from "@/domain/time";
import { audit } from "@/lib/audit";
import { requireOwner } from "@/lib/authz";
import { clientIp } from "@/lib/request";

type Cell = string | number | boolean | null;

/** Timestamps as India wall-clock text, so the sheet reads the same on any computer. */
const when = (column: SQL) => sql`to_char(${column} at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')`;

/** Text that a spreadsheet could read as a formula is made plain text. */
function safe(value: Cell): string | number {
  if (value === null) return "";
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** One workbook with everything the school entered: owner only. */
export async function GET() {
  const owner = await requireOwner();
  const db = getDb();
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  async function sheet(name: string, headers: string[], query: SQL): Promise<number> {
    // Columns come back in the order they are selected, one per header.
    const res = await db.execute<Record<string, Cell>>(query);
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = headers.map((header) => ({ header, width: Math.max(12, header.length + 4) }));
    ws.getRow(1).font = { bold: true };
    for (const row of res.rows) ws.addRow(Object.values(row).map(safe));
    return res.rows.length;
  }

  const counts = {
    students: await sheet(
      "Students",
      ["Admission No", "Student Name", "Class", "Class Teacher", "Status", "Archived on", "Added on"],
      sql`select st.admission_no, st.name, cs.label, t.name as teacher,
            case when st.archived_at is null then 'Active' else 'Archived' end as status, ${when(sql`st.archived_at`)} as archived_on, ${when(sql`st.created_at`)} as added_on
          from students st join class_sections cs on cs.id = st.class_section_id
          left join teachers t on t.id = cs.teacher_id
          order by cs.sort_order, cs.label, st.name`,
    ),
    phones: await sheet(
      "Phones",
      ["Admission No", "Student Name", "Class", "Phone", "Whose"],
      sql`select st.admission_no, st.name, cs.label, p.phone, p.label as whose
          from student_phones p join students st on st.id = p.student_id
          join class_sections cs on cs.id = st.class_section_id
          order by cs.sort_order, cs.label, st.name, p.phone`,
    ),
    classes: await sheet(
      "Classes",
      ["Class", "Class Name", "Section", "Class Teacher", "Colour", "Badge", "Order", "Active", "Active Students"],
      sql`select cs.label, cs.class_name, cs.section, t.name as teacher, cs.color, cs.badge, cs.sort_order, cs.active,
            (select count(*) from students st where st.class_section_id = cs.id and st.archived_at is null)::int as students
          from class_sections cs left join teachers t on t.id = cs.teacher_id
          order by cs.sort_order, cs.label`,
    ),
    teachers: await sheet(
      "Teachers",
      ["Teacher", "Active", "Class Teacher Of"],
      sql`select t.name, t.active,
            (select string_agg(cs.label, ', ' order by cs.sort_order, cs.label) from class_sections cs where cs.teacher_id = t.id) as classes
          from teachers t order by t.name`,
    ),
    meetings: await sheet(
      "Meetings",
      ["Meeting", "Date", "Status", "Booking Opens", "Booking Closes", "Venue", "Slot Minutes", "Bookings", "Cancelled Bookings"],
      sql`select m.title, m.meeting_date::text, m.status, ${when(sql`m.booking_opens_at`)} as opens, ${when(sql`m.booking_closes_at`)} as closes, m.venue, m.slot_minutes,
            (select count(*) from bookings b where b.meeting_id = m.id and b.status = 'booked')::int as booked,
            (select count(*) from bookings b where b.meeting_id = m.id and b.status = 'cancelled')::int as cancelled
          from meetings m order by m.meeting_date, m.title`,
    ),
    bookings: await sheet(
      "Bookings",
      [
        "Meeting", "Date", "Time (India)", "Teacher", "Student Name", "Admission No", "Class", "Ref", "Status",
        "Cancelled By", "Reason", "Attendance", "Booked By", "Booked From Phone", "Booked On",
      ],
      sql`select m.title, m.meeting_date::text, to_char(sl.starts_at at time zone 'Asia/Kolkata', 'HH24:MI') as time, t.name as teacher, st.name as student, st.admission_no,
            b.class_label_snapshot, b.ref_code, b.status, b.cancelled_by, b.cancel_reason, b.attendance,
            case when b.source = 'admin' then 'Office' else 'Parent' end as source, b.booked_phone, ${when(sql`b.created_at`)} as booked_on
          from bookings b
          join meetings m on m.id = b.meeting_id
          join slots sl on sl.id = b.slot_id
          join teachers t on t.id = b.teacher_id
          join students st on st.id = b.student_id
          order by m.meeting_date, sl.starts_at, t.name`,
    ),
  };

  await audit(db, { actorType: "admin", actor: owner.id, action: "data.export", detail: counts, ip: await clientIp() });
  const body = await wb.xlsx.writeBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ptm-everything-${istDate(new Date())}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
