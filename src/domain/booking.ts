// The only code that writes bookings. Every rule is checked here, on the
// server, against stored data and the database clock; the unique indexes in
// the schema are the final backstop.
//
// Lock order (always the same, so transactions cannot deadlock):
//   meeting (FOR SHARE) -> student -> booking -> slot
// Admin structural edits take the meeting FOR UPDATE, so they never
// interleave with a booking.
import { sql } from "drizzle-orm";
import { pgError, type Db, type Tx } from "@/db/client";
import { audit } from "@/lib/audit";
import { newId, newRefCode } from "@/lib/ids";

export type Actor =
  | { kind: "parent"; phone: string; ip?: string | null }
  | { kind: "admin"; adminId: string; ip?: string | null };

export type BookingErrorCode =
  | "SLOT_TAKEN"
  | "ALREADY_BOOKED"
  | "NOT_OPEN_YET"
  | "CLOSED"
  | "PAUSED"
  | "MEETING_CANCELLED"
  | "NOT_FOUND"
  | "NOT_ALLOWED"
  | "SLOT_UNAVAILABLE"
  | "LOCKED"
  | "CHANGE_LIMIT"
  | "BUSY";

export type BookingOutcome =
  | { ok: true; bookingId: string; refCode: string; slotId: string; unchanged?: boolean }
  | { ok: false; code: BookingErrorCode };

export type CancelOutcome = { ok: true } | { ok: false; code: BookingErrorCode };

class Refuse extends Error {
  constructor(public code: BookingErrorCode) {
    super(code);
  }
}

const DEFAULT_CHANGE_LIMIT = 3;

