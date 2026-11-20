// What a teacher sees through their private link: only their own sessions,
// children's names and times. No phone numbers.
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";

export type TeacherSlot = {
  id: string;
  startsAt: Date;
  state: "open" | "blocked";
  booking: { id: string; childName: string; classLabel: string; attendance: "pending" | "attended" | "no_show" } | null;
};

export type TeacherSession = {
  sessionId: string;
  meetingTitle: string;
  date: string;
  venue: string | null;
  room: string | null;
  cancelled: boolean;
  /** Attendance can be marked from the day itself. */
  canMark: boolean;
  slots: TeacherSlot[];
  notBooked: Array<{ name: string; classLabel: string }>;
};

export async function findTeacher(db: DbOrTx, teacherId: string) {
  const res = await db.execute<{ id: string; name: string; link_version: number; active: boolean }>(sql`
    select id, name, link_version, active from teachers where id = ${teacherId}`);
  return res.rows[0] ?? null;
}

/** Published meetings from a week ago onwards, soonest first. */
export async function teacherSessions(db: DbOrTx, teacherId: string): Promise<TeacherSession[]> {
  const ses = await db.execute<{
    id: string;
    meeting_id: string;
    title: string;
    day: string;
    venue: string | null;
    room: string | null;
    cancelled: boolean;
    can_mark: boolean;
  }>(sql`
    select ms.id, ms.meeting_id, m.title, (ms.starts_at at time zone 'Asia/Kolkata')::date::text as day, m.venue, ms.room,
           (ms.status = 'cancelled' or m.status = 'cancelled') as cancelled,
           (ms.starts_at at time zone 'Asia/Kolkata')::date <= (now() at time zone 'Asia/Kolkata')::date as can_mark
    from meeting_sessions ms join meetings m on m.id = ms.meeting_id
    where ms.teacher_id = ${teacherId} and m.status in ('published', 'cancelled')
      and ms.starts_at > now() - interval '8 days'
    order by ms.starts_at`);
  const out: TeacherSession[] = [];
  for (const s of ses.rows) {
    const slots = await db.execute<{
      id: string;
      starts_at: Date;
      state: "open" | "blocked";
      booking_id: string | null;
      name: string | null;
      label: string | null;
      attendance: "pending" | "attended" | "no_show" | null;
    }>(sql`
      select sl.id, sl.starts_at, sl.state, b.id as booking_id, st.name, cs.label, b.attendance
      from slots sl
      left join bookings b on b.slot_id = sl.id and b.status = 'booked'
      left join students st on st.id = b.student_id
      left join class_sections cs on cs.id = st.class_section_id
      where sl.session_id = ${s.id} and sl.state <> 'cancelled'
      order by sl.starts_at`);
    const missing = await db.execute<{ name: string; label: string }>(sql`
      select st.name, cs.label
      from session_sections ss
      join students st on st.class_section_id = ss.class_section_id and st.archived_at is null
      join class_sections cs on cs.id = st.class_section_id
      where ss.session_id = ${s.id}
        and not exists (select 1 from bookings b where b.meeting_id = ${s.meeting_id} and b.student_id = st.id and b.status = 'booked')
      order by cs.sort_order, st.name`);
    out.push({
      sessionId: s.id,
      meetingTitle: s.title,
      date: s.day,
      venue: s.venue,
      room: s.room,
      cancelled: s.cancelled,
      canMark: s.can_mark,
      slots: slots.rows.map((x) => ({
        id: x.id,
        startsAt: new Date(x.starts_at),
        state: x.state,
        booking: x.booking_id
          ? { id: x.booking_id, childName: x.name!, classLabel: x.label!, attendance: x.attendance ?? "pending" }
          : null,
      })),
      notBooked: missing.rows.map((r) => ({ name: r.name, classLabel: r.label })),
    });
  }
  return out;
}
