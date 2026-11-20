import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { AdminFrame, AdminLoading, Flash, Panel, adminLabel, td, th } from "@/components/admin/frame";
import { Pill } from "@/components/ui/bits";
import { AnchorButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { formatDayTime } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";
import { uploadRosterAction } from "./actions";
import { summaryText, type ImportSummary } from "./staged";

export const metadata: Metadata = { title: "Upload roster" };

export default function Page({ searchParams }: PageProps<"/admin/roster/import">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Upload searchParams={searchParams} />
    </Suspense>
  );
}

const STATUS = {
  staged: { tone: "sunshine", text: "Waiting for you" },
  applied: { tone: "leaf", text: "Applied" },
  discarded: { tone: "tangerine", text: "Discarded" },
} as const;

async function Upload({ searchParams }: Pick<PageProps<"/admin/roster/import">, "searchParams">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const history = await getDb().execute<{
    id: string;
    filename: string;
    status: keyof typeof STATUS;
    summary: ImportSummary | null;
    created_at: Date;
    by: string | null;
  }>(sql`
    select i.id, i.filename, i.status, i.summary, i.created_at, a.name as by
    from roster_imports i left join admin_users a on a.id = i.admin_id
    order by i.created_at desc limit 30`);

  return (
    <AdminFrame admin={admin} title="Upload roster" current="/admin/roster/import">
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Choose the file">
          <form action={uploadRosterAction} className="space-y-3">
            <div>
              <label htmlFor="file" className={adminLabel}>
                Roster file (.xlsx or .csv, up to 2 MB)
              </label>
              <input
                id="file"
                name="file"
                type="file"
                required
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="block w-full rounded-xl border-2 border-dashed border-line bg-wash p-3 text-base file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-paper file:px-3 file:py-2 file:font-bold"
              />
            </div>
            <SubmitButton>Upload and check</SubmitButton>
            <p className="text-sm text-muted">
              Nothing changes when you upload. You first see exactly what would happen, then choose to apply or discard.
            </p>
          </form>
          <p className="mt-4 border-t-2 border-line pt-3">
            <AnchorButton href="/admin/roster/template" variant="secondary" size="sm" download>
              Download the template (.xlsx)
            </AnchorButton>
          </p>
        </Panel>

        <Panel title="How the file is read">
          <ul className="list-disc space-y-2 pl-5">
            <li>One row per child, with the child&apos;s name, class and the parents&apos; mobile numbers.</li>
            <li>
              The file is the truth for the classes it contains. Classes that are not in the file are left exactly as they
              are, so you can upload one class at a time.
            </li>
            <li>
              A child who is in a class now but missing from that class in the file is archived, and their upcoming booking
              is cancelled. You are shown the names first.
            </li>
            <li>
              Format the phone columns as <strong>Text</strong> in Excel, otherwise long numbers can lose digits. The
              template is already set up this way.
            </li>
            <li>
              Admission numbers are strongly recommended: they let the system recognise a child whose name or class
              changed, and tell apart two children with the same name.
            </li>
            <li>Give each class one class teacher, written the same way on every row of that class.</li>
          </ul>
        </Panel>
      </div>

      <Panel title="Earlier uploads" className="mt-4">
        {history.rows.length === 0 ? (
          <p className="text-muted">No uploads yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="stack-table w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-line">
                  <th className={th}>When</th>
                  <th className={th}>File</th>
                  <th className={th}>Status</th>
                  <th className={`${th} hidden sm:table-cell`}>What happened</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((i) => {
                  const result =
                    i.status === "applied" ? (
                      summaryText(i.summary)
                    ) : i.status === "staged" ? (
                      <Link href={`/admin/roster/import/${i.id}`}>Open the preview to apply or discard</Link>
                    ) : (
                      <span className="text-muted">Nothing was changed</span>
                    );
                  return (
                    <tr key={i.id} className="border-b border-line last:border-0">
                      <td data-label="When" className={`${td} sm:whitespace-nowrap`}>
                        {formatDayTime(new Date(i.created_at))}
                        {i.by ? <div className="text-muted">{i.by}</div> : null}
                      </td>
                      <td className={`${td} break-words sm:max-w-64`}>
                        <Link href={`/admin/roster/import/${i.id}`} className="font-bold">
                          {i.filename}
                        </Link>
                        <div className="mt-1 sm:hidden">{result}</div>
                      </td>
                      <td data-label="Status" className={td}>
                        <Pill tone={STATUS[i.status]?.tone} className="whitespace-nowrap">
                          {STATUS[i.status]?.text ?? i.status}
                        </Pill>
                      </td>
                      <td className={`${td} hidden min-w-48 sm:table-cell`}>{result}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AdminFrame>
  );
}