async function run<T extends { ok: boolean }>(
  db: Db,
  fn: (tx: Tx) => Promise<T>,
): Promise<T | { ok: false; code: BookingErrorCode }> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '3s'`);
      return fn(tx);
    });
  } catch (err) {
    if (err instanceof Refuse) return { ok: false, code: err.code };
    const pg = pgError(err);
    if (pg?.code === "23505" && pg.constraint === "bookings_one_per_slot") return { ok: false, code: "SLOT_TAKEN" };
    if (pg?.code === "23505" && pg.constraint === "bookings_one_per_child") return { ok: false, code: "ALREADY_BOOKED" };
    if (pg?.code === "55P03" || pg?.code === "40P01" || pg?.code === "57014") return { ok: false, code: "BUSY" };
    throw err;
  }
}

/** Locks the meeting against structural edits and applies the booking-window rules. */
async function checkMeeting(tx: Tx, meetingId: string, actor: Actor): Promise<void> {
  const res = await tx.execute<{
    status: string;
    paused: boolean;
    opened: boolean;
    still_open: boolean;
  }>(sql`
    select status, paused, booking_opens_at <= now() as opened, booking_closes_at > now() as still_open
    from meetings where id = ${meetingId} for share`);
  const m = res.rows[0];
  if (!m) throw new Refuse("NOT_FOUND");
  if (m.status === "cancelled") throw new Refuse("MEETING_CANCELLED");
  if (m.status !== "published") throw new Refuse("NOT_FOUND");
  if (actor.kind === "admin") return; // the office may book outside the window
  if (m.paused) throw new Refuse("PAUSED");
  if (!m.opened) throw new Refuse("NOT_OPEN_YET");
  if (!m.still_open) throw new Refuse("CLOSED");
}

/** Locks the student row and checks the actor may act for this child. */
async function checkStudent(
  tx: Tx,
  studentId: string,
  actor: Actor,
): Promise<{ classSectionId: string; classLabel: string }> {
  const res = await tx.execute<{ class_section_id: string; label: string; archived: boolean }>(sql`
    select st.class_section_id, cs.label, st.archived_at is not null as archived
    from students st join class_sections cs on cs.id = st.class_section_id
    where st.id = ${studentId} for update of st`);
  const st = res.rows[0];
  if (!st || st.archived) throw new Refuse("NOT_ALLOWED");
  if (actor.kind === "parent") {
    const own = await tx.execute(sql`
      select 1 from student_phones where student_id = ${studentId} and phone = ${actor.phone}`);
    if (own.rows.length === 0) throw new Refuse("NOT_ALLOWED");
  }
  return { classSectionId: st.class_section_id, classLabel: st.label };
}

type LockedSlot = { meeting_id: string; session_id: string; teacher_id: string };

/** Locks the slot and checks it can be taken by a child of this class section. */
async function checkSlot(tx: Tx, slotId: string, classSectionId: string, actor: Actor): Promise<void> {
  const res = await tx.execute<{ state: string; session_status: string; future: boolean; session_id: string }>(sql`
    select s.state, ms.status as session_status, s.starts_at > now() as future, s.session_id
    from slots s join meeting_sessions ms on ms.id = s.session_id
    where s.id = ${slotId} for update of s`);
  const s = res.rows[0];
  if (!s) throw new Refuse("NOT_FOUND");
  if (s.state !== "open" || s.session_status !== "active") throw new Refuse("SLOT_UNAVAILABLE");
  if (!s.future && actor.kind === "parent") throw new Refuse("SLOT_UNAVAILABLE");
  const serves = await tx.execute(sql`
    select 1 from session_sections where session_id = ${s.session_id} and class_section_id = ${classSectionId}`);
  if (serves.rows.length === 0) throw new Refuse("NOT_ALLOWED");
  const taken = await tx.execute(sql`select 1 from bookings where slot_id = ${slotId} and status = 'booked'`);
  if (taken.rows.length > 0) throw new Refuse("SLOT_TAKEN");
}

async function findSlot(tx: Tx, slotId: string): Promise<LockedSlot> {
  const res = await tx.execute<LockedSlot>(sql`
    select meeting_id, session_id, teacher_id from slots where id = ${slotId}`);
  if (!res.rows[0]) throw new Refuse("NOT_FOUND");
  return res.rows[0];
}

/** Parent-initiated changes and cancellations for this child in this meeting. */
async function parentMoves(tx: Tx, meetingId: string, studentId: string): Promise<number> {
  const res = await tx.execute<{ n: number }>(sql`
    select coalesce(sum(change_count), 0)::int
         + (count(*) filter (where status = 'cancelled' and cancelled_by = 'parent'))::int as n
    from bookings where meeting_id = ${meetingId} and student_id = ${studentId}`);
  return Number(res.rows[0]?.n ?? 0);
}

const actorLabel = (a: Actor) => (a.kind === "parent" ? a.phone : "school");
const auditActor = (a: Actor) =>
  a.kind === "parent"
    ? { actorType: "parent" as const, actor: a.phone, ip: a.ip }
    : { actorType: "admin" as const, actor: a.adminId, ip: a.ip };

export async function bookSlot(
  db: Db,
  input: { slotId: string; studentId: string; actor: Actor },
): Promise<BookingOutcome> {
  const { slotId, studentId, actor } = input;
  return run<BookingOutcome>(db, async (tx) => {
    const slot = await findSlot(tx, slotId);
    await checkMeeting(tx, slot.meeting_id, actor);
    const student = await checkStudent(tx, studentId, actor);

    // Same request again (double tap, retry on a bad network) is a success.
    const existing = await tx.execute<{ id: string; slot_id: string; ref_code: string }>(sql`
      select id, slot_id, ref_code from bookings
      where meeting_id = ${slot.meeting_id} and teacher_id = ${slot.teacher_id}
        and student_id = ${studentId} and status = 'booked'`);
    if (existing.rows[0]) {
      const b = existing.rows[0];
      if (b.slot_id === slotId) return { ok: true, bookingId: b.id, refCode: b.ref_code, slotId, unchanged: true };
      throw new Refuse("ALREADY_BOOKED");
    }

    await checkSlot(tx, slotId, student.classSectionId, actor);

    const id = newId();
    const refCode = newRefCode();
    await tx.execute(sql`
      insert into bookings (id, ref_code, slot_id, meeting_id, teacher_id, student_id, source,
                            booked_phone, last_changed_by, class_label_snapshot)
      values (${id}, ${refCode}, ${slotId}, ${slot.meeting_id}, ${slot.teacher_id}, ${studentId},
              ${actor.kind}, ${actor.kind === "parent" ? actor.phone : null}, ${actorLabel(actor)},
              ${student.classLabel})`);
    await audit(tx, {
      ...auditActor(actor),
      action: "booking.create",
      entity: "booking",
      entityId: id,
      detail: { slotId, studentId, meetingId: slot.meeting_id },
    });
    return { ok: true, bookingId: id, refCode, slotId };
  });
}

type BookingRow = {
  id: string;
  ref_code: string;
  slot_id: string;
  meeting_id: string;
  teacher_id: string;
  student_id: string;
  status: string;
  locked: boolean;
};

async function lockBooking(tx: Tx, bookingId: string): Promise<BookingRow> {
  const res = await tx.execute<BookingRow>(sql`
    select id, ref_code, slot_id, meeting_id, teacher_id, student_id, status, locked
    from bookings where id = ${bookingId} for update`);
  if (!res.rows[0]) throw new Refuse("NOT_FOUND");
  return res.rows[0];
}

async function peekBooking(tx: Tx, bookingId: string): Promise<{ meeting_id: string; student_id: string }> {
  const res = await tx.execute<{ meeting_id: string; student_id: string }>(sql`
    select meeting_id, student_id from bookings where id = ${bookingId}`);
  if (!res.rows[0]) throw new Refuse("NOT_FOUND");
  return res.rows[0];
}

/** Moves a booking to another slot. The old slot is released and the new one
 *  claimed in a single UPDATE; if that fails, nothing changes. */
export async function changeSlot(
  db: Db,
  input: { bookingId: string; newSlotId: string; actor: Actor; changeLimit?: number },
): Promise<BookingOutcome> {
  const { bookingId, newSlotId, actor } = input;
  const limit = input.changeLimit ?? DEFAULT_CHANGE_LIMIT;
  return run<BookingOutcome>(db, async (tx) => {
    const peek = await peekBooking(tx, bookingId);
    await checkMeeting(tx, peek.meeting_id, actor);
    const student = await checkStudent(tx, peek.student_id, actor);
    const booking = await lockBooking(tx, bookingId);
    if (booking.status !== "booked") throw new Refuse("NOT_FOUND");
    if (booking.slot_id === newSlotId) {
      return { ok: true, bookingId, refCode: booking.ref_code, slotId: newSlotId, unchanged: true };
    }
    if (actor.kind === "parent") {
      if (booking.locked) throw new Refuse("LOCKED");
      if ((await parentMoves(tx, booking.meeting_id, booking.student_id)) >= limit) throw new Refuse("CHANGE_LIMIT");
    }
    const target = await findSlot(tx, newSlotId);
    if (target.meeting_id !== booking.meeting_id || target.teacher_id !== booking.teacher_id) {
      throw new Refuse("NOT_ALLOWED");
    }
    await checkSlot(tx, newSlotId, student.classSectionId, actor);

    await tx.execute(sql`
      update bookings
      set slot_id = ${newSlotId},
          change_count = change_count + ${actor.kind === "parent" ? 1 : 0},
          last_changed_by = ${actorLabel(actor)},
          time_changed_at = null,
          attendance = 'pending',
          updated_at = now()
      where id = ${bookingId} and status = 'booked'`);
    await audit(tx, {
      ...auditActor(actor),
      action: "booking.change",
      entity: "booking",
      entityId: bookingId,
      detail: { from: booking.slot_id, to: newSlotId, studentId: booking.student_id },
    });
    return { ok: true, bookingId, refCode: booking.ref_code, slotId: newSlotId };
  });
}

export async function cancelBooking(
  db: Db,
  input: { bookingId: string; actor: Actor; reason?: string; changeLimit?: number },
): Promise<CancelOutcome> {
  const { bookingId, actor } = input;
  const limit = input.changeLimit ?? DEFAULT_CHANGE_LIMIT;
  return run<CancelOutcome>(db, async (tx) => {
    const peek = await peekBooking(tx, bookingId);
    await checkMeeting(tx, peek.meeting_id, actor);
    await checkStudent(tx, peek.student_id, actor);
    const booking = await lockBooking(tx, bookingId);
    if (booking.status !== "booked") return { ok: true }; // already cancelled: nothing to do
    if (actor.kind === "parent") {
      if (booking.locked) throw new Refuse("LOCKED");
      if ((await parentMoves(tx, booking.meeting_id, booking.student_id)) >= limit) throw new Refuse("CHANGE_LIMIT");
    }
    await tx.execute(sql`
      update bookings
      set status = 'cancelled', cancelled_at = now(),
          cancelled_by = ${actor.kind === "parent" ? "parent" : "school"},
          cancel_reason = ${input.reason ?? null},
          last_changed_by = ${actorLabel(actor)}, updated_at = now()
      where id = ${bookingId}`);
    await audit(tx, {
      ...auditActor(actor),
      action: "booking.cancel",
      entity: "booking",
      entityId: bookingId,
      detail: { slotId: booking.slot_id, studentId: booking.student_id, reason: input.reason ?? null },
    });
    return { ok: true };
  });
}

/**
 * Cancels bookings on the school's side (session cancelled, child archived or
 * moved class, slot blocked). Runs inside the caller's transaction and returns
 * the ids it cancelled so the caller can list who to tell.
 */
export async function cancelBySchool(
  tx: Tx,
  where: { bookingIds?: string[]; slotIds?: string[]; studentIds?: string[]; futureOnly?: boolean },
  reason: string,
  actor: { actorType: "admin" | "system"; actor?: string | null; ip?: string | null },
): Promise<string[]> {
  const filters = [sql`b.status = 'booked'`];
  if (where.bookingIds) {
    if (where.bookingIds.length === 0) return [];
    filters.push(sql`b.id in ${where.bookingIds}`);
  }
  if (where.slotIds) {
    if (where.slotIds.length === 0) return [];
    filters.push(sql`b.slot_id in ${where.slotIds}`);
  }
  if (where.studentIds) {
    if (where.studentIds.length === 0) return [];
    filters.push(sql`b.student_id in ${where.studentIds}`);
  }
  if (where.futureOnly) {
    filters.push(sql`exists (select 1 from slots s where s.id = b.slot_id and s.starts_at > now())`);
  }
  const res = await tx.execute<{ id: string }>(sql`
    update bookings b
    set status = 'cancelled', cancelled_at = now(), cancelled_by = 'school',
        cancel_reason = ${reason}, last_changed_by = 'school', updated_at = now()
    where ${sql.join(filters, sql` and `)}
    returning b.id`);
  const ids = res.rows.map((r) => r.id);
  if (ids.length > 0) {
    await audit(tx, { ...actor, action: "booking.cancel_by_school", entity: "booking", detail: { ids, reason } });
  }
  return ids;
}

/** Undo for an accidental school-side cancellation. Fails if the slot or the
 *  child's allowance has been used since. */
export async function restoreBooking(
  db: Db,
  input: { bookingId: string; actor: Extract<Actor, { kind: "admin" }> },
): Promise<CancelOutcome> {
  return run<CancelOutcome>(db, async (tx) => {
    const peek = await peekBooking(tx, input.bookingId);
    await checkMeeting(tx, peek.meeting_id, input.actor);
    const student = await checkStudent(tx, peek.student_id, input.actor);
    const booking = await lockBooking(tx, input.bookingId);
    if (booking.status === "booked") return { ok: true };
    await checkSlot(tx, booking.slot_id, student.classSectionId, input.actor);
    await tx.execute(sql`
      update bookings
      set status = 'booked', cancelled_at = null, cancelled_by = null, cancel_reason = null,
          last_changed_by = 'school', updated_at = now()
      where id = ${input.bookingId}`);
    await audit(tx, {
      ...auditActor(input.actor),
      action: "booking.restore",
      entity: "booking",
      entityId: input.bookingId,
    });
    return { ok: true };
  });
}

export async function setBookingLocked(db: Db, bookingId: string, locked: boolean, adminId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`update bookings set locked = ${locked}, updated_at = now() where id = ${bookingId}`);
    await audit(tx, {
      actorType: "admin",
      actor: adminId,
      action: locked ? "booking.lock" : "booking.unlock",
      entity: "booking",
      entityId: bookingId,
    });
  });
}

/** Attendance can be marked from the meeting day until seven days after. */
export async function setAttendance(
  db: Db,
  input: {
    bookingId: string;
    attendance: "pending" | "attended" | "no_show";
    /** Restricts the update to this teacher's bookings (teacher link). */
    teacherId?: string;
    actor: { actorType: "admin" | "teacher"; actor: string; ip?: string | null };
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const res = await tx.execute(sql`
      update bookings b
      set attendance = ${input.attendance}, updated_at = now()
      from slots s
      where b.id = ${input.bookingId} and s.id = b.slot_id and b.status = 'booked'
        and ${input.teacherId ? sql`b.teacher_id = ${input.teacherId}` : sql`true`}
        and (s.starts_at at time zone 'Asia/Kolkata')::date <= (now() at time zone 'Asia/Kolkata')::date
        and s.starts_at > now() - interval '8 days'
      returning b.id`);
    if (res.rows.length === 0) return false;
    await audit(tx, {
      ...input.actor,
      action: "booking.attendance",
      entity: "booking",
      entityId: input.bookingId,
      detail: { attendance: input.attendance },
    });
    return true;
  });
}
