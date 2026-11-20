import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { OopsArt, Rainbow, Tick } from "@/components/art";
import { PrintButton } from "@/components/admin/copy-field";
import { Card, Notice, Pill } from "@/components/ui/bits";
import { PageLoading } from "@/components/ui/page-loading";
import { getDb } from "@/db/client";
import { findTeacher, teacherSessions, type TeacherSession } from "@/domain/teacher-view";
import { formatDate, formatTime } from "@/domain/time";
import { sessionSecret } from "@/lib/env";
import { parseTeacherLink, verifyTeacherLink } from "@/lib/links";
import { getSettings } from "@/lib/settings";
import { markAttendance } from "./actions";

export const metadata: Metadata = {
  title: "My PTM schedule",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Page({ params }: PageProps<"/t/[link]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Schedule params={params} />
    </Suspense>
  );
}

function Invalid() {
  return (
    <main className="grid min-h-dvh place-items-center bg-cream px-4">
      <Card className="max-w-sm text-center">
        <div className="flex justify-center">
          <OopsArt size={140} />
        </div>
        <h1 className="text-2xl font-extrabold">This link does not work</h1>
        <p className="mt-1 text-muted">It may have been replaced by a newer one. Please ask the school office for your current link.</p>
      </Card>
    </main>
  );
}

async function Schedule({ params }: Pick<PageProps<"/t/[link]">, "params">) {
  const { link } = await params;
  await connection();
  const parsed = parseTeacherLink(link);
  if (!parsed) return <Invalid />;
  const db = getDb();
  const teacher = await findTeacher(db, parsed.teacherId);
  if (!teacher || !teacher.active || !verifyTeacherLink(sessionSecret(), teacher.id, teacher.link_version, parsed.signature)) {
    return <Invalid />;
  }
  const [sessions, settings] = await Promise.all([teacherSessions(db, teacher.id), getSettings(db)]);

  return (
    <div className="min-h-dvh bg-cream">
      <header className="no-print bg-wash">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Rainbow size={72} />
          <div className="min-w-0">
            <p className="text-sm text-muted">{settings.schoolName}</p>
            <h1 className="truncate text-2xl font-extrabold">{teacher.name}</h1>
          </div>
          <div className="ml-auto">
            <PrintButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        <p className="no-print text-sm text-muted">
          🔒 This is your private page. Please don&apos;t forward the link. All times are India time.
        </p>
        {sessions.length === 0 ? (
          <Card>
            <p className="font-display text-lg font-bold">No meeting is scheduled for you right now.</p>
            <p className="text-muted">Your slots will show here once the office publishes the next meeting.</p>
          </Card>
        ) : null}
        {sessions.map((s) => (
          <SessionCard key={s.sessionId} s={s} link={link} teacherName={teacher.name} />
        ))}
      </main>
    </div>
  );
}

function SessionCard({ s, link, teacherName }: { s: TeacherSession; link: string; teacherName: string }) {
  const booked = s.slots.filter((x) => x.booking);
  const came = booked.filter((x) => x.booking!.attendance === "attended").length;
  return (
    <section aria-label={`${s.meetingTitle}, ${formatDate(s.date)}`}>
      <Card tone="grape">
        <p className="hidden text-sm print:block">{teacherName}</p>
        <p className="text-sm font-bold tracking-wide text-grape-ink uppercase">{s.meetingTitle}</p>
        <h2 className="text-2xl font-extrabold">{formatDate(s.date)}</h2>
        <p className="text-muted">
          {[s.room, s.venue].filter(Boolean).join(" · ")}
          {s.room || s.venue ? " · " : ""}
          {booked.length} booked · {s.notBooked.length} not yet
          {s.canMark ? ` · ${came} came` : ""}
        </p>
        {s.cancelled ? (
          <Notice kind="bad" className="mt-3">
            This session has been cancelled by the office.
          </Notice>
        ) : null}
      </Card>

      {!s.cancelled ? (
        <ol className="mt-3 space-y-2">
          {s.slots
            .filter((x) => x.state === "open")
            .map((x) => (
              <li
                key={x.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 px-3 py-2 ${
                  x.booking ? "border-line bg-paper" : "border-dashed border-line bg-transparent"
                }`}
              >
                <span className="w-20 shrink-0 font-display text-lg font-extrabold">{formatTime(x.startsAt)}</span>
                {x.booking ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-bold">{x.booking.childName}</span>
                      <span className="text-sm text-muted">{x.booking.classLabel}</span>
                    </span>
                    {s.canMark ? (
                      <form action={markAttendance} className="no-print flex gap-1.5">
                        <input type="hidden" name="link" value={link} />
                        <input type="hidden" name="bookingId" value={x.booking.id} />
                        <AttendanceButton value="attended" current={x.booking.attendance} label="Came" icon="✓" tone="leaf" />
                        <AttendanceButton value="no_show" current={x.booking.attendance} label="Didn't come" icon="✗" tone="coral" />
                      </form>
                    ) : null}
                    {x.booking.attendance === "attended" ? (
                      <Pill tone="leaf" className="print:hidden">
                        <Tick size={14} /> Came
                      </Pill>
                    ) : null}
                  </>
                ) : (
                  <span className="text-muted">Free</span>
                )}
              </li>
            ))}
        </ol>
      ) : null}

      {!s.cancelled && s.notBooked.length > 0 ? (
        <details className="mt-3 rounded-2xl border-2 border-line bg-paper p-3">
          <summary className="cursor-pointer font-bold">Not booked yet ({s.notBooked.length})</summary>
          <p className="mt-2">{s.notBooked.map((n) => n.name).join(", ")}</p>
        </details>
      ) : null}
    </section>
  );
}

function AttendanceButton({
  value,
  current,
  label,
  icon,
  tone,
}: {
  value: "attended" | "no_show";
  current: string;
  label: string;
  icon: string;
  tone: "leaf" | "coral";
}) {
  const on = current === value;
  return (
    <button
      type="submit"
      name="attendance"
      // Tapping the active choice again clears it.
      value={on ? "pending" : value}
      data-tone={tone}
      aria-pressed={on}
      className={`min-h-11 cursor-pointer rounded-xl border-2 border-tone px-3 text-sm font-bold ${
        on ? "bg-tone-ink text-white" : "bg-tone-soft text-tone-ink"
      }`}
    >
      <span aria-hidden="true">{icon}</span> {label}
    </button>
  );
}
