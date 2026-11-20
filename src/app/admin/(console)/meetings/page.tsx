import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminFrame, AdminLoading, Flash, Panel, td, th } from "@/components/admin/frame";
import { Pill } from "@/components/ui/bits";
import { LinkButton } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { PHASE_TONE } from "@/components/admin/phase";
import { listMeetings, PHASE_LABEL } from "@/domain/admin-view";
import { formatDate } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";

export const metadata: Metadata = { title: "Meetings" };

export default function Page({ searchParams }: PageProps<"/admin/meetings">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/admin/meetings">, "searchParams">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const meetings = await listMeetings(getDb());
  return (
    <AdminFrame admin={admin} title="Meetings" current="/admin/meetings" actions={<LinkButton href="/admin/meetings/new">New meeting</LinkButton>}>
      <Flash ok={sp.ok} error={sp.error} />
      <Panel>
        {meetings.length === 0 ? (
          <p>
            No meetings yet. <Link href="/admin/meetings/new" className="font-bold">Create the first one</Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse">
              <thead>
                <tr className="border-b-2 border-line">
                  <th className={th}>Date</th>
                  <th className={th}>Meeting</th>
                  <th className={th}>Status</th>
                  <th className={th}>Booked</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id} className="border-b border-line">
                    <td className={`${td} whitespace-nowrap font-bold`}>{formatDate(m.date, "short")}</td>
                    <td className={td}>
                      <Link href={`/admin/meetings/${m.id}`} className="font-bold">
                        {m.title}
                      </Link>
                    </td>
                    <td className={td}>
                      <Pill tone={PHASE_TONE[m.phase]}>{PHASE_LABEL[m.phase]}</Pill>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {m.booked} of {m.children} children
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AdminFrame>
  );
}
