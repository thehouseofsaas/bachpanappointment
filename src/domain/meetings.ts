// Meeting lifecycle: create (draft) -> publish -> changes with bookings in
// place -> postpone / cancel. Structural edits lock the meeting FOR UPDATE so
// they never interleave with a booking (which takes it FOR SHARE).
import { sql } from "drizzle-orm";
import { pgError, type Db, type DbOrTx, type Tx } from "@/db/client";
import { audit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { cancelBySchool } from "./booking";
import { planSlots, validateSlotPlanInput, type SlotPlanInput } from "./slots";
import { addDays, daysBetween, isValidDate, istDate, istParts, istToInstant } from "./time";

export type MeetingInput = {
  title: string;
  date: string; // YYYY-MM-DD
  startMin: number;
  endMin: number;
  slotMinutes: number;
  gapMinutes: number;
  breakStartMin?: number | null;
  breakEndMin?: number | null;
  venue?: string | null;
  parentNote?: string | null;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  sectionIds: string[];
};

export type Impact = {
  bookingId: string;
  studentId: string;
  studentName: string;
  classLabel: string;
  startsAt: Date;
  phones: string[];
};

export type EditResult =
  | { ok: true; cancelled?: Impact[] }
  | { ok: false; error: string }
  | { ok: false; needsConfirm: true; impact: Impact[] };

type AdminActor = { adminId: string; ip?: string | null };
const by = (a: AdminActor) => ({ actorType: "admin" as const, actor: a.adminId, ip: a.ip });

function planInput(i: MeetingInput): SlotPlanInput {
  return {
    startMin: i.startMin,
    endMin: i.endMin,
    slotMinutes: i.slotMinutes,
    gapMinutes: i.gapMinutes,
    breakStartMin: i.breakStartMin ?? null,
    breakEndMin: i.breakEndMin ?? null,
  };
}

export function validateMeetingInput(i: MeetingInput, now: Date): string[] {
  const errors: string[] = [];
  if (!i.title.trim()) errors.push("Give the meeting a title.");
  if (i.title.length > 120) errors.push("The title is too long.");
  if (!isValidDate(i.date)) {
    errors.push("That date does not exist.");
    return errors;
  }
  if (i.date < istDate(now)) errors.push("The meeting date is in the past.");
  const planError = validateSlotPlanInput(planInput(i));
  if (planError) errors.push(planError);
  if (!(i.bookingOpensAt instanceof Date) || Number.isNaN(i.bookingOpensAt.getTime())) {
    errors.push("Choose when booking opens.");
  } else if (!(i.bookingClosesAt instanceof Date) || Number.isNaN(i.bookingClosesAt.getTime())) {
    errors.push("Choose when booking closes.");
  } else {
    if (i.bookingOpensAt >= i.bookingClosesAt) errors.push("Booking must close after it opens.");
    if (!planError && i.bookingClosesAt > istToInstant(i.date, i.startMin)) {
      errors.push("Booking must close before the first slot starts.");
    }
  }
  if (i.sectionIds.length === 0) errors.push("Choose at least one class.");
  return errors;
}

async function uniqueSlug(tx: Tx, date: string): Promise<string> {
  const base = `ptm-${date}`;
  for (let n = 0; n < 50; n++) {
    const slug = n === 0 ? base : `${base}-${n + 1}`;
    const r = await tx.execute(sql`select 1 from meetings where slug = ${slug}`);
    if (r.rows.length === 0) return slug;
  }
  return `${base}-${newId(6)}`;
}

function friendlyDbError(err: unknown): string | null {
  const pg = pgError(err);
  if (!pg) return null;
  if (pg.code === "23P01" && pg.constraint === "slots_no_overlap") {
    return "This teacher already has slots at that time (in this or another meeting). Change the time or the teacher.";
  }
  if (pg.code === "23505" && pg.constraint === "meeting_sessions_one_per_teacher") {
    return "That teacher already has a session in this meeting.";
  }
  if (pg.code === "23505" && pg.constraint === "session_sections_one_session_per_meeting") {
    return "That class is already part of another session in this meeting.";
  }
  if (pg.code === "55P03") return "The meeting is busy right now. Please try again.";
  return null;
}

async function insertPlannedSlots(
  tx: Tx,
  s: { sessionId: string; meetingId: string; teacherId: string; date: string },
  plan: SlotPlanInput,
): Promise<number> {
  const planned = planSlots(plan).slots;
  for (const p of planned) {
    await tx.execute(sql`
      insert into slots (id, session_id, meeting_id, teacher_id, starts_at, ends_at, state)
      values (${newId()}, ${s.sessionId}, ${s.meetingId}, ${s.teacherId},
              ${istToInstant(s.date, p.startMin).toISOString()}, ${istToInstant(s.date, p.endMin).toISOString()},
              ${p.blocked ? "blocked" : "open"})`);
  }
  return planned.length;
}

/** One session per class teacher, each serving that teacher's chosen sections. */
async function buildSessions(tx: Tx, meetingId: string, i: MeetingInput): Promise<string | null> {
  const secs = await tx.execute<{ id: string; label: string; teacher_id: string | null; active: boolean }>(sql`
    select id, label, teacher_id, active from class_sections where id in ${i.sectionIds} order by sort_order, label`);
  if (secs.rows.length !== new Set(i.sectionIds).size) return "One of the chosen classes no longer exists.";
  const missing = secs.rows.filter((s) => !s.teacher_id).map((s) => s.label);
  if (missing.length) {
    return `${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no class teacher. Set one under Classes, or untick ${missing.length === 1 ? "it" : "them"}.`;
  }
  const byTeacher = new Map<string, string[]>();
  for (const s of secs.rows) byTeacher.set(s.teacher_id!, [...(byTeacher.get(s.teacher_id!) ?? []), s.id]);
  for (const [teacherId, sectionIds] of byTeacher) {
    const sessionId = newId();
    await tx.execute(sql`
      insert into meeting_sessions (id, meeting_id, teacher_id, starts_at, ends_at, slot_minutes, gap_minutes)
      values (${sessionId}, ${meetingId}, ${teacherId},
              ${istToInstant(i.date, i.startMin).toISOString()}, ${istToInstant(i.date, i.endMin).toISOString()},
              ${i.slotMinutes}, ${i.gapMinutes})`);
    for (const sectionId of sectionIds) {
      await tx.execute(sql`
        insert into session_sections (session_id, meeting_id, class_section_id)
        values (${sessionId}, ${meetingId}, ${sectionId})`);
    }
    await insertPlannedSlots(tx, { sessionId, meetingId, teacherId, date: i.date }, planInput(i));
  }
  return null;
}

class Abort extends Error {}

async function tryTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '5s'`);
      return fn(tx);
    });
  } catch (err) {
    if (err instanceof Abort) return { ok: false, error: err.message };
    const msg = friendlyDbError(err);
    if (msg) return { ok: false, error: msg };
    throw err;
  }
}

const minutes = (m: number | null | undefined) => (m == null ? null : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`);

