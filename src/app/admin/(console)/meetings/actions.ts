"use server";

import { getDb } from "@/db/client";
import { bookSlot, cancelBooking, changeSlot, setBookingLocked } from "@/domain/booking";
import {
  cancelMeeting,
  cancelSession,
  createMeeting,
  defaultCloseTime,
  deleteDraftMeeting,
  duplicateMeeting,
  postponeMeeting,
  publishMeeting,
  restoreSession,
  setSlotBlocked,
  substituteTeacher,
  updateDraftMeeting,
  updateMeetingDetails,
  updateSession,
  type MeetingInput,
} from "@/domain/meetings";
import { fromLocalInput, isValidDate, parseTime } from "@/domain/time";
import { back, str } from "@/lib/admin-action";
import { requireAdmin } from "@/lib/authz";
import { clientIp } from "@/lib/request";
import { t } from "@/lib/strings";

async function who() {
  const admin = await requireAdmin();
  return { adminId: admin.id, ip: await clientIp() };
}

const page = (id: string) => `/admin/meetings/${id}`;

function readMeetingForm(form: FormData): { input: MeetingInput } | { error: string } {
  const date = str(form, "date", 10);
  const startMin = parseTime(str(form, "start", 8));
  const endMin = parseTime(str(form, "end", 8));
  const bs = str(form, "breakStart", 8);
  const be = str(form, "breakEnd", 8);
  if (!isValidDate(date)) return { error: "Choose a valid meeting date." };
  if (startMin === null || endMin === null) return { error: "Choose the start and end times." };
  const opens = str(form, "opens", 20);
  const closes = str(form, "closes", 20);
  const now = new Date();
  const bookingOpensAt = opens ? fromLocalInput(opens) : now;
  const bookingClosesAt = closes ? fromLocalInput(closes) : defaultCloseTime(date, now);
  if (!bookingOpensAt || !bookingClosesAt) return { error: "The booking opening or closing time is not valid." };
  return {
    input: {
      title: str(form, "title", 120),
      date,
      startMin,
      endMin,
      slotMinutes: Number(str(form, "slotMinutes", 3)),
      gapMinutes: Number(str(form, "gapMinutes", 3) || "0"),
      breakStartMin: bs ? parseTime(bs) : null,
      breakEndMin: be ? parseTime(be) : null,
      venue: str(form, "venue", 200),
      parentNote: str(form, "parentNote", 600),
      bookingOpensAt,
      bookingClosesAt,
      sectionIds: form.getAll("sections").map(String).slice(0, 100),
    },
  };
}

export async function createMeetingAction(form: FormData) {
  const actor = await who();
  const parsed = readMeetingForm(form);
  if ("error" in parsed) back("/admin/meetings/new", "error", parsed.error);
  const res = await createMeeting(getDb(), parsed.input, actor);
  if (!res.ok) back("/admin/meetings/new", "error", res.error);
  back(page(res.id), "ok", "Draft saved. Check each teacher's slots below, then publish.");
}

export async function updateDraftAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const parsed = readMeetingForm(form);
  if ("error" in parsed) back(`${page(id)}/edit`, "error", parsed.error);
  const res = await updateDraftMeeting(getDb(), id, parsed.input, actor);
  if (!res.ok) back(`${page(id)}/edit`, "error", res.error);
  back(page(id), "ok", "Draft rebuilt with the new set-up.");
}

export async function updateDetailsAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const opens = fromLocalInput(str(form, "opens", 20));
  const closes = fromLocalInput(str(form, "closes", 20));
  if (!opens || !closes) back(`${page(id)}/edit`, "error", "The booking opening or closing time is not valid.");
  const res = await updateMeetingDetails(
    getDb(),
    id,
    {
      title: str(form, "title", 120),
      venue: str(form, "venue", 200),
      parentNote: str(form, "parentNote", 600),
      bookingOpensAt: opens,
      bookingClosesAt: closes,
      paused: form.get("paused") === "on",
      pausedMessage: str(form, "pausedMessage", 300),
    },
    Number(str(form, "version", 10)),
    actor,
  );
  if (!res.ok) back(`${page(id)}/edit`, "error", res.error);
  back(page(id), "ok", "Saved.");
}

export async function publishAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const res = await publishMeeting(getDb(), id, actor);
  back(page(id), res.ok ? "ok" : "error", res.ok ? "Published. Share the parent link in your class groups." : res.error);
}

export async function deleteDraftAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const res = await deleteDraftMeeting(getDb(), id, actor);
  if (!res.ok) back(page(id), "error", res.error);
  back("/admin/meetings", "ok", "Draft deleted.");
}

export async function postponeAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const res = await postponeMeeting(getDb(), id, str(form, "date", 10), actor);
  back(
    page(id),
    res.ok ? "ok" : "error",
    res.ok ? "Meeting moved. Bookings are kept; tell parents the new date with the message below." : res.error,
  );
}

export async function cancelMeetingAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  if (str(form, "confirm", 20).toUpperCase() !== "CANCEL") back(page(id), "error", "Type CANCEL to confirm cancelling the meeting.");
  const res = await cancelMeeting(getDb(), id, str(form, "message", 300), actor);
  back(page(id), res.ok ? "ok" : "error", res.ok ? `Meeting cancelled. ${res.cancelled} bookings were cancelled.` : res.error);
}

