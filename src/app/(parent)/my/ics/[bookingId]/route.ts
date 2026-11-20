import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { currentParentPhone } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import { icsFile } from "@/lib/share";

/** Calendar file for one booking; only for a parent of that child. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/my/ics/[bookingId]">) {
  const { bookingId } = await ctx.params;
  const phone = await currentParentPhone();
  if (!phone) return new Response("Please sign in again.", { status: 401 });
  const db = getDb();
  const res = await db.execute<{
    ref_code: string;
    name: string;
    label: string;
    teacher: string;
    starts_at: Date;
    ends_at: Date;
    room: string | null;
    venue: string | null;
    title: string;
  }>(sql`
    select b.ref_code, st.name, cs.label, t.name as teacher, s.starts_at, s.ends_at, ms.room, m.venue, m.title
    from bookings b
    join slots s on s.id = b.slot_id
    join meeting_sessions ms on ms.id = s.session_id
    join meetings m on m.id = b.meeting_id
    join teachers t on t.id = b.teacher_id
    join students st on st.id = b.student_id
    join class_sections cs on cs.id = st.class_section_id
    where b.id = ${bookingId} and b.status = 'booked'
      and exists (select 1 from student_phones p where p.student_id = b.student_id and p.phone = ${phone})`);
  const b = res.rows[0];
  if (!b) return new Response("Booking not found.", { status: 404 });
  const settings = await getSettings(db);
  const body = icsFile(
    {
      childName: b.name.split(" ")[0],
      classLabel: b.label,
      teacherName: b.teacher,
      startsAt: new Date(b.starts_at),
      endsAt: new Date(b.ends_at),
      room: b.room,
      venue: b.venue,
      refCode: b.ref_code,
      schoolName: settings.schoolName,
      meetingTitle: b.title,
    },
    bookingId,
    new Date(),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="parent-teacher-meeting.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