export async function createMeeting(
  db: Db,
  input: MeetingInput,
  actor: AdminActor,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const errors = validateMeetingInput(input, new Date());
  if (errors.length) return { ok: false, error: errors.join(" ") };
  return tryTx(db, async (tx) => {
    const id = newId();
    const slug = await uniqueSlug(tx, input.date);
    await tx.execute(sql`
      insert into meetings (id, slug, title, meeting_date, booking_opens_at, booking_closes_at, venue, parent_note,
                            default_start, default_end, slot_minutes, gap_minutes, break_start, break_end)
      values (${id}, ${slug}, ${input.title.trim()}, ${input.date},
              ${input.bookingOpensAt.toISOString()}, ${input.bookingClosesAt.toISOString()},
              ${input.venue?.trim() || null}, ${input.parentNote?.trim() || null},
              ${minutes(input.startMin)}, ${minutes(input.endMin)}, ${input.slotMinutes}, ${input.gapMinutes},
              ${minutes(input.breakStartMin)}, ${minutes(input.breakEndMin)})`);
    const err = await buildSessions(tx, id, input);
    if (err) throw new Abort(err);
    await audit(tx, { ...by(actor), action: "meeting.create", entity: "meeting", entityId: id, detail: { title: input.title, date: input.date } });
    return { ok: true as const, id };
  });
}

