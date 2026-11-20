import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminInput, adminLabel, AdminFrame, AdminLoading, Flash, Panel } from "@/components/admin/frame";
import { MeetingForm } from "@/components/admin/meeting-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { getMeetingDetail } from "@/domain/admin-view";
import { istDate, toLocalInput } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";
import { updateDetailsAction, updateDraftAction } from "../../actions";
import { sectionOptions } from "../../sections";

export const metadata: Metadata = { title: "Edit meeting" };

export default function Page(props: PageProps<"/admin/meetings/[id]/edit">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Content {...props} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: PageProps<"/admin/meetings/[id]/edit">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const m = await getMeetingDetail(db, id);
  if (!m) notFound();
  const backTo = { href: `/admin/meetings/${m.id}`, label: m.title };

  if (m.status === "draft") {
    const sections = await sectionOptions(db);
    return (
      <AdminFrame admin={admin} title="Edit draft" current="/admin/meetings" back={backTo}>
        <Flash ok={sp.ok} error={sp.error} />
        <p className="mb-4 text-muted">Saving rebuilds every teacher&apos;s slots from these timings.</p>
        <MeetingForm
          action={updateDraftAction}
          submitLabel="Save draft"
          minDate={istDate(new Date())}
          sections={sections}
          values={{
            meetingId: m.id,
            title: m.title,
            date: m.date,
            start: m.defaultStart,
            end: m.defaultEnd,
            slotMinutes: m.slotMinutes,
            gapMinutes: m.gapMinutes,
            breakStart: m.breakStart ?? "",
            breakEnd: m.breakEnd ?? "",
            venue: m.venue ?? "",
            parentNote: m.parentNote ?? "",
            opens: toLocalInput(m.opensAt),
            closes: toLocalInput(m.closesAt),
            sectionIds: m.sessions.flatMap((s) => s.sections.map((x) => x.id)),
          }}
        />
      </AdminFrame>
    );
  }

  return (
    <AdminFrame admin={admin} title="Edit details" current="/admin/meetings" back={backTo}>
      <Flash ok={sp.ok} error={sp.error} />
      <form action={updateDetailsAction} className="space-y-4">
        <input type="hidden" name="meetingId" value={m.id} />
        <input type="hidden" name="version" value={m.version} />
        <Panel title="Details">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="title" className={adminLabel}>Title</label>
              <input id="title" name="title" required maxLength={120} defaultValue={m.title} className={adminInput} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="venue" className={adminLabel}>Venue</label>
              <input id="venue" name="venue" maxLength={200} defaultValue={m.venue ?? ""} className={adminInput} />
            </div>
            <div>
              <label htmlFor="opens" className={adminLabel}>Parents can book from</label>
              <input id="opens" name="opens" type="datetime-local" required defaultValue={toLocalInput(m.opensAt)} className={adminInput} />
            </div>
            <div>
              <label htmlFor="closes" className={adminLabel}>Booking closes at</label>
              <input id="closes" name="closes" type="datetime-local" required defaultValue={toLocalInput(m.closesAt)} className={adminInput} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="parentNote" className={adminLabel}>Note to parents</label>
              <textarea id="parentNote" name="parentNote" rows={2} maxLength={600} defaultValue={m.parentNote ?? ""} className={`${adminInput} py-2`} />
            </div>
          </div>
        </Panel>
        <Panel title="Pause booking">
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="paused" defaultChecked={m.paused} className="size-5" />
            <span className="font-bold">Pause booking for now</span>
          </label>
          <p className="mb-3 text-sm text-muted">Parents see the message below and cannot book, change or cancel until you untick this.</p>
          <label htmlFor="pausedMessage" className={adminLabel}>Message while paused</label>
          <input id="pausedMessage" name="pausedMessage" maxLength={300} defaultValue={m.pausedMessage ?? ""} className={adminInput} />
        </Panel>
        <p className="text-sm text-muted">
          To change timings, use each teacher&apos;s &quot;Change timings&quot; on the meeting page. To change the date, use Postpone.
        </p>
        <SubmitButton>Save</SubmitButton>
      </form>
    </AdminFrame>
  );
}
