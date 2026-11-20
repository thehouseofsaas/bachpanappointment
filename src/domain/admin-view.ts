// Read models for the office: meeting lists, the live meeting view, exports.
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import type { MeetingPhase } from "./parent-view";

export type AdminPhase = MeetingPhase | "draft" | "past";

export type MeetingSummary = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "cancelled";
  date: string;
  opensAt: Date;
  closesAt: Date;
  paused: boolean;
  phase: AdminPhase;
  children: number;
  booked: number;
  openSlots: number;
};

function phaseOf(r: { status: string; paused: boolean; opened: boolean; still_open: boolean; past: boolean }): AdminPhase {
  if (r.status === "draft") return "draft";
  if (r.status === "cancelled") return "cancelled";
  if (r.past) return "past";
  if (!r.opened) return "not_open";
  if (!r.still_open) return "closed";
  return r.paused ? "paused" : "open";
}

export const PHASE_LABEL: Record<AdminPhase, string> = {
  draft: "Draft",
  not_open: "Published · booking not open yet",
  open: "Booking open",
  paused: "Booking paused",
  closed: "Booking closed",
  cancelled: "Cancelled",
  past: "Finished",
};

export async function listMeetings(db: DbOrTx): Promise<MeetingSummary[]> {
  const res = await db.execute<{
    id: string;
    slug: string;
    title: string;
    status: "draft" | "published" | "cancelled";
    meeting_date: string;
    booking_opens_at: Date;
    booking_closes_at: Date;
    paused: boolean;
    opened: boolean;
    still_open: boolean;
    past: boolean;
    children: number;
    booked: number;
    open_slots: number;
  }>(sql`
    select m.id, m.slug, m.title, m.status, m.meeting_date::text, m.booking_opens_at, m.booking_closes_at, m.paused,
      m.booking_opens_at <= now() as opened, m.booking_closes_at > now() as still_open,
      m.meeting_date < (now() at time zone 'Asia/Kolkata')::date as past,
      (select count(*)::int from students st join session_sections ss on ss.class_section_id = st.class_section_id
         join meeting_sessions ms on ms.id = ss.session_id
        where ss.meeting_id = m.id and st.archived_at is null and ms.status = 'active') as children,
      (select count(*)::int from bookings b where b.meeting_id = m.id and b.status = 'booked') as booked,
      (select count(*)::int from slots s join meeting_sessions ms on ms.id = s.session_id
        where s.meeting_id = m.id and s.state = 'open' and ms.status = 'active') as open_slots
    from meetings m
    order by m.meeting_date desc, m.created_at desc`);
  return res.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status,
    date: r.meeting_date,
    opensAt: new Date(r.booking_opens_at),
    closesAt: new Date(r.booking_closes_at),
    paused: r.paused,
    phase: phaseOf(r),
    children: r.children,
    booked: r.booked,
    openSlots: r.open_slots,
  }));
}

export type SlotDetail = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  state: "open" | "blocked";
  booking: {
    id: string;
    refCode: string;
    studentId: string;
    studentName: string;
    admissionNo: string | null;
    classLabel: string;
    locked: boolean;
    attendance: "pending" | "attended" | "no_show";
    source: "parent" | "admin";
    dateChanged: boolean;
    phones: string[];
  } | null;
};

export type SessionDetail = {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherLinkVersion: number;
  room: string | null;
  active: boolean;
  startsAt: Date;
  endsAt: Date;
  slotMinutes: number;
  gapMinutes: number;
  sections: Array<{ id: string; label: string }>;
  slots: SlotDetail[];
  children: number;
  booked: number;
  /** Open slots, whether taken or not: the session's capacity. */
  capacity: number;
  unbooked: Array<{
    studentId: string;
    name: string;
    classLabel: string;
    phones: string[];
    /** The school cancelled this child's last booking; they need a new slot. */
    needsRebooking: boolean;
  }>;
};

export type MeetingDetail = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "cancelled";
  phase: AdminPhase;
  date: string;
  venue: string | null;
  parentNote: string | null;
  opensAt: Date;
  closesAt: Date;
  paused: boolean;
  pausedMessage: string | null;
  cancelMessage: string | null;
  defaultStart: string;
  defaultEnd: string;
  slotMinutes: number;
  gapMinutes: number;
  breakStart: string | null;
  breakEnd: string | null;
  version: number;
  dateChanged: boolean;
  sessions: SessionDetail[];
  totals: { children: number; booked: number; unbooked: number; capacity: number };
};

