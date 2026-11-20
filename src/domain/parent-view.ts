// Read models for the parent pages. Everything a parent sees is scoped by
// their phone number here, in one place.
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";

export type MeetingPhase = "not_open" | "open" | "paused" | "closed" | "cancelled";

export type MeetingView = {
  id: string;
  slug: string;
  title: string;
  date: string;
  venue: string | null;
  parentNote: string | null;
  opensAt: Date;
  closesAt: Date;
  phase: MeetingPhase;
  pausedMessage: string | null;
  cancelMessage: string | null;
  dateChanged: boolean;
};

/** Published (or cancelled) meetings that have not passed yet, soonest first. */
export async function currentMeetings(db: DbOrTx): Promise<MeetingView[]> {
  const res = await db.execute<{
    id: string;
    slug: string;
    title: string;
    meeting_date: string;
    venue: string | null;
    parent_note: string | null;
    booking_opens_at: Date;
    booking_closes_at: Date;
    status: string;
    paused: boolean;
    paused_message: string | null;
    cancel_message: string | null;
    date_changed: boolean;
    opened: boolean;
    still_open: boolean;
  }>(sql`
    select id, slug, title, meeting_date::text, venue, parent_note, booking_opens_at, booking_closes_at,
           status, paused, paused_message, cancel_message, date_changed_at is not null as date_changed,
           booking_opens_at <= now() as opened, booking_closes_at > now() as still_open
    from meetings
    where status in ('published', 'cancelled')
      and meeting_date >= (now() at time zone 'Asia/Kolkata')::date
    order by meeting_date, created_at`);
  return res.rows.map((m) => ({
    id: m.id,
    slug: m.slug,
    title: m.title,
    date: m.meeting_date,
    venue: m.venue,
    parentNote: m.parent_note,
    opensAt: new Date(m.booking_opens_at),
    closesAt: new Date(m.booking_closes_at),
    phase:
      m.status === "cancelled"
        ? "cancelled"
        : !m.opened
          ? "not_open"
          : !m.still_open
            ? "closed"
            : m.paused
              ? "paused"
              : "open",
    pausedMessage: m.paused_message,
    cancelMessage: m.cancel_message,
    dateChanged: m.date_changed,
  }));
}

export type SlotView = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  hint?: { kind: "clash" | "after" | "before"; name: string };
};

export type ChildMeetingView = {
  meeting: MeetingView;
  session: { id: string; room: string | null; teacherName: string; active: boolean } | null;
  booking: {
    id: string;
    refCode: string;
    slotId: string;
    startsAt: Date;
    endsAt: Date;
    locked: boolean;
    lastChangedBy: string | null;
    dateChanged: boolean;
  } | null;
  /** Set when the school cancelled the child's last booking and none replaced it. */
  schoolCancelReason: string | null;
  movesLeft: number;
  slots: SlotView[];
};

export type ChildView = {
  id: string;
  name: string;
  firstName: string;
  classLabel: string;
  color: string;
  badge: string;
  meetings: ChildMeetingView[];
};

