import type { Metadata } from "next";
import Form from "next/form";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq, sql } from "drizzle-orm";
import { AdminFrame, AdminLoading, Flash, Panel, adminInput, adminLabel, td, th } from "@/components/admin/frame";
import { Notice, Pill } from "@/components/ui/bits";
import { Button, LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { adminUsers, rosterImports } from "@/db/schema";
import { loadSnapshot } from "@/domain/import/apply";
import { buildPreview, type PreviewRow, type RowAction } from "@/domain/import/diff";
import { formatDayTime } from "@/domain/time";
import { requireAdmin } from "@/lib/authz";
import type { Tone } from "@/theme/tones";
import { applyImportAction, discardImportAction } from "../actions";
import { mappingField, mappingFrom, stagedRows, summaryText, type ImportSummary } from "../staged";

export const metadata: Metadata = { title: "Check the upload" };

export default function Page({ params, searchParams }: PageProps<"/admin/roster/import/[id]">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Preview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const ACTION: Record<RowAction, { tone: Tone; text: string }> = {
  add: { tone: "leaf", text: "New child" },
  update: { tone: "sky", text: "Update" },
  move: { tone: "grape", text: "Moves class" },
  restore: { tone: "leaf", text: "Restore" },
  unchanged: { tone: "sky", text: "No change" },
  error: { tone: "coral", text: "Error" },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function RowNotes({ row }: { row: PreviewRow }) {
  return (
    <>
      {row.errors.map((e, i) => (
        <p key={`e${i}`} className="font-bold text-coral-ink">
          {e}
        </p>
      ))}
      {row.changes.map((c, i) => (
        <p key={`c${i}`}>{c}</p>
      ))}
      {row.warnings.map((w, i) => (
        <p key={`w${i}`} className="text-tangerine-ink">
          {w}
        </p>
      ))}
    </>
  );
}

/** On a phone the notes sit under the child's name, so nothing important is off-screen. */
function RowsTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-line">
            <th className={th}>Row</th>
            <th className={th}>Child</th>
            <th className={th}>What happens</th>
            <th className={`${th} hidden sm:table-cell`}>Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rowNumber} className="border-b border-line last:border-0">
              <td className={`${td} text-muted`}>{r.rowNumber}</td>
              <td className={`${td} sm:min-w-32`}>
                <div className="font-bold">{r.name}</div>
                <div className="text-muted">{r.classLabel || "no class"}</div>
                <div className="mt-1 sm:hidden">
                  <RowNotes row={r} />
                </div>
              </td>
              <td className={td}>
                <Pill tone={ACTION[r.action].tone} className="whitespace-nowrap">
                  {ACTION[r.action].text}
                </Pill>
              </td>
              <td className={`${td} hidden min-w-56 sm:table-cell`}>
                <RowNotes row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Preview({ params, searchParams }: PageProps<"/admin/roster/import/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();

  const found = await db
    .select({
      id: rosterImports.id,
      filename: rosterImports.filename,
      status: rosterImports.status,
      staged: rosterImports.staged,
      summary: rosterImports.summary,
      createdAt: rosterImports.createdAt,
      appliedAt: rosterImports.appliedAt,
      by: adminUsers.name,
    })
    .from(rosterImports)
    .leftJoin(adminUsers, eq(adminUsers.id, rosterImports.adminId))
    .where(eq(rosterImports.id, id));
  const imp = found[0];
  if (!imp) notFound();

  const frame = { admin, current: "/admin/roster/import", back: { href: "/admin/roster/import", label: "Upload roster" } };
  const uploaded = `Uploaded ${formatDayTime(imp.createdAt)}${imp.by ? ` by ${imp.by}` : ""}.`;

  if (imp.status !== "staged") {
    return (
      <AdminFrame {...frame} title={imp.filename}>
        <Flash ok={sp.ok} error={sp.error} />
        <Panel>
          <p className="text-muted">{uploaded}</p>
          {imp.status === "applied" ? (
            <>
              <p className="mt-2 text-lg font-bold">
                Applied{imp.appliedAt ? ` on ${formatDayTime(imp.appliedAt)}` : ""}.
              </p>
              <p className="mt-1">Result: {summaryText(imp.summary as ImportSummary | null)}.</p>
            </>
          ) : (
            <p className="mt-2 text-lg font-bold">Discarded. The roster was not changed by this upload.</p>
          )}
          <p className="mt-4 flex flex-wrap gap-2">
            <LinkButton href="/admin/roster" variant="secondary" size="sm">
              See the students
            </LinkButton>
            <LinkButton href="/admin/roster/import" variant="secondary" size="sm">
              Upload another file
            </LinkButton>
          </p>
        </Panel>
      </AdminFrame>
    );
  }

  const rows = stagedRows(imp.staged);
  if (!rows) {
    return (
      <AdminFrame {...frame} title={imp.filename}>
        <Flash ok={sp.ok} error={sp.error} />
        <Notice kind="warn">
          The rows of this upload are no longer stored. Upload the file again to continue.
          <form action={discardImportAction} className="mt-2">
            <input type="hidden" name="id" value={imp.id} />
            <SubmitButton variant="secondary" size="sm">
              Remove this upload
            </SubmitButton>
          </form>
        </Notice>
      </AdminFrame>
    );
  }

  const mapping = mappingFrom(Object.entries(sp));
  const preview = buildPreview(rows, await loadSnapshot(db), mapping);
  const sections = await db.execute<{ id: string; label: string }>(
    sql`select id, label from class_sections where active order by sort_order, label`,
  );
  const c = preview.counts;
  const blocked = preview.blocking.length > 0;
  const willChange = c.add + c.update + c.move + c.restore + c.archive > 0 || preview.newSections.length > 0 ||
    preview.newTeachers.length > 0 || preview.teacherAssignments.length > 0;
  const shown = preview.rows.filter((r) => r.action !== "unchanged" || r.warnings.length > 0);
  const quiet = preview.rows.filter((r) => r.action === "unchanged" && r.warnings.length === 0);

  const counts: Array<[number, string, Tone]> = [
    [c.add, c.add === 1 ? "new child" : "new children", "leaf"],
    [c.update, "updated", "sky"],
    [c.move, c.move === 1 ? "moves class" : "move class", "grape"],
    [c.restore, "restored", "leaf"],
    [c.archive, "to be archived", "tangerine"],
    [c.error, c.error === 1 ? "row with errors" : "rows with errors", "coral"],
    [c.unchanged, "unchanged", "sky"],
  ];

  return (
    <AdminFrame {...frame} title="Check the upload">
      <Flash ok={sp.ok} error={sp.error} />
      <p className="mb-4 text-muted">
        <span className="font-bold break-words text-navy">{imp.filename}</span> — {plural(rows.length, "row", "rows")}. {uploaded}{" "}
        Nothing has been changed yet.
      </p>

      {blocked ? (
        <Notice kind="bad" role="alert" className="mb-4">
          <p className="font-extrabold">This file cannot be applied until this is fixed:</p>
          <ul className="mt-1 list-disc pl-5">
            {preview.blocking.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <p className="mt-1">Correct the spreadsheet and upload it again.</p>
        </Notice>
      ) : null}

      <Panel title="What applying would do" className="mb-4">
        <ul className="flex flex-wrap gap-2">
          {counts
            .filter(([n]) => n > 0)
            .map(([n, label, tone]) => (
              <li key={label}>
                <Pill tone={tone} className="text-base!">
                  <strong>{n}</strong> {label}
                </Pill>
              </li>
            ))}
        </ul>
        {!willChange && !blocked ? <p className="mt-3">The roster already matches this file. There is nothing to apply.</p> : null}
        {preview.bookingsToCancel > 0 ? (
          <Notice kind="warn" className="mt-3">
            This will cancel {plural(preview.bookingsToCancel, "booking", "bookings")} of children who are archived or move
            class. Their parents will need to be told.
          </Notice>
        ) : null}
        {preview.guards.map((g) => (
          <Notice key={g.label} kind="warn" className="mt-3">
            {g.archiving} of the {g.of} children in {g.label} are missing from the file and would be archived. If the file
            only has part of this class, do not apply it.
          </Notice>
        ))}
        {preview.warnings.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-tangerine-ink">
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : null}
      </Panel>

      {preview.unknownClasses.length > 0 ? (
        <Panel title="Classes the system has not seen before" className="mb-4">
          <p className="mb-3 text-sm text-muted">
            If a name is only another spelling of a class you already have, choose that class — the spelling is remembered
            for next time. Then press Update preview.
          </p>
          <Form action={`/admin/roster/import/${imp.id}`} className="space-y-3">
            {preview.unknownClasses.map((u) => (
              <div key={u.key} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:items-center sm:gap-3">
                <label htmlFor={`map-${u.key}`} className={`${adminLabel} sm:mb-0`}>
                  “{u.label}” <span className="font-normal text-muted">({plural(u.rows, "row", "rows")})</span>
                </label>
                <select id={`map-${u.key}`} name={mappingField(u.key)} defaultValue={u.mappedTo} className={adminInput}>
                  <option value="new">Create new class «{u.label}»</option>
                  {sections.rows.map((s) => (
                    <option key={s.id} value={s.id}>
                      Same as {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <Button type="submit" variant="secondary" size="sm">
              Update preview
            </Button>
          </Form>
        </Panel>
      ) : null}

      {preview.newSections.length + preview.newTeachers.length + preview.teacherAssignments.length > 0 ? (
        <Panel title="Classes and teachers" className="mb-4">
          <ul className="list-disc space-y-1 pl-5">
            {preview.newSections.map((s) => (
              <li key={`s-${s.key}`}>
                New class: <strong>{s.label}</strong>
              </li>
            ))}
            {preview.newTeachers.map((t) => (
              <li key={`t-${t.key}`}>
                New teacher: <strong>{t.name}</strong>
              </li>
            ))}
            {preview.teacherAssignments.map((a) => (
              <li key={`a-${a.sectionRef}`}>
                Class teacher of {a.label}: {a.from ? `${a.from} → ` : ""}
                <strong>{a.teacherName}</strong>
              </li>
            ))}
          </ul>
          {preview.teacherAssignments.some((a) => a.from) ? (
            <p className="mt-2 text-sm text-muted">
              A meeting that is already published keeps its sessions as they are — use Substitute teacher on the meeting page.
            </p>
          ) : null}
        </Panel>
      ) : null}

      {preview.archive.length > 0 ? (
        <Panel title={`Children to be archived (${preview.archive.length})`} className="mb-4">
          <p className="mb-2 text-sm text-muted">
            They are in these classes now but not in the file. Archived children are hidden from parents; you can restore
            them from the Students page.
          </p>
          <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {preview.archive.map((a) => (
              <li key={a.studentId}>
                {a.name} <span className="text-muted">({a.label})</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Rows" className="mb-4">
        {shown.length > 0 ? (
          <RowsTable rows={shown} />
        ) : (
          <p className="text-muted">No row changes anything or needs attention.</p>
        )}
        {quiet.length > 0 ? (
          <details className="mt-3 border-t-2 border-line pt-3">
            <summary className="cursor-pointer font-bold">
              {plural(quiet.length, "row", "rows")} with no change — show
            </summary>
            <div className="mt-2">
              <RowsTable rows={quiet} />
            </div>
          </details>
        ) : null}
      </Panel>

      <Panel title="Apply or discard">
        {blocked ? (
          <p className="mb-3">This file cannot be applied. Discard it, fix the spreadsheet and upload again.</p>
        ) : (
          <form action={applyImportAction} className="mb-4 space-y-3">
            <input type="hidden" name="id" value={imp.id} />
            {preview.unknownClasses.map((u) => (
              <input key={u.key} type="hidden" name={mappingField(u.key)} value={u.mappedTo} />
            ))}
            {c.error > 0 ? (
              <label className="flex items-start gap-2 font-semibold">
                <input type="checkbox" name="skipErrors" className="mt-1 size-5 shrink-0" />
                <span>
                  Leave out the {plural(c.error, "row", "rows")} with errors and apply the rest.
                  <span className="block text-sm font-normal text-muted">
                    Without this tick nothing is applied. Children on those rows stay as they are now.
                  </span>
                </span>
              </label>
            ) : null}
            {preview.guards.length > 0 ? (
              <div>
                <label htmlFor="confirmArchive" className={adminLabel}>
                  This archives a large part of {preview.guards.map((g) => g.label).join(", ")}. Type ARCHIVE to confirm.
                </label>
                <input
                  id="confirmArchive"
                  name="confirmArchive"
                  required
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="ARCHIVE"
                  className={`${adminInput} max-w-48`}
                />
              </div>
            ) : null}
            <SubmitButton>Apply this upload</SubmitButton>
          </form>
        )}
        <form action={discardImportAction} className="border-t-2 border-line pt-3">
          <input type="hidden" name="id" value={imp.id} />
          <SubmitButton variant="secondary" size="sm">
            Discard — change nothing
          </SubmitButton>
        </form>
      </Panel>
    </AdminFrame>
  );
}
