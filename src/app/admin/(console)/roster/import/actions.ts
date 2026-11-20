"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { rosterImports } from "@/db/schema";
import { applyImport } from "@/domain/import/apply";
import { MAX_FILE_BYTES, parseRosterFile } from "@/domain/import/parse";
import { back, str } from "@/lib/admin-action";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/authz";
import { newId } from "@/lib/ids";
import { clientIp } from "@/lib/request";
import { mappingFrom, mappingQuery, stagedRows, summaryText } from "./staged";

const UPLOAD = "/admin/roster/import";

/** Postgres cannot store the NUL character in text or jsonb. */
function withoutNul<T>(value: T): T {
  if (typeof value === "string") return value.replaceAll("\u0000", "") as T;
  if (Array.isArray(value)) return value.map(withoutNul) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutNul(v)])) as T;
  }
  return value;
}

export async function uploadRosterAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) back(UPLOAD, "error", "Choose a roster file first (.xlsx or .csv).");
  if (file.size > MAX_FILE_BYTES) back(UPLOAD, "error", "That file is larger than 2 MB. Is it the right file?");
  const filename = withoutNul(file.name).trim().slice(0, 200) || "roster";
  const parsed = await parseRosterFile(Buffer.from(await file.arrayBuffer()), filename);
  if (!parsed.ok) back(UPLOAD, "error", `${parsed.error} Nothing was changed.`);

  const id = newId();
  const ip = await clientIp();
  await getDb().transaction(async (tx) => {
    await tx.insert(rosterImports).values({ id, adminId: admin.id, filename, staged: { rows: withoutNul(parsed.rows) } });
    await audit(tx, {
      actorType: "admin",
      actor: admin.id,
      action: "roster.upload",
      entity: "roster_import",
      entityId: id,
      detail: { filename, rows: parsed.rows.length },
      ip,
    });
  });
  redirect(`${UPLOAD}/${id}`);
}

export async function applyImportAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(form, "id", 40);
  const db = getDb();
  const found = await db.select().from(rosterImports).where(eq(rosterImports.id, id));
  const imp = found[0];
  if (!imp) back(UPLOAD, "error", "That upload was not found. Upload the file again.");
  const page = `${UPLOAD}/${id}`;
  if (imp.status !== "staged") back(page, "error", `This upload was already ${imp.status}. Nothing more was changed.`);
  const rows = stagedRows(imp.staged);
  if (!rows) back(page, "error", "The uploaded rows are no longer stored. Upload the file again.");

  const mapping = mappingFrom(form.entries());
  const res = await applyImport(db, {
    rows,
    mapping,
    skipErrors: form.get("skipErrors") === "on",
    confirmArchive: str(form, "confirmArchive", 20).toUpperCase() === "ARCHIVE",
    adminId: admin.id,
    ip: await clientIp(),
    importId: id,
  });
  if (!res.ok) {
    const query = mappingQuery(mapping);
    back(query ? `${page}?${query}` : page, "error", `Nothing was changed. ${res.error}`);
  }
  back("/admin/roster", "ok", `Roster updated from ${imp.filename}: ${summaryText(res.summary)}.`);
}

export async function discardImportAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(form, "id", 40);
  const ip = await clientIp();
  const done = await getDb().transaction(async (tx) => {
    // The uploaded rows hold names and phone numbers, so they are not kept.
    const res = await tx.execute<{ filename: string }>(sql`
      update roster_imports set status = 'discarded', staged = '{}'::jsonb
      where id = ${id} and status = 'staged' returning filename`);
    if (!res.rows[0]) return null;
    await audit(tx, {
      actorType: "admin",
      actor: admin.id,
      action: "roster.discard",
      entity: "roster_import",
      entityId: id,
      detail: { filename: res.rows[0].filename },
      ip,
    });
    return res.rows[0].filename;
  });
  if (!done) back(UPLOAD, "error", "That upload was already applied or discarded.");
  back(UPLOAD, "ok", `${done} was discarded. The roster was not changed.`);
}