export async function getMeetingDetail(db: DbOrTx, meetingId: string): Promise<MeetingDetail | null> {
  const mres = await db.execute<{
    id: string;
    slug: string;
    title: string;
    status: "draft" | "published" | "cancelled";
    meeting_date: string;
    venue: string | null;
    parent_note: string | null;
    booking_opens_at: Date;
    booking_closes_at: Date;
    paused: boolean;
    paused_message: string | null;
    cancel_message: string | null;
    default_start: string;
    default_end: string;
    slot_minutes: number;
    gap_minutes: number;
    break_start: string | null;
    break_end: string | null;
    version: number;
    date_changed: boolean;
    opened: boolean;
    still_open: boolean;
    past: boolean;
  }>(sql`
    select id, slug, title, status, meeting_date::text, venue, parent_note, booking_opens_at, booking_closes_at,
           paused, paused_message, cancel_message, default_start::text, default_end::text, slot_minutes, gap_minutes,
           break_start::text, break_end::text, version, date_changed_at is not null as date_changed,
           booking_opens_at <= now() as opened, booking_closes_at > now() as still_open,
           meeting_date < (now() at time zone 'Asia/Kolkata')::date as past
    from meetings where id = ${meetingId}`);
  const m = mres.rows[0];
  if (!m) return null;

  const sres = await db.execute<{
    id: string;
    teacher_id: string;
    teacher: string;
    link_version: number;
    room: string | null;
    status: string;
    starts_at: Date;
    ends_at: Date;
    slot_minutes: number;
    gap_minutes: number;
  }>(sql`
    select ms.id, ms.teacher_id, t.name as teacher, t.link_version, ms.room, ms.status, ms.starts_at, ms.ends_at,
           ms.slot_minutes, ms.gap_minutes
    from meeting_sessions ms join teachers t on t.id = ms.teacher_id
    where ms.meeting_id = ${meetingId}
    order by (select min(cs.sort_order) from session_sections ss join class_sections cs on cs.id = ss.class_section_id
              where ss.session_id = ms.id), t.name`);

  const secs = await db.execute<{ session_id: string; id: string; label: string }>(sql`
    select ss.session_id, cs.id, cs.label from session_sections ss
    join class_sections cs on cs.id = ss.class_section_id
    where ss.meeting_id = ${meetingId} order by cs.sort_order, cs.label`);

  const slotRes = await db.execute<{
    id: string;
    session_id: string;
    starts_at: Date;
    ends_at: Date;
    state: "open" | "blocked";
    booking_id: string | null;
    ref_code: string | null;
    student_id: string | null;
    student_name: string | null;
    admission_no: string | null;
    class_label: string | null;
    locked: boolean | null;
    attendance: "pending" | "attended" | "no_show" | null;
    source: "parent" | "admin" | null;
    time_changed: boolean | null;
    phones: string[] | null;
  }>(sql`
    select s.id, s.session_id, s.starts_at, s.ends_at, s.state,
           b.id as booking_id, b.ref_code, st.id as student_id, st.name as student_name, st.admission_no,
           cs.label as class_label, b.locked, b.attendance, b.source, b.time_changed_at is not null as time_changed,
           (select array_agg(p.phone order by p.phone) from student_phones p where p.student_id = st.id) as phones
    from slots s
    left join bookings b on b.slot_id = s.id and b.status = 'booked'
    left join students st on st.id = b.student_id
    left join class_sections cs on cs.id = st.class_section_id
    where s.meeting_id = ${meetingId} and s.state <> 'cancelled'
    order by s.starts_at`);

  const kids = await db.execute<{
    session_id: string;
    id: string;
    name: string;
    label: string;
    phones: string[] | null;
    has_booking: boolean;
    needs_rebooking: boolean;
  }>(sql`
    select ss.session_id, st.id, st.name, cs.label,
           (select array_agg(p.phone order by p.phone) from student_phones p where p.student_id = st.id) as phones,
           exists (select 1 from bookings b where b.meeting_id = ${meetingId} and b.student_id = st.id and b.status = 'booked') as has_booking,
           coalesce((select b.cancelled_by = 'school' from bookings b
                     where b.meeting_id = ${meetingId} and b.student_id = st.id
                     order by b.updated_at desc limit 1), false) as needs_rebooking
    from session_sections ss
    join students st on st.class_section_id = ss.class_section_id and st.archived_at is null
    join class_sections cs on cs.id = st.class_section_id
    where ss.meeting_id = ${meetingId}
    order by cs.sort_order, st.name`);

  const sessions: SessionDetail[] = sres.rows.map((s) => {
    const slots: SlotDetail[] = slotRes.rows
      .filter((x) => x.session_id === s.id)
      .map((x) => ({
        id: x.id,
        startsAt: new Date(x.starts_at),
        endsAt: new Date(x.ends_at),
        state: x.state,
        booking: x.booking_id
          ? {
              id: x.booking_id,
              refCode: x.ref_code!,
              studentId: x.student_id!,
              studentName: x.student_name!,
              admissionNo: x.admission_no,
              classLabel: x.class_label!,
              locked: !!x.locked,
              attendance: x.attendance ?? "pending",
              source: x.source ?? "parent",
              dateChanged: !!x.time_changed,
              phones: x.phones ?? [],
            }
          : null,
      }));
    const mine = kids.rows.filter((k) => k.session_id === s.id);
    return {
      id: s.id,
      teacherId: s.teacher_id,
      teacherName: s.teacher,
      teacherLinkVersion: s.link_version,
      room: s.room,
      active: s.status === "active",
      startsAt: new Date(s.starts_at),
      endsAt: new Date(s.ends_at),
      slotMinutes: s.slot_minutes,
      gapMinutes: s.gap_minutes,
      sections: secs.rows.filter((x) => x.session_id === s.id).map((x) => ({ id: x.id, label: x.label })),
      slots,
      children: mine.length,
      booked: slots.filter((x) => x.booking).length,
      capacity: slots.filter((x) => x.state === "open").length,
      unbooked: mine
        .filter((k) => !k.has_booking)
        .map((k) => ({
          studentId: k.id,
          name: k.name,
          classLabel: k.label,
          phones: k.phones ?? [],
          needsRebooking: k.needs_rebooking,
        })),
    };
  });

  const live = sessions.filter((s) => s.active);
  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    status: m.status,
    phase: phaseOf(m),
    date: m.meeting_date,
    venue: m.venue,
    parentNote: m.parent_note,
    opensAt: new Date(m.booking_opens_at),
    closesAt: new Date(m.booking_closes_at),
    paused: m.paused,
    pausedMessage: m.paused_message,
    cancelMessage: m.cancel_message,
    defaultStart: m.default_start.slice(0, 5),
    defaultEnd: m.default_end.slice(0, 5),
    slotMinutes: m.slot_minutes,
    gapMinutes: m.gap_minutes,
    breakStart: m.break_start?.slice(0, 5) ?? null,
    breakEnd: m.break_end?.slice(0, 5) ?? null,
    version: m.version,
    dateChanged: m.date_changed,
    sessions,
    totals: {
      children: live.reduce((n, s) => n + s.children, 0),
      booked: live.reduce((n, s) => n + s.booked, 0),
      unbooked: live.reduce((n, s) => n + s.unbooked.length, 0),
      capacity: live.reduce((n, s) => n + s.capacity, 0),
    },
  };
}

/** Things the office should fix, shown on the dashboard. */
export async function rosterHealth(db: DbOrTx) {
  const res = await db.execute<{
    students: number;
    no_phone: number;
    no_teacher: string[] | null;
    flood: boolean;
  }>(sql`
    select
      (select count(*)::int from students where archived_at is null) as students,
      (select count(*)::int from students st where st.archived_at is null
         and not exists (select 1 from student_phones p where p.student_id = st.id)) as no_phone,
      (select array_agg(label order by sort_order) from class_sections cs
        where active and teacher_id is null
          and exists (select 1 from students st where st.class_section_id = cs.id and st.archived_at is null)) as no_teacher,
      exists (select 1 from audit_log where action = 'signin.flood' and at > now() - interval '24 hours') as flood`);
  const r = res.rows[0];
  return { students: r.students, noPhone: r.no_phone, noTeacher: r.no_teacher ?? [], flood: r.flood };
}
