import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { CopyField } from "@/components/admin/copy-field";
import { adminInput, adminLabel, AdminFrame, AdminLoading, Flash, Panel, td, th } from "@/components/admin/frame";
import { PHASE_TONE } from "@/components/admin/phase";
import { Notice, Pill } from "@/components/ui/bits";
import { Button, LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { getMeetingDetail, PHASE_LABEL, type MeetingDetail, type SessionDetail } from "@/domain/admin-view";
import { formatPhone } from "@/domain/phone";
import { capacityAdvice } from "@/domain/slots";
import { formatDate, formatDayTime, formatTime, istDate, istParts, minutesToTime, parseTime } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";
import { sessionSecret } from "@/lib/env";
import { teacherLinkToken } from "@/lib/links";
import { siteOrigin } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { whatsappChatUrl } from "@/lib/share";
import {
  adminBookAction,
  adminCancelBookingAction,
  adminMoveAction,
  blockSlotAction,
  cancelMeetingAction,
  cancelSessionAction,
  deleteDraftAction,
  duplicateAction,
  lockBookingAction,
  postponeAction,
  publishAction,
  restoreSessionAction,
  substituteAction,
  updateSessionAction,
} from "../actions";

export const metadata: Metadata = { title: "Meeting" };

export default function Page(props: PageProps<"/admin/meetings/[id]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Content {...props} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const smallBtn = "min-h-9 cursor-pointer rounded-lg border-2 border-line bg-paper px-2.5 text-sm font-bold";

async function Content({ params, searchParams }: PageProps<"/admin/meetings/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const m = await getMeetingDetail(db, id);
  if (!m) notFound();
  const [settings, origin, teachers] = await Promise.all([
    getSettings(db),
    siteOrigin(),
    db.execute<{ id: string; name: string }>(sql`select id, name from teachers where active order by name`),
  ]);
  const parentLink = `${origin}/m/${m.slug}`;
  const live = m.status === "published";
  const editable = m.status !== "cancelled";
  const day = formatDate(m.date);

  const groupMessage = `${settings.schoolName}: ${m.title} on ${day}.\nPlease book your time with your child's class teacher here:\n${parentLink}\nBooking closes ${formatDayTime(m.closesAt)}.`;
  const movedMessage = `${settings.schoolName}: the ${m.title} has moved to ${day}. Your booked time stays the same. To change it, open:\n${parentLink}`;
  const reminder = (child: string) =>
    `Dear parent, a gentle reminder from ${settings.schoolName} to book ${child.split(" ")[0]}'s ${m.title} time (${day}):\n${parentLink}`;
  const rebook = (child: string) =>
    `Dear parent, ${child.split(" ")[0]}'s earlier ${m.title} time had to be cancelled by ${settings.schoolName}. Please pick a new time (${day}):\n${parentLink}`;

  const bookSlotId = one(sp.book);
  const moveBookingId = one(sp.move);
  const bookTarget = bookSlotId ? findSlot(m, bookSlotId) : null;
  const moveTarget = moveBookingId ? findBooking(m, moveBookingId) : null;

  return (
    <AdminFrame
      admin={admin}
      title={m.title}
      current="/admin/meetings"
      back={{ href: "/admin/meetings", label: "Meetings" }}
      actions={
        <>
          {editable ? (
            <LinkButton href={`/admin/meetings/${m.id}/edit`} variant="secondary" size="sm">
              {m.status === "draft" ? "Edit set-up" : "Edit details / pause"}
            </LinkButton>
          ) : null}
          {m.status !== "draft" ? (
            <>
              <LinkButton href={`/admin/meetings/${m.id}/print`} variant="secondary" size="sm">
                Print sheets
              </LinkButton>
              <a href={`/admin/meetings/${m.id}/export`} className={`${smallBtn} inline-flex items-center no-underline`}>
                Download CSV
              </a>
            </>
          ) : null}
        </>
      }
    >
      <Flash ok={sp.ok} error={sp.error} />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Pill tone={PHASE_TONE[m.phase]}>{PHASE_LABEL[m.phase]}</Pill>
          <p className="font-display text-2xl font-extrabold">{day}</p>
          {m.venue ? <p className="text-muted">📍 {m.venue}</p> : null}
        </div>
        <p className="mt-2 text-muted">
          Booking opens {formatDayTime(m.opensAt)} · closes {formatDayTime(m.closesAt)} (India time)
        </p>
        <p className="mt-2 text-lg">
          <strong>{m.totals.booked}</strong> of <strong>{m.totals.children}</strong> children booked ·{" "}
          <strong>{m.totals.unbooked}</strong> still to book · {m.totals.capacity} slots in all
        </p>
        {m.status === "draft" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <form action={publishAction}>
              <input type="hidden" name="meetingId" value={m.id} />
              <SubmitButton>Publish</SubmitButton>
            </form>
            <form action={deleteDraftAction}>
              <input type="hidden" name="meetingId" value={m.id} />
              <SubmitButton variant="danger" size="sm">
                Delete draft
              </SubmitButton>
            </form>
            <p className="text-sm text-muted">Parents cannot see a draft. Check the slots below first.</p>
          </div>
        ) : null}
        {m.status === "cancelled" ? (
          <Notice kind="bad" className="mt-3">
            This meeting is cancelled. Parents see: “{m.cancelMessage || "This meeting has been cancelled."}”
          </Notice>
        ) : null}
        {m.paused && live ? (
          <Notice kind="warn" className="mt-3">
            Booking is paused. Parents see: “{m.pausedMessage || "Booking is paused for a moment."}”
          </Notice>
        ) : null}
      </Panel>

      {bookTarget && !bookTarget.slot.booking ? (
        <Panel title={`Book ${formatTime(bookTarget.slot.startsAt)} with ${bookTarget.session.teacherName}`} className="mb-4 border-sunshine-deep!">
          {bookTarget.session.unbooked.length === 0 ? (
            <p>Every child in this teacher&apos;s classes already has a time.</p>
          ) : (
            <form action={adminBookAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="meetingId" value={m.id} />
              <input type="hidden" name="slotId" value={bookTarget.slot.id} />
              <div className="min-w-56 flex-1">
                <label htmlFor="studentId" className={adminLabel}>
                  Child
                </label>
                <select id="studentId" name="studentId" required className={adminInput} defaultValue="">
                  <option value="" disabled>
                    Choose a child…
                  </option>
                  {bookTarget.session.unbooked.map((u) => (
                    <option key={u.studentId} value={u.studentId}>
                      {u.name} ({u.classLabel})
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton>Book this time</SubmitButton>
              <Link href={`/admin/meetings/${m.id}`} className="font-bold">
                Never mind
              </Link>
            </form>
          )}
        </Panel>
      ) : null}

      {moveTarget ? (
        <Panel title={`Move ${moveTarget.slot.booking!.studentName} (now ${formatTime(moveTarget.slot.startsAt)})`} className="mb-4 border-sunshine-deep!">
          <form action={adminMoveAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="meetingId" value={m.id} />
            <input type="hidden" name="bookingId" value={moveTarget.slot.booking!.id} />
            <div className="min-w-56 flex-1">
              <label htmlFor="slotId" className={adminLabel}>
                New time with {moveTarget.session.teacherName}
              </label>
              <select id="slotId" name="slotId" required className={adminInput} defaultValue="">
                <option value="" disabled>
                  Choose a free time…
                </option>
                {moveTarget.session.slots
                  .filter((s) => s.state === "open" && !s.booking)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatTime(s.startsAt)}
                    </option>
                  ))}
              </select>
            </div>
            <SubmitButton>Move</SubmitButton>
            <Link href={`/admin/meetings/${m.id}`} className="font-bold">
              Never mind
            </Link>
          </form>
        </Panel>
      ) : null}

      {live ? (
        <Panel title="Tell parents" className="mb-4">
          <div className="grid gap-4 md:grid-cols-2">
            <CopyField label="Parent link" value={parentLink} />
            <CopyField label="Message for class WhatsApp groups" value={m.dateChanged ? movedMessage : groupMessage} multiline />
          </div>
        </Panel>
      ) : null}

      <div className="space-y-4">
        {m.sessions.map((s) => (
          <SessionPanel
            key={s.id}
            m={m}
            s={s}
            origin={origin}
            teachers={teachers.rows}
            reminder={reminder}
            rebook={rebook}
          />
        ))}
      </div>

      {m.status === "published" ? (
        <Panel title="Postpone, copy or cancel" className="mt-4">
          <div className="grid gap-6 md:grid-cols-3">
            <form action={postponeAction} className="space-y-2">
              <input type="hidden" name="meetingId" value={m.id} />
              <label htmlFor="postpone-date" className={adminLabel}>
                Move the whole meeting to
              </label>
              <input id="postpone-date" name="date" type="date" required min={istDate(new Date())} className={adminInput} />
              <p className="text-sm text-muted">Times of day and all bookings are kept. Parents see a “date changed” notice.</p>
              <SubmitButton variant="secondary" size="sm">
                Postpone
              </SubmitButton>
            </form>
            <DuplicateForm meetingId={m.id} />
            <form action={cancelMeetingAction} className="space-y-2">
              <input type="hidden" name="meetingId" value={m.id} />
              <label htmlFor="cancel-message" className={adminLabel}>
                Cancel the meeting — message to parents
              </label>
              <input id="cancel-message" name="message" maxLength={300} placeholder="e.g. School is closed on Saturday." className={adminInput} />
              <label htmlFor="cancel-confirm" className={adminLabel}>
                Type CANCEL to confirm
              </label>
              <input id="cancel-confirm" name="confirm" autoComplete="off" className={adminInput} />
              <SubmitButton variant="danger" size="sm">
                Cancel meeting and all bookings
              </SubmitButton>
            </form>
          </div>
        </Panel>
      ) : null}
      {m.status === "cancelled" ? (
        <Panel title="Run it again on another date" className="mt-4">
          <DuplicateForm meetingId={m.id} />
        </Panel>
      ) : null}
    </AdminFrame>
  );
}

function DuplicateForm({ meetingId }: { meetingId: string }) {
  return (
    <form action={duplicateAction} className="space-y-2">
      <input type="hidden" name="meetingId" value={meetingId} />
      <label htmlFor="dup-date" className={adminLabel}>
        Copy this set-up to a new date
      </label>
      <input id="dup-date" name="date" type="date" required className={adminInput} />
      <p className="text-sm text-muted">Creates a new draft with the same classes and timings. No bookings are copied.</p>
      <SubmitButton variant="secondary" size="sm">
        Copy as draft
      </SubmitButton>
    </form>
  );
}

function findSlot(m: MeetingDetail, slotId: string) {
  for (const session of m.sessions) {
    const slot = session.slots.find((x) => x.id === slotId);
    if (slot) return { session, slot };
  }
  return null;
}

function findBooking(m: MeetingDetail, bookingId: string) {
  for (const session of m.sessions) {
    const slot = session.slots.find((x) => x.booking?.id === bookingId);
    if (slot) return { session, slot };
  }
  return null;
}

function SessionPanel({
  m,
  s,
  origin,
  teachers,
  reminder,
  rebook,
}: {
  m: MeetingDetail;
  s: SessionDetail;
  origin: string;
  teachers: Array<{ id: string; name: string }>;
  reminder: (child: string) => string;
  rebook: (child: string) => string;
}) {
  const start = istParts(s.startsAt);
  const end = istParts(s.endsAt);
  const editable = m.status !== "cancelled";
  const live = m.status === "published";
  const bs = m.breakStart ? parseTime(m.breakStart) : null;
  const be = m.breakEnd ? parseTime(m.breakEnd) : null;
  const sameDay = start.date === m.date;
  const advice = capacityAdvice(
    {
      startMin: start.minutes,
      endMin: end.minutes,
      slotMinutes: s.slotMinutes,
      gapMinutes: s.gapMinutes,
      breakStartMin: sameDay && bs != null && be != null && bs >= start.minutes && be <= end.minutes ? bs : null,
      breakEndMin: sameDay && bs != null && be != null && bs >= start.minutes && be <= end.minutes ? be : null,
    },
    s.children,
  );
  const short = s.capacity < s.children;
  const teacherUrl = `${origin}/t/${teacherLinkToken(sessionSecret(), s.teacherId, s.teacherLinkVersion)}`;

  return (
    <Panel className={s.active ? "" : "opacity-80"}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-extrabold">{s.teacherName}</h2>
        <p className="font-bold text-muted">{s.sections.map((x) => x.label).join(", ")}</p>
        {s.room ? <p className="text-muted">· {s.room}</p> : null}
        {!s.active ? <Pill tone="coral">Session cancelled</Pill> : null}
      </div>
      <p className="mt-1 text-muted">
        {sameDay ? "" : `${formatDate(start.date)} · `}
        {formatTime(s.startsAt)} – {formatTime(s.endsAt)} · {s.slotMinutes} min each
        {s.gapMinutes ? ` + ${s.gapMinutes} min gap` : ""} · <strong>{s.booked}</strong> booked of <strong>{s.children}</strong>{" "}
        children · {s.capacity} slots
      </p>
      {s.active && short ? (
        <Notice kind="bad" className="mt-2">
          {s.children} children but only {s.capacity} slots.
          {advice.extendToMin ? ` Extend to ${formatClock(advice.extendToMin)}` : ""}
          {advice.extendToMin && advice.shorterSlotMinutes ? " or" : ""}
          {advice.shorterSlotMinutes ? ` use ${advice.shorterSlotMinutes}-minute slots` : ""}
          {advice.extendToMin || advice.shorterSlotMinutes ? " (Change timings below)." : ""}
        </Notice>
      ) : null}
      {s.active && !short && s.capacity < Math.ceil(s.children * 1.1) && s.children > 0 ? (
        <Notice kind="warn" className="mt-2">
          Just enough slots ({s.capacity} for {s.children} children). Parents will have little choice of time.
        </Notice>
      ) : null}

      {s.active ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse">
            <thead>
              <tr className="border-b-2 border-line">
                <th className={th}>Time</th>
                <th className={th}>Child</th>
                <th className={`${th} no-print`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {s.slots.map((slot) => (
                <tr key={slot.id} id={`slot-${slot.id}`} className="border-b border-line">
                  <td className={`${td} whitespace-nowrap font-bold`}>{formatTime(slot.startsAt)}</td>
                  <td className={td}>
                    {slot.booking ? (
                      <>
                        <Link href={`/admin/roster/${slot.booking.studentId}`} className="font-bold">
                          {slot.booking.studentName}
                        </Link>{" "}
                        <span className="text-muted">
                          ({slot.booking.classLabel}) · ref {slot.booking.refCode}
                          {slot.booking.source === "admin" ? " · booked by office" : ""}
                          {slot.booking.locked ? " · 🔒 locked" : ""}
                          {slot.booking.attendance === "attended" ? " · ✓ attended" : ""}
                          {slot.booking.attendance === "no_show" ? " · ✗ did not come" : ""}
                        </span>
                        <br />
                        <span className="text-sm text-muted">{slot.booking.phones.map(formatPhone).join(", ") || "no phone"}</span>
                      </>
                    ) : slot.state === "blocked" ? (
                      <span className="text-muted">Blocked (break or not available)</span>
                    ) : (
                      <span className="text-leaf-ink">Free</span>
                    )}
                  </td>
                  <td className={`${td} no-print`}>
                    {editable ? (
                      <div className="flex flex-wrap gap-1.5">
                        {slot.booking ? (
                          live ? (
                            <>
                              <Link href={`/admin/meetings/${m.id}?move=${slot.booking.id}`} className={`${smallBtn} inline-flex items-center no-underline`}>
                                Move
                              </Link>
                              <form action={adminCancelBookingAction}>
                                <input type="hidden" name="meetingId" value={m.id} />
                                <input type="hidden" name="bookingId" value={slot.booking.id} />
                                <button type="submit" className={`${smallBtn} text-coral-ink`}>
                                  Cancel
                                </button>
                              </form>
                              <form action={lockBookingAction}>
                                <input type="hidden" name="meetingId" value={m.id} />
                                <input type="hidden" name="bookingId" value={slot.booking.id} />
                                <input type="hidden" name="locked" value={slot.booking.locked ? "0" : "1"} />
                                <button type="submit" className={smallBtn}>
                                  {slot.booking.locked ? "Unlock" : "Lock"}
                                </button>
                              </form>
                            </>
                          ) : null
                        ) : slot.state === "open" ? (
                          <>
                            {live ? (
                              <Link href={`/admin/meetings/${m.id}?book=${slot.id}`} className={`${smallBtn} inline-flex items-center no-underline`}>
                                Book for a child
                              </Link>
                            ) : null}
                            <form action={blockSlotAction}>
                              <input type="hidden" name="meetingId" value={m.id} />
                              <input type="hidden" name="slotId" value={slot.id} />
                              <input type="hidden" name="blocked" value="1" />
                              <button type="submit" className={smallBtn}>
                                Block
                              </button>
                            </form>
                          </>
                        ) : (
                          <form action={blockSlotAction}>
                            <input type="hidden" name="meetingId" value={m.id} />
                            <input type="hidden" name="slotId" value={slot.id} />
                            <input type="hidden" name="blocked" value="0" />
                            <button type="submit" className={smallBtn}>
                              Re-open
                            </button>
                          </form>
                        )}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {s.active && live && s.unbooked.length > 0 ? (
        <details className="mt-3 rounded-xl border-2 border-line p-3" open={s.unbooked.some((u) => u.needsRebooking)}>
          <summary className="cursor-pointer font-bold">
            Not booked yet: {s.unbooked.length}
            {s.unbooked.some((u) => u.needsRebooking) ? " · some need a new time" : ""}
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {s.unbooked.map((u) => (
              <li key={u.studentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Link href={`/admin/roster/${u.studentId}`} className="font-bold">
                  {u.name}
                </Link>
                <span className="text-muted">{u.classLabel}</span>
                {u.needsRebooking ? <Pill tone="tangerine">Needs a new time</Pill> : null}
                <span className="ml-auto flex flex-wrap gap-1.5">
                  {u.phones.length === 0 ? <span className="text-sm text-muted">no phone — book for them</span> : null}
                  {u.phones.map((p) => (
                    <a
                      key={p}
                      href={whatsappChatUrl(p, u.needsRebooking ? rebook(u.name) : reminder(u.name))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${smallBtn} inline-flex items-center border-leaf! text-leaf-ink no-underline`}
                    >
                      💬 {formatPhone(p)}
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {editable ? (
        <details className="no-print mt-3 rounded-xl border-2 border-line p-3">
          <summary className="cursor-pointer font-bold">Teacher tools: timings, substitute, schedule link</summary>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            {s.active ? (
              <form action={updateSessionAction} className="space-y-2">
                <input type="hidden" name="meetingId" value={m.id} />
                <input type="hidden" name="sessionId" value={s.id} />
                <p className="font-bold">Change timings</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className={adminLabel} htmlFor={`d-${s.id}`}>Date</label>
                    <input id={`d-${s.id}`} name="date" type="date" required defaultValue={start.date} className={adminInput} />
                  </div>
                  <div>
                    <label className={adminLabel} htmlFor={`s-${s.id}`}>Starts</label>
                    <input id={`s-${s.id}`} name="start" type="time" required defaultValue={minutesToTime(start.minutes)} className={adminInput} />
                  </div>
                  <div>
                    <label className={adminLabel} htmlFor={`e-${s.id}`}>Ends</label>
                    <input id={`e-${s.id}`} name="end" type="time" required defaultValue={minutesToTime(end.minutes)} className={adminInput} />
                  </div>
                  <div>
                    <label className={adminLabel} htmlFor={`m-${s.id}`}>Minutes each</label>
                    <input id={`m-${s.id}`} name="slotMinutes" type="number" min={5} max={60} required defaultValue={s.slotMinutes} className={adminInput} />
                  </div>
                  <div>
                    <label className={adminLabel} htmlFor={`g-${s.id}`}>Gap</label>
                    <input id={`g-${s.id}`} name="gapMinutes" type="number" min={0} max={30} defaultValue={s.gapMinutes} className={adminInput} />
                  </div>
                  <div className="col-span-2">
                    <label className={adminLabel} htmlFor={`r-${s.id}`}>Room</label>
                    <input id={`r-${s.id}`} name="room" maxLength={80} defaultValue={s.room ?? ""} className={adminInput} />
                  </div>
                </div>
                <p className="text-sm text-muted">
                  {s.booked > 0
                    ? "Slots are booked: you can make the window longer or shorter, but not change the slot length or date."
                    : "No bookings yet: anything can change."}
                </p>
                <SubmitButton variant="secondary" size="sm">
                  Save timings
                </SubmitButton>
              </form>
            ) : null}
            <div className="space-y-5">
              {s.active ? (
                <form action={substituteAction} className="space-y-2">
                  <input type="hidden" name="meetingId" value={m.id} />
                  <input type="hidden" name="sessionId" value={s.id} />
                  <label className={adminLabel} htmlFor={`sub-${s.id}`}>
                    Substitute teacher (bookings stay)
                  </label>
                  <select id={`sub-${s.id}`} name="teacherId" required defaultValue="" className={adminInput}>
                    <option value="" disabled>
                      Choose a teacher…
                    </option>
                    {teachers
                      .filter((t) => t.id !== s.teacherId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                  <SubmitButton variant="secondary" size="sm">
                    Hand over
                  </SubmitButton>
                </form>
              ) : null}
              <form action={s.active ? cancelSessionAction : restoreSessionAction}>
                <input type="hidden" name="meetingId" value={m.id} />
                <input type="hidden" name="sessionId" value={s.id} />
                {s.active ? (
                  <Button type="submit" variant="danger" size="sm">
                    Teacher absent: cancel this session
                  </Button>
                ) : (
                  <Button type="submit" variant="leaf" size="sm">
                    Restore this session and its bookings
                  </Button>
                )}
              </form>
              {live ? <CopyField label={`${s.teacherName}'s private schedule link`} value={teacherUrl} /> : null}
            </div>
          </div>
        </details>
      ) : null}
    </Panel>
  );
}

function formatClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