/** Locks the meeting for a structural edit and returns its core fields. */
async function lockMeeting(tx: Tx, meetingId: string) {
  const res = await tx.execute<{
    id: string;
    status: string;
    meeting_date: string;
    version: number;
    break_start: string | null;
    break_end: string | null;
  }>(sql`select id, status, meeting_date::text, version, break_start::text, break_end::text
         from meetings where id = ${meetingId} for update`);
  if (!res.rows[0]) throw new Abort("That meeting no longer exists.");
  return res.rows[0];
}

async function touch(tx: Tx, meetingId: string) {
  await tx.execute(sql`update meetings set version = version + 1, updated_at = now() where id = ${meetingId}`);
}

/** Rebuilds a draft meeting from the form. Only drafts can be rebuilt. */
export async function updateDraftMeeting(
  db: Db,
  meetingId: string,
  input: MeetingInput,
  actor: AdminActor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const errors = validateMeetingInput(input, new Date());
  if (errors.length) return { ok: false, error: errors.join(" ") };
  return tryTx(db, async (tx) => {
    const m = await lockMeeting(tx, meetingId);
    if (m.status !== "draft") throw new Abort("Only a draft can be rebuilt. Use the session tools for a published meeting.");
    await tx.execute(sql`delete from meeting_sessions where meeting_id = ${meetingId}`);
    await tx.execute(sql`
      update meetings set title = ${input.title.trim()}, meeting_date = ${input.date},
        booking_opens_at = ${input.bookingOpensAt.toISOString()}, booking_closes_at = ${input.bookingClosesAt.toISOString()},
        venue = ${input.venue?.trim() || null}, parent_note = ${input.parentNote?.trim() || null},
        default_start = ${minutes(input.startMin)}, default_end = ${minutes(input.endMin)},
        slot_minutes = ${input.slotMinutes}, gap_minutes = ${input.gapMinutes},
        break_start = ${minutes(input.breakStartMin)}, break_end = ${minutes(input.breakEndMin)}
      where id = ${meetingId}`);
    const err = await buildSessions(tx, meetingId, input);
    if (err) throw new Abort(err);
    await touch(tx, meetingId);
    await audit(tx, { ...by(actor), action: "meeting.rebuild", entity: "meeting", entityId: meetingId });
    return { ok: true as const };
  });
}

export type MeetingDetails = {
  title: string;
  venue: string | null;
  parentNote: string | null;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  paused: boolean;
  pausedMessage: string | null;
};

/** Always-allowed edits. `version` guards against two admins overwriting each other. */
export async function updateMeetingDetails(
  db: Db,
  meetingId: string,
  d: MeetingDetails,
  version: number,
  actor: AdminActor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!d.title.trim()) return { ok: false, error: "Give the meeting a title." };
  if (!(d.bookingOpensAt < d.bookingClosesAt)) return { ok: false, error: "Booking must close after it opens." };
  return tryTx(db, async (tx) => {
    const m = await lockMeeting(tx, meetingId);
    if (m.version !== version) throw new Abort("Someone else changed this meeting. Reload the page and try again.");
    const first = await tx.execute<{ first: Date | null }>(sql`
      select min(starts_at) as first from slots where meeting_id = ${meetingId} and state <> 'cancelled'`);
    const firstStart = first.rows[0]?.first ? new Date(first.rows[0].first) : null;
    if (firstStart && d.bookingClosesAt > firstStart) throw new Abort("Booking must close before the first slot starts.");
    await tx.execute(sql`
      update meetings set title = ${d.title.trim()}, venue = ${d.venue?.trim() || null},
        parent_note = ${d.parentNote?.trim() || null},
        booking_opens_at = ${d.bookingOpensAt.toISOString()}, booking_closes_at = ${d.bookingClosesAt.toISOString()},
        paused = ${d.paused}, paused_message = ${d.pausedMessage?.trim() || null}
      where id = ${meetingId}`);
    await touch(tx, meetingId);
    await audit(tx, { ...by(actor), action: "meeting.update", entity: "meeting", entityId: meetingId, detail: { paused: d.paused } });
    return { ok: true as const };
  });
}

