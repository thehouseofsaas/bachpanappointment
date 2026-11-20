"use client";

import { useState, useTransition } from "react";
import { bookAction, cancelAction, changeAction, keepTimeAction, type ActionResult } from "@/app/(parent)/actions";
import { ClassBadge, Confetti, Tick } from "@/components/art";
import { Notice, Pill } from "@/components/ui/bits";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { AnchorButton, Button } from "@/components/ui/button";
import { Dots } from "@/components/ui/submit-button";
import { t } from "@/lib/strings";
import type { Badge, Tone } from "@/theme/tones";

export type SlotProp = {
  id: string;
  time: string;
  period: "morning" | "afternoon" | "evening";
  hint?: { kind: "clash" | "after" | "before"; text: string };
};

export type ChildCardProps = {
  child: { id: string; firstName: string; classLabel: string; tone: Tone; badge: Badge };
  meetingTitle: string;
  dayLabel: string;
  teacherName: string;
  room: string | null;
  /** Whether a parent may book, change or cancel right now. */
  phase: "open" | "not_open" | "closed" | "paused" | "cancelled" | "session_cancelled";
  phaseMessage: string | null;
  booking: {
    id: string;
    time: string;
    refCode: string;
    locked: boolean;
    lastChanged: string | null;
    dateChanged: boolean;
    waUrl: string;
    gcalUrl: string;
    icsUrl: string;
  } | null;
  schoolCancelNotice: string | null;
  slots: SlotProp[];
  movesLeft: number;
};

const PERIODS: Array<{ key: SlotProp["period"]; label: string; icon: string }> = [
  { key: "morning", label: t.my.morning, icon: "☀️" },
  { key: "afternoon", label: t.my.afternoon, icon: "⛅" },
  { key: "evening", label: t.my.evening, icon: "🌙" },
];

function RainbowEdge() {
  return (
    <div className="flex h-2" aria-hidden="true">
      {["coral", "tangerine", "sunshine", "leaf", "sky", "grape"].map((c) => (
        <span key={c} className="flex-1" style={{ background: `var(--${c})` }} />
      ))}
    </div>
  );
}

