import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/(parent)/actions";
import { ClassBadge } from "@/components/art";
import { ChildCard, type ChildCardProps, type SlotProp } from "@/components/parent/child-card";
import { MeetingBanner } from "@/components/parent/meeting-banner";
import { RefreshOnFocus } from "@/components/parent/refresh-on-focus";
import { ParentShell } from "@/components/parent/shell";
import { Card } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/page-loading";
import { getDb } from "@/db/client";
import { parentHome, type ChildMeetingView, type ChildView } from "@/domain/parent-view";
import { formatPhone, phoneTail } from "@/domain/phone";
import { formatDate, formatDayTime, formatTime, istParts } from "@/domain/time";
import { currentParentPhone } from "@/lib/authz";
import { getSettings, type AppSettings } from "@/lib/settings";
import { bookingText, googleCalendarUrl, whatsappShareUrl } from "@/lib/share";
import { t } from "@/lib/strings";
import { asBadge, asTone } from "@/theme/tones";

export const metadata: Metadata = { title: "My bookings" };

function period(at: Date): SlotProp["period"] {
  const m = istParts(at).minutes;
  return m < 12 * 60 ? "morning" : m < 17 * 60 ? "afternoon" : "evening";
}

function cardProps(child: ChildView, v: ChildMeetingView, settings: AppSettings, siteUrl: string, phone: string): ChildCardProps {
  const m = v.meeting;
  const sessionGone = !v.session?.active;
  const phase: ChildCardProps["phase"] = m.phase === "cancelled" ? "cancelled" : sessionGone ? "session_cancelled" : m.phase;
  const phaseMessage =
    phase === "cancelled"
      ? m.cancelMessage || t.landing.cancelled
      : phase === "session_cancelled"
        ? t.my.sessionCancelled
        : phase === "not_open"
          ? t.my.notOpenYet(formatDayTime(m.opensAt))
          : phase === "paused"
            ? m.pausedMessage || t.landing.paused
            : phase === "closed"
              ? v.booking
                ? t.my.closedBooked
                : t.my.closedUnbooked
              : null;

  let booking: ChildCardProps["booking"] = null;
  if (v.booking && v.session) {
    const share = {
      childName: child.firstName,
      classLabel: child.classLabel,
      teacherName: v.session.teacherName,
      startsAt: v.booking.startsAt,
      endsAt: v.booking.endsAt,
      room: v.session.room,
      venue: m.venue,
      refCode: v.booking.refCode,
      schoolName: settings.schoolName,
      meetingTitle: m.title,
    };
    const by = v.booking.lastChangedBy;
    booking = {
      id: v.booking.id,
      time: formatTime(v.booking.startsAt),
      refCode: v.booking.refCode,
      locked: v.booking.locked,
      // Tell the parent if someone else (the other parent, or the office) last touched it.
      lastChanged: by === "school" ? t.my.lastChangedSchool : by && by !== phone ? t.my.lastChanged(phoneTail(by)) : null,
      dateChanged: v.booking.dateChanged,
      waUrl: whatsappShareUrl(bookingText(share, siteUrl)),
      gcalUrl: googleCalendarUrl(share),
      icsUrl: `/my/ics/${v.booking.id}`,
    };
  }

  const hintText = (h: NonNullable<ChildMeetingView["slots"][number]["hint"]>) =>
    h.kind === "clash" ? t.my.clash(h.name) : h.kind === "after" ? t.my.after(h.name) : t.my.before(h.name);

  return {
    child: {
      id: child.id,
      firstName: child.firstName,
      classLabel: child.classLabel,
      tone: asTone(child.color),
      badge: asBadge(child.badge),
    },
    meetingTitle: m.title,
    dayLabel: formatDate(m.date),
    teacherName: v.session?.teacherName ?? "",
    room: v.session?.room ?? null,
    phase,
    phaseMessage,
    booking,
    schoolCancelNotice: v.schoolCancelReason ? t.my.schoolCancelled(v.schoolCancelReason) : null,
    slots: v.slots.map((s) => ({
      id: s.id,
      time: formatTime(s.startsAt),
      period: period(s.startsAt),
      hint: s.hint ? { kind: s.hint.kind, text: hintText(s.hint) } : undefined,
    })),
    movesLeft: v.movesLeft,
  };
}

export default function MyPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <MyBookings />
    </Suspense>
  );
}

async function MyBookings() {
  const phone = await currentParentPhone();
  if (!phone) redirect("/");
  const db = getDb();
  const settings = await getSettings(db);
  const children = await parentHome(db, phone, settings.parentChangeLimit);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const siteUrl = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";

  // Distinct meetings across the children, for the banners at the top.
  const meetings = [...new Map(children.flatMap((c) => c.meetings.map((v) => [v.meeting.id, v.meeting]))).values()];

  return (
    <ParentShell settings={settings} compact>
      <RefreshOnFocus />
      <h1 className="text-3xl font-extrabold">{t.my.title}</h1>

      {meetings.length === 0 ? (
        <Card className="mt-4">
          <p className="font-display text-lg font-bold">{t.landing.noMeeting}</p>
          <p className="text-muted">{t.landing.noMeetingHelp}</p>
        </Card>
      ) : null}

      {meetings.map((m) => (
        <section key={m.id} className="mt-4 space-y-3" aria-label={m.title}>
          <MeetingBanner meeting={m} />
          {children.map((c) => {
            const v = c.meetings.find((x) => x.meeting.id === m.id);
            return v ? <ChildCard key={c.id} {...cardProps(c, v, settings, siteUrl, phone)} /> : null;
          })}
        </section>
      ))}

      {children
        .filter((c) => c.meetings.length === 0)
        .map((c) => (
          <Card key={c.id} tone={asTone(c.color)} className="mt-4 flex items-center gap-3">
            <ClassBadge badge={asBadge(c.badge)} size={52} />
            <div>
              <h2 className="text-2xl font-extrabold">{c.firstName}</h2>
              <p className="font-semibold text-tone-ink">{c.classLabel}</p>
              {meetings.length > 0 ? <p className="text-muted">{t.my.notInMeeting}</p> : null}
            </div>
          </Card>
        ))}

      <form action={signOut} className="mt-6 text-center">
        <p className="text-sm text-muted">Signed in with {formatPhone(phone)}</p>
        <Button type="submit" variant="quiet" size="sm">
          {t.my.switch}
        </Button>
      </form>
    </ParentShell>
  );
}