export async function duplicateAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const date = str(form, "date", 10);
  if (!isValidDate(date)) back(page(id), "error", "Choose a valid date for the copy.");
  const res = await duplicateMeeting(getDb(), id, date, actor);
  if (!res.ok) back(page(id), "error", res.error);
  back(page(res.id), "ok", "Copied as a new draft. Check it, then publish.");
}

export async function updateSessionAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const sessionId = str(form, "sessionId", 40);
  const startMin = parseTime(str(form, "start", 8));
  const endMin = parseTime(str(form, "end", 8));
  const date = str(form, "date", 10);
  if (startMin === null || endMin === null) back(page(id), "error", "Choose the start and end times.");
  const edit = {
    date,
    startMin,
    endMin,
    slotMinutes: Number(str(form, "slotMinutes", 3)),
    gapMinutes: Number(str(form, "gapMinutes", 3) || "0"),
    room: str(form, "room", 80),
  };
  const res = await updateSession(getDb(), sessionId, edit, actor, form.get("confirm") === "1");
  if (res.ok) {
    back(page(id), "ok", res.cancelled?.length ? `Timings changed. ${res.cancelled.length} bookings were cancelled; see "Needs a new time" below.` : "Timings changed.");
  }
  if ("needsConfirm" in res) {
    const q = new URLSearchParams({
      op: "session",
      session: sessionId,
      date,
      start: str(form, "start", 8),
      end: str(form, "end", 8),
      slotMinutes: String(edit.slotMinutes),
      gapMinutes: String(edit.gapMinutes),
      room: edit.room,
    });
    back(`${page(id)}/confirm?${q.toString()}`, "error", "Some booked slots fall outside the new timings.");
  }
  back(page(id), "error", res.error);
}

export async function blockSlotAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const slotId = str(form, "slotId", 40);
  const blocked = form.get("blocked") === "1";
  const res = await setSlotBlocked(getDb(), slotId, blocked, actor, form.get("confirm") === "1");
  if (res.ok) back(page(id), "ok", blocked ? "Slot blocked." : "Slot re-opened.");
  if ("needsConfirm" in res) back(`${page(id)}/confirm?op=block&slot=${slotId}`, "error", "That slot is booked.");
  back(page(id), "error", res.error);
}

export async function cancelSessionAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const sessionId = str(form, "sessionId", 40);
  const res = await cancelSession(getDb(), sessionId, actor, form.get("confirm") === "1");
  if (res.ok) back(page(id), "ok", `Session cancelled${res.cancelled?.length ? `, with ${res.cancelled.length} bookings` : ""}. You can undo this with Restore.`);
  if ("needsConfirm" in res) back(`${page(id)}/confirm?op=cancelSession&session=${sessionId}`, "error", "This session has bookings.");
  back(page(id), "error", res.error);
}

export async function restoreSessionAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const res = await restoreSession(getDb(), str(form, "sessionId", 40), actor);
  back(page(id), res.ok ? "ok" : "error", res.ok ? `Session restored, with ${res.restored} bookings put back.` : res.error);
}

export async function substituteAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const res = await substituteTeacher(getDb(), str(form, "sessionId", 40), str(form, "teacherId", 40), actor);
  back(page(id), res.ok ? "ok" : "error", res.ok ? "Teacher changed. All bookings stay as they are." : res.error);
}

const adminActor = (a: { adminId: string; ip: string }) => ({ kind: "admin" as const, adminId: a.adminId, ip: a.ip });

export async function adminBookAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const studentId = str(form, "studentId", 40);
  if (!studentId) back(page(id), "error", "Choose a child.");
  const res = await bookSlot(getDb(), { slotId: str(form, "slotId", 40), studentId, actor: adminActor(actor) });
  back(page(id), res.ok ? "ok" : "error", res.ok ? `Booked. Ref ${res.refCode}.` : t.errors[res.code]);
}

export async function adminMoveAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const res = await changeSlot(getDb(), {
    bookingId: str(form, "bookingId", 40),
    newSlotId: str(form, "slotId", 40),
    actor: adminActor(actor),
  });
  back(page(id), res.ok ? "ok" : "error", res.ok ? "Booking moved." : t.errors[res.code]);
}

export async function adminCancelBookingAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const res = await cancelBooking(getDb(), {
    bookingId: str(form, "bookingId", 40),
    actor: adminActor(actor),
    reason: str(form, "reason", 200) || "Cancelled by the school office",
  });
  back(page(id), res.ok ? "ok" : "error", res.ok ? "Booking cancelled. The slot is free again." : t.errors[res.code]);
}

export async function lockBookingAction(form: FormData) {
  const actor = await who();
  const id = str(form, "meetingId", 40);
  const locked = form.get("locked") === "1";
  await setBookingLocked(getDb(), str(form, "bookingId", 40), locked, actor.adminId);
  back(page(id), "ok", locked ? "Booking locked: parents can no longer change it." : "Booking unlocked.");
}
