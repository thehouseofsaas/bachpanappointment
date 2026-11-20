import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminFrame, AdminLoading, Panel } from "@/components/admin/frame";
import { Notice } from "@/components/ui/bits";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { getMeetingDetail } from "@/domain/admin-view";
import { previewImpact, type Impact } from "@/domain/meetings";
import { formatPhone } from "@/domain/phone";
import { formatTime, parseTime } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";
import { blockSlotAction, cancelSessionAction, updateSessionAction } from "../../actions";

export const metadata: Metadata = { title: "Please confirm" };

export default function Page(props: PageProps<"/admin/meetings/[id]/confirm">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Content {...props} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Second step for changes that would cancel parents' bookings: shows exactly who, then asks. */
async function Content({ params, searchParams }: PageProps<"/admin/meetings/[id]/confirm">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const m = await getMeetingDetail(db, id);
  if (!m) notFound();
  const op = one(sp.op);
  const home = `/admin/meetings/${m.id}`;

  let impact: Impact[] = [];
  let heading = "";
  let button = "";
  let action: ((form: FormData) => Promise<void>) | null = null;
  const hidden: Record<string, string> = { meetingId: m.id, confirm: "1" };

  if (op === "block") {
    hidden.slotId = one(sp.slot);
    hidden.blocked = "1";
    impact = await previewImpact(db, { slotId: hidden.slotId });
    heading = "Block this booked slot?";
    button = "Cancel the booking and block the slot";
    action = blockSlotAction;
  } else if (op === "cancelSession") {
    hidden.sessionId = one(sp.session);
    impact = await previewImpact(db, { sessionId: hidden.sessionId });
    heading = "Cancel this teacher's session?";
    button = "Cancel the session and these bookings";
    action = cancelSessionAction;
  } else if (op === "session") {
    hidden.sessionId = one(sp.session);
    for (const k of ["date", "start", "end", "slotMinutes", "gapMinutes", "room"]) hidden[k] = one(sp[k]);
    const startMin = parseTime(hidden.start);
    const endMin = parseTime(hidden.end);
    if (startMin !== null && endMin !== null) {
      impact = await previewImpact(db, { sessionId: hidden.sessionId, window: { date: hidden.date, startMin, endMin } });
    }
    heading = "Some booked slots fall outside the new timings";
    button = "Change timings and cancel these bookings";
    action = updateSessionAction;
  }
  if (!action) notFound();

  return (
    <AdminFrame admin={admin} title="Please confirm" current="/admin/meetings" back={{ href: home, label: m.title }}>
      <Panel title={heading}>
        {impact.length === 0 ? (
          <p>No bookings are affected any more. You can go ahead.</p>
        ) : (
          <>
            <Notice kind="warn">
              {impact.length === 1 ? "This booking" : `These ${impact.length} bookings`} will be cancelled. The parents are
              not told automatically: afterwards they appear under “Not booked yet · needs a new time” with a WhatsApp
              button for each.
            </Notice>
            <ul className="mt-3 divide-y divide-line">
              {impact.map((i) => (
                <li key={i.bookingId} className="flex flex-wrap gap-x-3 py-2">
                  <span className="font-bold">{formatTime(i.startsAt)}</span>
                  <span>{i.studentName}</span>
                  <span className="text-muted">{i.classLabel}</span>
                  <span className="ml-auto text-sm text-muted">{i.phones.map(formatPhone).join(", ") || "no phone"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <SubmitButton variant="danger">{button}</SubmitButton>
          <Link href={home} className="font-bold">
            Go back without changing anything
          </Link>
        </form>
      </Panel>
    </AdminFrame>
  );
}