export function ChildCard(p: ChildCardProps) {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<SlotProp | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [pending, startTransition] = useTransition();

  const open = p.phase === "open";
  const canAct = open && p.movesLeft > 0 && !p.booking?.locked;

  function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      let result: ActionResult;
      try {
        result = await action();
      } catch {
        result = { ok: false, code: "BUSY", message: t.errors.BUSY };
      }
      setSelected(null);
      setCancelling(false);
      if (result.ok) onOk?.();
      else {
        setError(result.message);
        // A taken slot: keep the list open so the fresh choices are right there.
        if (result.code !== "SLOT_TAKEN" && result.code !== "SLOT_UNAVAILABLE") setPicking(false);
      }
    });
  }

  const confirmPick = () => {
    if (!selected) return;
    const slotId = selected.id;
    run(
      () => (p.booking ? changeAction(p.booking.id, slotId) : bookAction(slotId, p.child.id)),
      () => {
        setPicking(false);
        setCelebrate((n) => n + 1);
      },
    );
  };

  const header = (
    <div className="flex items-center gap-3">
      <ClassBadge badge={p.child.badge} size={52} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-2xl font-extrabold">{p.child.firstName}</h2>
        <p className="font-semibold text-tone-ink">
          {p.child.classLabel} · {t.my.with} {p.teacherName}
        </p>
      </div>
      {p.booking ? (
        <Pill tone="leaf" className="shrink-0">
          <Tick size={16} /> Booked
        </Pill>
      ) : null}
    </div>
  );

  const slotList =
    p.slots.length === 0 ? (
      <Notice kind="warn" className="mt-3">
        <p>{t.my.noSlots}</p>
        <p className="font-normal">{t.my.noSlotsHelp}</p>
      </Notice>
    ) : (
      <div className="mt-3 space-y-3">
        {PERIODS.map(({ key, label, icon }) => {
          const list = p.slots.filter((s) => s.period === key);
          if (list.length === 0) return null;
          return (
            <section key={key} aria-label={label}>
              <h3 className="mb-1.5 font-display text-base font-bold text-muted">
                <span aria-hidden="true">{icon}</span> {label}
              </h3>
              <ul className="grid grid-cols-3 gap-2">
                {list.map((s) => (
                  <li key={s.id} className={s.hint ? "col-span-3" : ""}>
                    <button
                      type="button"
                      onClick={() => setSelected(s)}
                      disabled={pending}
                      className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 px-2 font-display text-base font-bold sticker sticker-press ${
                        s.hint?.kind === "clash"
                          ? "border-coral bg-coral-soft text-coral-ink [--sticker-edge:var(--coral)]"
                          : s.hint
                            ? "border-leaf bg-leaf-soft text-leaf-ink [--sticker-edge:var(--leaf)]"
                            : "border-tone bg-paper text-navy [--sticker-edge:var(--tone)]"
                      }`}
                    >
                      <span>{s.time}</span>
                      {s.hint ? (
                        <span className="text-sm font-semibold">
                          {s.hint.kind === "clash" ? "⚠ " : "★ "}
                          {s.hint.text}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );

  return (
    <article
      data-tone={p.child.tone}
      className="relative overflow-hidden rounded-card border-2 border-tone bg-paper sticker [--sticker-edge:var(--tone)]"
      aria-busy={pending}
    >
      {celebrate > 0 ? <Confetti key={celebrate} /> : null}
      {p.booking ? <RainbowEdge /> : null}
      <div className="p-4">
        {header}

        {error ? (
          <Notice kind="bad" role="alert" className="mt-3">
            {error}
          </Notice>
        ) : null}
        {p.schoolCancelNotice && !p.booking ? (
          <Notice kind="warn" className="mt-3">
            {p.schoolCancelNotice}
          </Notice>
        ) : null}

        {p.booking ? (
          <div className="mt-3">
            {celebrate > 0 ? (
              <p className="animate-pop font-display text-xl font-extrabold text-leaf-ink" role="status">
                {t.my.booked} {t.my.seeYou(p.dayLabel.split(",")[0])}
              </p>
            ) : null}
            <div className="mt-1 rounded-2xl bg-tone-soft px-4 py-3">
              <p className="font-display text-4xl leading-none font-extrabold text-tone-ink">{p.booking.time}</p>
              <p className="mt-1 text-lg font-bold">{p.dayLabel}</p>
              <p className="text-muted">
                {p.meetingTitle}
                {p.room ? ` · ${p.room}` : ""}
              </p>
              <p className="mt-1 text-sm text-muted">
                {t.my.ref}: <span className="font-bold tracking-wider text-navy">{p.booking.refCode}</span>
              </p>
            </div>
            {p.booking.dateChanged && open ? (
              <Notice kind="warn" className="mt-3">
                <p>{t.my.dateChanged}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled={pending}
                  onClick={() => run(() => keepTimeAction(p.booking!.id))}
                >
                  {t.my.keep}
                </Button>
              </Notice>
            ) : null}
            {p.booking.lastChanged ? <p className="mt-2 text-sm text-muted">{p.booking.lastChanged}</p> : null}

            <div className="mt-3 grid gap-2">
              <AnchorButton href={p.booking.waUrl} target="_blank" rel="noopener noreferrer" variant="leaf" full>
                <span aria-hidden="true">💬</span> {t.my.whatsapp}
              </AnchorButton>
              <AnchorButton href={p.booking.gcalUrl} target="_blank" rel="noopener noreferrer" variant="secondary" full>
                <span aria-hidden="true">📅</span> {t.my.calendar}
              </AnchorButton>
            </div>
            <p className="mt-2 text-center text-sm">
              <a href={p.booking.icsUrl} className="font-semibold text-muted underline underline-offset-4">
                {t.my.ics}
              </a>
            </p>

            {p.booking.locked ? <p className="mt-3 text-sm font-semibold text-muted">{t.my.locked}</p> : null}
            {open && !p.booking.locked && p.movesLeft === 0 ? (
              <p className="mt-3 text-sm font-semibold text-muted">{t.errors.CHANGE_LIMIT}</p>
            ) : null}
            {canAct ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="tone" onClick={() => setPicking((v) => !v)} aria-expanded={picking} disabled={pending}>
                  {picking ? t.my.hide : t.my.change}
                </Button>
                <Button variant="danger" onClick={() => setCancelling(true)} disabled={pending}>
                  {t.my.cancel}
                </Button>
              </div>
            ) : null}
            {!open && p.phaseMessage ? <p className="mt-3 text-sm font-semibold text-muted">{p.phaseMessage}</p> : null}
            {picking && canAct ? slotList : null}
          </div>
        ) : (
          <div className="mt-3">
            {open ? (
              <>
                <p className="font-display text-lg font-bold">{t.my.pick(p.child.firstName)}</p>
                <p className="text-muted">{p.dayLabel}</p>
                {picking || p.slots.length === 0 ? (
                  slotList
                ) : (
                  <Button variant="primary" size="lg" full className="mt-3" onClick={() => setPicking(true)}>
                    {t.my.book} <span aria-hidden="true">→</span>
                  </Button>
                )}
              </>
            ) : (
              <Notice kind={p.phase === "cancelled" || p.phase === "session_cancelled" ? "bad" : "info"}>
                {p.phaseMessage}
              </Notice>
            )}
          </div>
        )}

        {pending ? (
          <p className="mt-3 flex items-center gap-2 font-semibold text-muted" role="status">
            <Dots /> Saving…
          </p>
        ) : null}
      </div>

      <BottomSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={p.booking ? t.my.confirmChangeTitle : t.my.confirmTitle}
      >
        {selected ? (
          <div data-tone={p.child.tone}>
            <div className="rounded-2xl bg-tone-soft px-4 py-3">
              <p className="font-display text-4xl leading-none font-extrabold text-tone-ink">{selected.time}</p>
              <p className="mt-1 text-lg font-bold">{p.dayLabel}</p>
              <p className="text-muted">
                {p.child.firstName} · {p.child.classLabel} · {t.my.with} {p.teacherName}
              </p>
            </div>
            {selected.hint?.kind === "clash" ? (
              <Notice kind="warn" className="mt-3">
                {selected.hint.text}. You can still book it if two of you are coming.
              </Notice>
            ) : null}
            <div className="mt-4 grid gap-2">
              <Button size="lg" full onClick={confirmPick} disabled={pending} aria-busy={pending}>
                {pending ? <Dots /> : p.booking ? t.my.confirmChange : t.my.confirm}
              </Button>
              <Button variant="secondary" full onClick={() => setSelected(null)} disabled={pending}>
                {t.my.back}
              </Button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet open={cancelling} onClose={() => setCancelling(false)} title={t.my.cancelTitle}>
        <p className="text-muted">{t.my.cancelBody}</p>
        <div className="mt-4 grid gap-2">
          <Button
            variant="danger"
            size="lg"
            full
            disabled={pending}
            aria-busy={pending}
            onClick={() => p.booking && run(() => cancelAction(p.booking!.id), () => setPicking(false))}
          >
            {pending ? <Dots /> : t.my.cancelYes}
          </Button>
          <Button variant="secondary" full onClick={() => setCancelling(false)} disabled={pending}>
            {t.my.cancelNo}
          </Button>
        </div>
      </BottomSheet>
    </article>
  );
}