export async function publishMeeting(
  db: Db,
  meetingId: string,
  actor: AdminActor,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return tryTx(db, async (tx) => {
    const m = await lockMeeting(tx, meetingId);
    if (m.status !== "draft") throw new Abort("This meeting is already published or cancelled.");
    if (m.meeting_date < istDate(new Date())) throw new Abort("The meeting date is in the past.");
    const stats = await tx.execute<{ open_slots: number; children: number; closes_ok: boolean }>(sql`
      select
        (select count(*)::int from slots s join meeting_sessions ms on ms.id = s.session_id
           where s.meeting_id = ${meetingId} and s.state = 'open' and ms.status = 'active') as open_slots,
        (select count(*)::int from students st join session_sections ss on ss.class_section_id = st.class_section_id
           where ss.meeting_id = ${meetingId} and st.archived_at is null) as children,
        (select booking_closes_at > now() from meetings where id = ${meetingId}) as closes_ok`);
    const s = stats.rows[0];
    if (s.open_slots === 0) throw new Abort("There are no open slots to book.");
    if (s.children === 0) throw new Abort("There are no students in the chosen classes yet. Upload the roster first.");
    if (!s.closes_ok) throw new Abort("Booking would already be closed. Move the closing time into the future.");
    await tx.execute(sql`update meetings set status = 'published', published_at = now() where id = ${meetingId}`);
    await touch(tx, meetingId);
    await audit(tx, { ...by(actor), action: "meeting.publish", entity: "meeting", entityId: meetingId });
    return { ok: true as const };
  });
}

export async function deleteDraftMeeting(db: Db, meetingId: string, actor: AdminActor) {
  return tryTx(db, async (tx) => {
    const m = await lockMeeting(tx, meetingId);
    if (m.status !== "draft") throw new Abort("Only drafts can be deleted. Cancel a published meeting instead.");
    await tx.execute(sql`delete from meetings where id = ${meetingId}`);
    await audit(tx, { ...by(actor), action: "meeting.delete", entity: "meeting", entityId: meetingId });
    return { ok: true as const };
  });
}

async function impactFor(tx: DbOrTx, filter: ReturnType<typeof sql>): Promise<Impact[]> {
  const res = await tx.execute<{
    booking_id: string;
    student_id: string;
    name: string;
    label: string;
    starts_at: Date;
    phones: string[] | null;
  }>(sql`
    select b.id as booking_id, st.id as student_id, st.name, cs.label, s.starts_at,
           (select array_agg(p.phone order by p.phone) from student_phones p where p.student_id = st.id) as phones
    from bookings b
    join slots s on s.id = b.slot_id
    join students st on st.id = b.student_id
    join class_sections cs on cs.id = st.class_section_id
    where b.status = 'booked' and ${filter}
    order by s.starts_at`);
  return res.rows.map((r) => ({
    bookingId: r.booking_id,
    studentId: r.student_id,
    studentName: r.name,
    classLabel: r.label,
    startsAt: new Date(r.starts_at),
    phones: r.phones ?? [],
  }));
}

export type SessionEdit = {
  date: string;
  startMin: number;
  endMin: number;
  slotMinutes: number;
  gapMinutes: number;
  room?: string | null;
};

/**
 * Changes one teacher's window. With no bookings the slots are rebuilt
 * freely. With bookings, only the ends of the window may move (on the same
 * grid); booked slots that fall outside need `confirm`.
 */
