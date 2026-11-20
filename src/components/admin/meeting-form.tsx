import { adminInput, adminLabel, Panel } from "@/components/admin/frame";
import { SubmitButton } from "@/components/ui/submit-button";

export type MeetingFormValues = {
  meetingId?: string;
  title: string;
  date: string;
  start: string;
  end: string;
  slotMinutes: number;
  gapMinutes: number;
  breakStart: string;
  breakEnd: string;
  venue: string;
  parentNote: string;
  opens: string;
  closes: string;
  sectionIds: string[];
};

export type SectionOption = { id: string; label: string; teacher: string | null; children: number };

/** Set-up form for a new meeting or a draft. No JavaScript needed. */
export function MeetingForm({
  action,
  values,
  sections,
  minDate,
  submitLabel,
}: {
  action: (form: FormData) => Promise<void>;
  values: MeetingFormValues;
  sections: SectionOption[];
  minDate: string;
  submitLabel: string;
}) {
  const f = values;
  return (
    <form action={action} className="space-y-4">
      {f.meetingId ? <input type="hidden" name="meetingId" value={f.meetingId} /> : null}
      <Panel title="What and when">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className={adminLabel}>Title</label>
            <input id="title" name="title" required maxLength={120} defaultValue={f.title} className={adminInput} />
          </div>
          <div>
            <label htmlFor="date" className={adminLabel}>Meeting date</label>
            <input id="date" name="date" type="date" required min={minDate} defaultValue={f.date} className={adminInput} />
          </div>
          <div>
            <label htmlFor="venue" className={adminLabel}>Venue (optional)</label>
            <input id="venue" name="venue" maxLength={200} defaultValue={f.venue} className={adminInput} />
          </div>
          <div>
            <label htmlFor="start" className={adminLabel}>First slot starts</label>
            <input id="start" name="start" type="time" required defaultValue={f.start} className={adminInput} />
          </div>
          <div>
            <label htmlFor="end" className={adminLabel}>Last slot ends by</label>
            <input id="end" name="end" type="time" required defaultValue={f.end} className={adminInput} />
          </div>
          <div>
            <label htmlFor="slotMinutes" className={adminLabel}>Minutes per parent</label>
            <input id="slotMinutes" name="slotMinutes" type="number" inputMode="numeric" min={5} max={60} required defaultValue={f.slotMinutes} className={adminInput} />
          </div>
          <div>
            <label htmlFor="gapMinutes" className={adminLabel}>Gap between parents (minutes)</label>
            <input id="gapMinutes" name="gapMinutes" type="number" inputMode="numeric" min={0} max={30} defaultValue={f.gapMinutes} className={adminInput} />
          </div>
          <div>
            <label htmlFor="breakStart" className={adminLabel}>Break from (optional)</label>
            <input id="breakStart" name="breakStart" type="time" defaultValue={f.breakStart} className={adminInput} />
          </div>
          <div>
            <label htmlFor="breakEnd" className={adminLabel}>Break until</label>
            <input id="breakEnd" name="breakEnd" type="time" defaultValue={f.breakEnd} className={adminInput} />
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          Every teacher starts with these timings. After saving you can change one teacher&apos;s timings, room or date on
          the meeting page.
        </p>
      </Panel>

      <Panel title="Booking window">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="opens" className={adminLabel}>Parents can book from</label>
            <input id="opens" name="opens" type="datetime-local" defaultValue={f.opens} className={adminInput} />
            <p className="mt-1 text-sm text-muted">Leave empty to open as soon as you publish.</p>
          </div>
          <div>
            <label htmlFor="closes" className={adminLabel}>Booking closes at</label>
            <input id="closes" name="closes" type="datetime-local" defaultValue={f.closes} className={adminInput} />
            <p className="mt-1 text-sm text-muted">Leave empty for 8 pm the evening before. Times are India time.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="parentNote" className={adminLabel}>Note to parents (optional)</label>
            <textarea id="parentNote" name="parentNote" rows={2} maxLength={600} defaultValue={f.parentNote} className={`${adminInput} py-2`} />
          </div>
        </div>
      </Panel>

      <Panel title="Classes taking part">
        {sections.length === 0 ? (
          <p>No classes yet. Upload the roster first.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {sections.map((s) => (
              <li key={s.id}>
                <label className={`flex min-h-11 items-center gap-3 rounded-xl border-2 border-line px-3 py-2 ${s.teacher ? "" : "opacity-70"}`}>
                  <input
                    type="checkbox"
                    name="sections"
                    value={s.id}
                    defaultChecked={f.sectionIds.includes(s.id) && !!s.teacher}
                    disabled={!s.teacher}
                    className="size-5"
                  />
                  <span>
                    <span className="font-bold">{s.label}</span>{" "}
                    <span className="text-sm text-muted">
                      {s.teacher ? `${s.teacher} · ${s.children} children` : "no class teacher — set one under Classes & teachers"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
