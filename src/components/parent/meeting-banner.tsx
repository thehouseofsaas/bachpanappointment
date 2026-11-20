import { SleepingSunArt, WavingCloudArt } from "@/components/art";
import { Card, Notice } from "@/components/ui/bits";
import type { MeetingView } from "@/domain/parent-view";
import { formatDate, formatDayTime } from "@/domain/time";
import { t } from "@/lib/strings";

/** What, when and where, plus the booking state in words. */
export function MeetingBanner({ meeting }: { meeting: MeetingView }) {
  const m = meeting;
  return (
    <Card tone="grape" className="relative overflow-hidden">
      <p className="text-sm font-bold tracking-wide text-grape-ink uppercase">{m.title}</p>
      <p className="mt-0.5 font-display text-3xl font-extrabold">{formatDate(m.date)}</p>
      {m.venue ? <p className="mt-1 font-semibold text-muted">📍 {m.venue}</p> : null}
      {m.dateChanged && m.phase !== "cancelled" ? (
        <Notice kind="warn" className="mt-3">
          {t.landing.dateChanged(formatDate(m.date))}
        </Notice>
      ) : null}
      {m.phase === "open" ? (
        <p className="mt-2 font-semibold text-leaf-ink">⏰ {t.landing.closesOn(formatDayTime(m.closesAt))}</p>
      ) : null}
      {m.phase === "not_open" ? (
        <div className="mt-3 flex items-center gap-3">
          <SleepingSunArt size={96} />
          <p className="font-display text-lg font-bold">{t.landing.opensOn(formatDayTime(m.opensAt))}</p>
        </div>
      ) : null}
      {m.phase === "closed" ? (
        <div className="mt-3 flex items-center gap-3">
          <WavingCloudArt size={96} />
          <p className="font-display text-lg font-bold">{t.landing.closed}</p>
        </div>
      ) : null}
      {m.phase === "paused" ? (
        <Notice kind="warn" className="mt-3">
          {m.pausedMessage || t.landing.paused}
        </Notice>
      ) : null}
      {m.phase === "cancelled" ? (
        <Notice kind="bad" className="mt-3">
          {m.cancelMessage || t.landing.cancelled}
        </Notice>
      ) : null}
      {m.parentNote && m.phase !== "cancelled" ? (
        <p className="mt-3 whitespace-pre-line rounded-2xl bg-grape-soft px-3 py-2 text-grape-ink">{m.parentNote}</p>
      ) : null}
    </Card>
  );
}