export async function parentHome(db: DbOrTx, phone: string, changeLimit: number): Promise<ChildView[]> {
  const kids = await db.execute<{
    id: string;
    name: string;
    section_id: string;
    label: string;
    color: string;
    badge: string;
  }>(sql`
    select st.id, st.name, cs.id as section_id, cs.label, cs.color, cs.badge
    from student_phones p
    join students st on st.id = p.student_id
    join class_sections cs on cs.id = st.class_section_id
    where p.phone = ${phone} and st.archived_at is null
    order by cs.sort_order, cs.label, st.name`);
  if (kids.rows.length === 0) return [];

  const meetings = await currentMeetings(db);
  const firstNames = kids.rows.map((k) => k.name.split(" ")[0]);
  const display = (i: number) =>
    firstNames.filter((f) => f === firstNames[i]).length > 1 ? kids.rows[i].name : firstNames[i];

  if (meetings.length === 0) {
    return kids.rows.map((k, i) => ({
      id: k.id,
      name: k.name,
      firstName: display(i),
      classLabel: k.label,
      color: k.color,
      badge: k.badge,
      meetings: [],
    }));
  }

  const meetingIds = meetings.map((m) => m.id);
  const sectionIds = [...new Set(kids.rows.map((k) => k.section_id))];
  const studentIds = kids.rows.map((k) => k.id);

  const sessions = await db.execute<{
    meeting_id: string;
    class_section_id: string;
    id: string;
    room: string | null;
    status: string;
    teacher: string;
  }>(sql`
    select ss.meeting_id, ss.class_section_id, ms.id, ms.room, ms.status, t.name as teacher
    from session_sections ss
    join meeting_sessions ms on ms.id = ss.session_id
    join teachers t on t.id = ms.teacher_id
    where ss.meeting_id in ${meetingIds} and ss.class_section_id in ${sectionIds}`);

  const bookings = await db.execute<{
    id: string;
    ref_code: string;
    slot_id: string;
    meeting_id: string;
    student_id: string;
    status: string;
    cancelled_by: string | null;
    cancel_reason: string | null;
    locked: boolean;
    last_changed_by: string | null;
    change_count: number;
    time_changed: boolean;
    starts_at: Date;
    ends_at: Date;
    updated_at: Date;
  }>(sql`
    select b.id, b.ref_code, b.slot_id, b.meeting_id, b.student_id, b.status, b.cancelled_by, b.cancel_reason,
           b.locked, b.last_changed_by, b.change_count, b.time_changed_at is not null as time_changed,
           s.starts_at, s.ends_at, b.updated_at
    from bookings b join slots s on s.id = b.slot_id
    where b.student_id in ${studentIds} and b.meeting_id in ${meetingIds}
    order by b.updated_at`);

  const sessionIds = [...new Set(sessions.rows.map((s) => s.id))];
  const free = sessionIds.length
    ? await db.execute<{ id: string; session_id: string; starts_at: Date; ends_at: Date }>(sql`
        select s.id, s.session_id, s.starts_at, s.ends_at
        from slots s
        where s.session_id in ${sessionIds} and s.state = 'open' and s.starts_at > now()
          and not exists (select 1 from bookings b where b.slot_id = s.id and b.status = 'booked')
        order by s.starts_at`)
    : { rows: [] };

  return kids.rows.map((k, i) => {
    const views: ChildMeetingView[] = [];
    for (const m of meetings) {
      const ses = sessions.rows.find((s) => s.meeting_id === m.id && s.class_section_id === k.section_id);
      if (!ses) continue; // this class is not part of the meeting
      const mine = bookings.rows.filter((b) => b.meeting_id === m.id && b.student_id === k.id);
      const active = mine.find((b) => b.status === "booked");
      const lastCancelled = [...mine].reverse().find((b) => b.status === "cancelled");
      const moves =
        mine.reduce((n, b) => n + Number(b.change_count), 0) +
        mine.filter((b) => b.status === "cancelled" && b.cancelled_by === "parent").length;

      // Other children of this parent in the same meeting, for clash / back-to-back hints.
      const siblings = bookings.rows
        .filter((b) => b.meeting_id === m.id && b.student_id !== k.id && b.status === "booked")
        .map((b) => ({
          name: display(kids.rows.findIndex((x) => x.id === b.student_id)),
          start: new Date(b.starts_at).getTime(),
          end: new Date(b.ends_at).getTime(),
        }));

      const slots: SlotView[] = free.rows
        .filter((s) => s.session_id === ses.id)
        .map((s) => {
          const start = new Date(s.starts_at).getTime();
          const end = new Date(s.ends_at).getTime();
          let hint: SlotView["hint"];
          for (const sib of siblings) {
            if (start < sib.end && end > sib.start) hint = { kind: "clash", name: sib.name };
            else if (!hint && start >= sib.end && start - sib.end <= 10 * 60_000) hint = { kind: "after", name: sib.name };
            else if (!hint && end <= sib.start && sib.start - end <= 10 * 60_000) hint = { kind: "before", name: sib.name };
          }
          return { id: s.id, startsAt: new Date(s.starts_at), endsAt: new Date(s.ends_at), hint };
        });

      views.push({
        meeting: m,
        session: { id: ses.id, room: ses.room, teacherName: ses.teacher, active: ses.status === "active" },
        booking: active
          ? {
              id: active.id,
              refCode: active.ref_code,
              slotId: active.slot_id,
              startsAt: new Date(active.starts_at),
              endsAt: new Date(active.ends_at),
              locked: active.locked,
              lastChangedBy: active.last_changed_by,
              dateChanged: active.time_changed,
            }
          : null,
        schoolCancelReason:
          !active && lastCancelled?.cancelled_by === "school" ? (lastCancelled.cancel_reason ?? "by the school") : null,
        movesLeft: Math.max(0, changeLimit - moves),
        slots,
      });
    }
    return {
      id: k.id,
      name: k.name,
      firstName: display(i),
      classLabel: k.label,
      color: k.color,
      badge: k.badge,
      meetings: views,
    };
  });
}