export async function updateSession(
  db: Db,
  sessionId: string,
  e: SessionEdit,
  actor: AdminActor,
  confirm = false,
): Promise<EditResult> {
  if (!isValidDate(e.date)) return { ok: false, error: "That date does not exist." };
  const res = await tryTx<EditResult>(db, async (tx) => {
    const sres = await tx.execute<{ meeting_id: string }>(sql`select meeting_id from meeting_sessions where id = ${sessionId}`);
    if (!sres.rows[0]) throw new Abort("That session no longer exists.");
    const m = await lockMeeting(tx, sres.rows[0].meeting_id);
    if (m.status === "cancelled") throw new Abort("This meeting is cancelled.");
    const cur = await tx.execute<{
      teacher_id: string;
      starts_at: Date;
      ends_at: Date;
      slot_minutes: number;
      gap_minutes: number;
      status: string;
    }>(sql`select teacher_id, starts_at, ends_at, slot_minutes, gap_minutes, status
           from meeting_sessions where id = ${sessionId} for update`);
    const s = cur.rows[0];
    if (s.status !== "active") throw new Abort("This session is cancelled. Restore it first.");
    if (e.date < istDate(new Date())) throw new Abort("That date is in the past.");

    const parse = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
    const sameDay = e.date === m.meeting_date;
    const plan: SlotPlanInput = {
      startMin: e.startMin,
      endMin: e.endMin,
      slotMinutes: e.slotMinutes,
      gapMinutes: e.gapMinutes,
      breakStartMin: null,
      breakEndMin: null,
    };
    // Keep the meeting's break only where it still fits this window.
    const bs = parse(m.break_start);
    const be = parse(m.break_end);
    if (sameDay && bs != null && be != null && bs >= e.startMin && be <= e.endMin) {
      plan.breakStartMin = bs;
      plan.breakEndMin = be;
    }
    const planError = validateSlotPlanInput(plan);
    if (planError) throw new Abort(planError);

    const booked = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from bookings b join slots sl on sl.id = b.slot_id
      where sl.session_id = ${sessionId} and b.status = 'booked'`);
    const hasBookings = booked.rows[0].n > 0;
    const newStart = istToInstant(e.date, e.startMin);
    const newEnd = istToInstant(e.date, e.endMin);
    const key = { sessionId, meetingId: m.id, teacherId: s.teacher_id, date: e.date };
    let cancelled: Impact[] = [];

    if (!hasBookings) {
      // Slots that once held a (now cancelled) booking cannot be deleted; retire them.
      await tx.execute(sql`
        update slots set state = 'cancelled' where session_id = ${sessionId}
          and exists (select 1 from bookings b where b.slot_id = slots.id)`);
      await tx.execute(sql`
        delete from slots where session_id = ${sessionId}
          and not exists (select 1 from bookings b where b.slot_id = slots.id)`);
      await tx.execute(sql`
        update meeting_sessions set starts_at = ${newStart.toISOString()}, ends_at = ${newEnd.toISOString()},
          slot_minutes = ${e.slotMinutes}, gap_minutes = ${e.gapMinutes}, room = ${e.room?.trim() || null}
        where id = ${sessionId}`);
      await insertPlannedSlots(tx, key, plan);
    } else {
      const old = istParts(new Date(s.starts_at));
      const step = s.slot_minutes + s.gap_minutes;
      if (e.slotMinutes !== s.slot_minutes || e.gapMinutes !== s.gap_minutes) {
        throw new Abort("Slot length cannot change while slots are booked. Cancel this session's bookings first.");
      }
      if (e.date !== old.date) throw new Abort("To move booked slots to another day, use Postpone.");
      if ((e.startMin - old.minutes) % step !== 0) {
        throw new Abort(`With bookings in place the start can only move in steps of ${step} minutes.`);
      }
      const outside = sql`s.session_id = ${sessionId} and s.state <> 'cancelled'
        and (s.starts_at < ${newStart.toISOString()} or s.ends_at > ${newEnd.toISOString()})`;
      const impact = await impactFor(tx, outside);
      if (impact.length > 0 && !confirm) return { ok: false, needsConfirm: true, impact };
      await cancelBySchool(tx, { bookingIds: impact.map((i) => i.bookingId) }, "The teacher's timings changed", by(actor));
      cancelled = impact;
      await tx.execute(sql`
        update slots s set state = 'cancelled' where ${outside}`);
      await tx.execute(sql`
        update meeting_sessions set starts_at = ${newStart.toISOString()}, ends_at = ${newEnd.toISOString()},
          room = ${e.room?.trim() || null} where id = ${sessionId}`);
      const existing = await tx.execute<{ starts_at: Date }>(sql`
        select starts_at from slots where session_id = ${sessionId} and state <> 'cancelled'`);
      const have = new Set(existing.rows.map((r) => new Date(r.starts_at).getTime()));
      for (const p of planSlots(plan).slots) {
        const at = istToInstant(e.date, p.startMin);
        if (have.has(at.getTime())) continue;
        await tx.execute(sql`
          insert into slots (id, session_id, meeting_id, teacher_id, starts_at, ends_at, state)
          values (${newId()}, ${sessionId}, ${m.id}, ${s.teacher_id}, ${at.toISOString()},
                  ${istToInstant(e.date, p.endMin).toISOString()}, ${p.blocked ? "blocked" : "open"})`);
      }
    }
    await touch(tx, m.id);
    await audit(tx, { ...by(actor), action: "session.update", entity: "session", entityId: sessionId, detail: { ...e, cancelled: cancelled.length } });
    return { ok: true, cancelled };
  });
  return res;
}

/** Blocks or re-opens one slot. Blocking a booked slot needs `confirm`. */
export async function setSlotBlocked(
  db: Db,
  slotId: string,
  blocked: boolean,
  actor: AdminActor,
  confirm = false,
): Promise<EditResult> {
  return tryTx<EditResult>(db, async (tx) => {
    const sres = await tx.execute<{ meeting_id: string }>(sql`select meeting_id from slots where id = ${slotId}`);
    if (!sres.rows[0]) throw new Abort("That slot no longer exists.");
    await lockMeeting(tx, sres.rows[0].meeting_id);
    const cur = await tx.execute<{ state: string }>(sql`select state from slots where id = ${slotId} for update`);
    if (cur.rows[0].state === "cancelled") throw new Abort("That slot was removed.");
    let cancelled: Impact[] = [];
    if (blocked) {
      const impact = await impactFor(tx, sql`b.slot_id = ${slotId}`);
      if (impact.length > 0 && !confirm) return { ok: false, needsConfirm: true, impact };
      await cancelBySchool(tx, { slotIds: [slotId] }, "This time is no longer available", by(actor));
      cancelled = impact;
    }
    await tx.execute(sql`update slots set state = ${blocked ? "blocked" : "open"} where id = ${slotId}`);
    await touch(tx, sres.rows[0].meeting_id);
    await audit(tx, { ...by(actor), action: blocked ? "slot.block" : "slot.unblock", entity: "slot", entityId: slotId });
    return { ok: true, cancelled };
  });
}

const SESSION_CANCEL_REASON = "The teacher is not available";

export async function cancelSession(db: Db, sessionId: string, actor: AdminActor, confirm = false): Promise<EditResult> {
  return tryTx<EditResult>(db, async (tx) => {
    const sres = await tx.execute<{ meeting_id: string }>(sql`select meeting_id from meeting_sessions where id = ${sessionId}`);
    if (!sres.rows[0]) throw new Abort("That session no longer exists.");
    await lockMeeting(tx, sres.rows[0].meeting_id);
    const impact = await impactFor(tx, sql`s.session_id = ${sessionId}`);
    if (impact.length > 0 && !confirm) return { ok: false, needsConfirm: true, impact };
    await cancelBySchool(tx, { bookingIds: impact.map((i) => i.bookingId) }, SESSION_CANCEL_REASON, by(actor));
    await tx.execute(sql`update meeting_sessions set status = 'cancelled' where id = ${sessionId}`);
    await touch(tx, sres.rows[0].meeting_id);
    await audit(tx, { ...by(actor), action: "session.cancel", entity: "session", entityId: sessionId, detail: { cancelled: impact.length } });
    return { ok: true, cancelled: impact };
  });
}

/** Undo for cancelSession: reactivates it and restores the bookings it cancelled where still possible. */
export async function restoreSession(db: Db, sessionId: string, actor: AdminActor) {
  return tryTx(db, async (tx) => {
    const sres = await tx.execute<{ meeting_id: string }>(sql`select meeting_id from meeting_sessions where id = ${sessionId}`);
    if (!sres.rows[0]) throw new Abort("That session no longer exists.");
    await lockMeeting(tx, sres.rows[0].meeting_id);
    await tx.execute(sql`update meeting_sessions set status = 'active' where id = ${sessionId}`);
    const restored = await tx.execute<{ id: string }>(sql`
      update bookings b
      set status = 'booked', cancelled_at = null, cancelled_by = null, cancel_reason = null, updated_at = now()
      from slots s, students st
      where s.id = b.slot_id and st.id = b.student_id
        and s.session_id = ${sessionId} and s.state = 'open'
        and b.status = 'cancelled' and b.cancelled_by = 'school' and b.cancel_reason = ${SESSION_CANCEL_REASON}
        and st.archived_at is null
        and not exists (select 1 from bookings o where o.status = 'booked'
                        and (o.slot_id = b.slot_id
                             or (o.meeting_id = b.meeting_id and o.teacher_id = b.teacher_id and o.student_id = b.student_id)))
      returning b.id`);
    await touch(tx, sres.rows[0].meeting_id);
    await audit(tx, { ...by(actor), action: "session.restore", entity: "session", entityId: sessionId, detail: { restored: restored.rows.length } });
    return { ok: true as const, restored: restored.rows.length };
  });
}

/** Hands a session to another teacher. Slots and bookings follow through the foreign keys. */
export async function substituteTeacher(db: Db, sessionId: string, teacherId: string, actor: AdminActor) {
  return tryTx(db, async (tx) => {
    const sres = await tx.execute<{ meeting_id: string; teacher_id: string }>(sql`
      select meeting_id, teacher_id from meeting_sessions where id = ${sessionId}`);
    if (!sres.rows[0]) throw new Abort("That session no longer exists.");
    await lockMeeting(tx, sres.rows[0].meeting_id);
    const t = await tx.execute(sql`select 1 from teachers where id = ${teacherId} and active`);
    if (t.rows.length === 0) throw new Abort("Choose an active teacher.");
    await tx.execute(sql`update meeting_sessions set teacher_id = ${teacherId} where id = ${sessionId}`);
    await touch(tx, sres.rows[0].meeting_id);
    await audit(tx, { ...by(actor), action: "session.substitute", entity: "session", entityId: sessionId, detail: { from: sres.rows[0].teacher_id, to: teacherId } });
    return { ok: true as const };
  });
}

/** Moves the whole meeting to another date. Times of day and bookings are kept. */
export async function postponeMeeting(db: Db, meetingId: string, newDate: string, actor: AdminActor) {
  if (!isValidDate(newDate)) return { ok: false as const, error: "That date does not exist." };
  return tryTx(db, async (tx) => {
    const m = await lockMeeting(tx, meetingId);
    if (m.status === "cancelled") throw new Abort("This meeting is cancelled.");
    if (newDate < istDate(new Date())) throw new Abort("The new date is in the past.");
    const delta = daysBetween(m.meeting_date, newDate);
    if (delta === 0) throw new Abort("That is the current date.");
    const shift = sql`make_interval(days => ${delta})`;
    await tx.execute(sql`set constraints slots_no_overlap deferred`);
    await tx.execute(sql`update meeting_sessions set starts_at = starts_at + ${shift}, ends_at = ends_at + ${shift} where meeting_id = ${meetingId}`);
    await tx.execute(sql`update slots set starts_at = starts_at + ${shift}, ends_at = ends_at + ${shift} where meeting_id = ${meetingId}`);
    await tx.execute(sql`update bookings set time_changed_at = now(), updated_at = now() where meeting_id = ${meetingId} and status = 'booked'`);
    // Booking closes the same amount of time before the meeting as before;
    // if booking had not opened yet, the opening time is left alone.
    await tx.execute(sql`
      update meetings set meeting_date = ${newDate}, date_changed_at = now(),
        booking_closes_at = booking_closes_at + ${shift},
        booking_opens_at = least(booking_opens_at, booking_closes_at + ${shift} - interval '1 minute')
      where id = ${meetingId}`);
    await tx.execute(sql`set constraints slots_no_overlap immediate`);
    await touch(tx, meetingId);
    await audit(tx, { ...by(actor), action: "meeting.postpone", entity: "meeting", entityId: meetingId, detail: { from: m.meeting_date, to: newDate } });
    return { ok: true as const };
  });
}

export async function cancelMeeting(db: Db, meetingId: string, message: string, actor: AdminActor) {
  return tryTx(db, async (tx) => {
    const m = await lockMeeting(tx, meetingId);
    if (m.status === "draft") throw new Abort("This is a draft. Delete it instead.");
    if (m.status === "cancelled") return { ok: true as const, cancelled: 0 };
    const impact = await impactFor(tx, sql`b.meeting_id = ${meetingId}`);
    await cancelBySchool(tx, { bookingIds: impact.map((i) => i.bookingId) }, "The meeting was cancelled", by(actor));
    await tx.execute(sql`update meetings set status = 'cancelled', cancel_message = ${message.trim() || null} where id = ${meetingId}`);
    await touch(tx, meetingId);
    await audit(tx, { ...by(actor), action: "meeting.cancel", entity: "meeting", entityId: meetingId, detail: { cancelled: impact.length } });
    return { ok: true as const, cancelled: impact.length };
  });
}

/** Copies a meeting's set-up to a new date as a draft. */
export async function duplicateMeeting(db: Db, meetingId: string, newDate: string, actor: AdminActor) {
  const src = await db.execute<{
    title: string;
    venue: string | null;
    parent_note: string | null;
    default_start: string;
    default_end: string;
    slot_minutes: number;
    gap_minutes: number;
    break_start: string | null;
    break_end: string | null;
  }>(sql`select title, venue, parent_note, default_start::text, default_end::text, slot_minutes, gap_minutes,
                break_start::text, break_end::text from meetings where id = ${meetingId}`);
  const m = src.rows[0];
  if (!m) return { ok: false as const, error: "That meeting no longer exists." };
  const secs = await db.execute<{ id: string }>(sql`
    select distinct ss.class_section_id as id from session_sections ss
    join class_sections cs on cs.id = ss.class_section_id
    where ss.meeting_id = ${meetingId} and cs.active and cs.teacher_id is not null`);
  const t = (v: string | null) => (v ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5)) : null);
  const now = new Date();
  return createMeeting(
    db,
    {
      title: m.title,
      date: newDate,
      startMin: t(m.default_start)!,
      endMin: t(m.default_end)!,
      slotMinutes: m.slot_minutes,
      gapMinutes: m.gap_minutes,
      breakStartMin: t(m.break_start),
      breakEndMin: t(m.break_end),
      venue: m.venue,
      parentNote: m.parent_note,
      bookingOpensAt: now,
      bookingClosesAt: defaultCloseTime(newDate, now),
      sectionIds: secs.rows.map((r) => r.id),
    },
    actor,
  );
}

/** 8 pm the evening before the meeting (or just before it starts, if that has passed). */
export function defaultCloseTime(date: string, now: Date): Date {
  const eveBefore = istToInstant(addDays(date, -1), 20 * 60);
  return eveBefore > now ? eveBefore : new Date(istToInstant(date, 0).getTime() + 6 * 60 * 60_000);
}

/** Read-only: who would lose their slot. Used by the confirmation screens. */
export async function previewImpact(
  db: Db,
  target: { slotId: string } | { sessionId: string; window?: { date: string; startMin: number; endMin: number } },
): Promise<Impact[]> {
  if ("slotId" in target) return impactFor(db, sql`b.slot_id = ${target.slotId}`);
  if (!target.window) return impactFor(db, sql`s.session_id = ${target.sessionId}`);
  const start = istToInstant(target.window.date, target.window.startMin).toISOString();
  const end = istToInstant(target.window.date, target.window.endMin).toISOString();
  return impactFor(
    db,
    sql`s.session_id = ${target.sessionId} and s.state <> 'cancelled' and (s.starts_at < ${start} or s.ends_at > ${end})`,
  );
}
