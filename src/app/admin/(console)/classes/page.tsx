import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { CopyButton } from "@/components/admin/copy-button";
import { AdminFrame, AdminLoading, Flash, Panel, adminInput, adminLabel } from "@/components/admin/frame";
import { ClassBadge } from "@/components/art";
import { Notice, Pill } from "@/components/ui/bits";
import { AnchorButton, LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/authz";
import { sessionSecret } from "@/lib/env";
import { teacherLinkToken } from "@/lib/links";
import { whatsappShareUrl } from "@/lib/share";
import { BADGES, BADGE_LABELS, TONES, TONE_LABELS, asBadge, asTone } from "@/theme/tones";
import { addClassAction, addTeacherAction, newTeacherLinkAction, updateClassAction, updateTeacherAction } from "./actions";

export const metadata: Metadata = { title: "Classes & teachers" };

export default function Page({ searchParams }: PageProps<"/admin/classes">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Classes searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const small = "mb-1 block text-xs font-bold text-muted";

async function Classes({ searchParams }: Pick<PageProps<"/admin/classes">, "searchParams">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const h = await headers();
  const db = getDb();

  const classes = await db.execute<{
    id: string;
    label: string;
    teacher_id: string | null;
    color: string;
    badge: string;
    sort_order: number;
    active: boolean;
    students: number;
  }>(sql`
    select cs.id, cs.label, cs.teacher_id, cs.color, cs.badge, cs.sort_order, cs.active,
      (select count(*) from students st where st.class_section_id = cs.id and st.archived_at is null)::int as students
    from class_sections cs
    order by cs.active desc, cs.sort_order, cs.label`);
  const teachers = await db.execute<{ id: string; name: string; active: boolean; link_version: number; classes: string[] | null }>(sql`
    select t.id, t.name, t.active, t.link_version,
      (select array_agg(cs.label order by cs.sort_order, cs.label) from class_sections cs where cs.teacher_id = t.id and cs.active) as classes
    from teachers t
    order by t.active desc, t.name`);

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  const origin = `${proto}://${host.split(",")[0].trim()}`;
  const secret = sessionSecret();
  const newLinkFor = one(sp.newlink);
  const activeTeachers = teachers.rows.filter((t) => t.active);

  return (
    <AdminFrame admin={admin} title="Classes & teachers" current="/admin/classes">
      <Flash ok={sp.ok} error={sp.error} />

      <Panel title="Classes" className="mb-4">
        {classes.rows.length === 0 ? (
          <p className="mb-3 text-muted">No classes yet. Add one below, or upload a roster file — it creates the classes it finds.</p>
        ) : (
          <ul className="mb-3 divide-y-2 divide-line">
            {classes.rows.map((c) => {
              const teacherOptions = teachers.rows.filter((t) => t.active || t.id === c.teacher_id);
              return (
                <li key={c.id} className="py-3 first:pt-0">
                  <form
                    action={updateClassAction}
                    className="grid grid-cols-2 items-end gap-x-2 gap-y-3 sm:grid-cols-4 lg:grid-cols-[2.75rem_1fr_1.2fr_6.5rem_7.5rem_4.5rem_auto_auto]"
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <div data-tone={asTone(c.color)} className="col-span-2 flex items-center gap-2 sm:col-span-4 lg:col-span-1 lg:block">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-tone-soft">
                        <ClassBadge badge={asBadge(c.badge)} size={34} />
                      </span>
                      <span className="font-display text-lg font-extrabold lg:hidden">{c.label}</span>
                      <span className="ml-auto text-sm text-muted lg:hidden">
                        {c.students} {c.students === 1 ? "student" : "students"}
                      </span>
                    </div>
                    <div className="col-span-2 lg:col-span-1">
                      <label htmlFor={`label-${c.id}`} className={small}>
                        Name
                      </label>
                      <input id={`label-${c.id}`} name="label" required maxLength={40} defaultValue={c.label} className={adminInput} />
                    </div>
                    <div className="col-span-2 lg:col-span-1">
                      <label htmlFor={`teacher-${c.id}`} className={small}>
                        Class teacher
                      </label>
                      <select id={`teacher-${c.id}`} name="teacherId" defaultValue={c.teacher_id ?? ""} className={adminInput}>
                        <option value="">— not set —</option>
                        {teacherOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.active ? "" : " (not active)"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`color-${c.id}`} className={small}>
                        Colour
                      </label>
                      <select id={`color-${c.id}`} name="color" defaultValue={asTone(c.color)} className={adminInput}>
                        {TONES.map((tone) => (
                          <option key={tone} value={tone}>
                            {TONE_LABELS[tone]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`badge-${c.id}`} className={small}>
                        Badge
                      </label>
                      <select id={`badge-${c.id}`} name="badge" defaultValue={asBadge(c.badge)} className={adminInput}>
                        {BADGES.map((b) => (
                          <option key={b} value={b}>
                            {BADGE_LABELS[b]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`order-${c.id}`} className={small}>
                        Order
                      </label>
                      <input
                        id={`order-${c.id}`}
                        name="sortOrder"
                        type="number"
                        min={0}
                        max={9999}
                        required
                        defaultValue={c.sort_order}
                        className={adminInput}
                      />
                    </div>
                    <div>
                      <span className={`${small} hidden lg:block`}>
                        {c.students} {c.students === 1 ? "student" : "students"}
                      </span>
                      <label className="flex min-h-11 items-center gap-2 font-semibold">
                        <input type="checkbox" name="active" defaultChecked={c.active} className="size-5" />
                        Active
                      </label>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <SubmitButton variant="secondary" size="sm" className="w-full lg:w-auto">
                        Save
                      </SubmitButton>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <Notice kind="info" className="mb-4">
          Changing a class teacher does not move sessions of a meeting that is already published — use Substitute teacher on
          the meeting page.
        </Notice>
        <p className="mb-4 text-sm text-muted">
          Order decides how classes are listed (smaller first). A class can only be made inactive when it has no active
          students; inactive classes are left out of new meetings.
        </p>

        <h3 className="mb-2 text-lg font-extrabold">Add a class</h3>
        <form action={addClassAction} className="grid gap-3 sm:grid-cols-[1fr_7rem_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="new-class" className={adminLabel}>
              Class
            </label>
            <input id="new-class" name="className" required maxLength={40} placeholder="e.g. LKG" className={adminInput} />
          </div>
          <div>
            <label htmlFor="new-section" className={adminLabel}>
              Section
            </label>
            <input id="new-section" name="section" maxLength={5} placeholder="e.g. B" className={adminInput} />
          </div>
          <div>
            <label htmlFor="new-class-teacher" className={adminLabel}>
              Class teacher
            </label>
            <select id="new-class-teacher" name="teacherId" defaultValue="" className={adminInput}>
              <option value="">— set later —</option>
              {activeTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton size="sm">Add class</SubmitButton>
        </form>
      </Panel>

      <Panel title="Teachers">
        <p className="mb-3 text-sm text-muted">
          Each teacher has a private link that shows their own meeting schedule, with no sign-in. Send it only to that
          teacher. If a link went to the wrong person, make a new one — the old link stops working at once.
        </p>
        {teachers.rows.length === 0 ? (
          <p className="mb-3 text-muted">No teachers yet. Add one below.</p>
        ) : (
          <ul className="mb-4 divide-y-2 divide-line">
            {teachers.rows.map((t) => {
              const url = `${origin}/t/${teacherLinkToken(secret, t.id, t.link_version)}`;
              const message = `Hello ${t.name}, this is your private link to see your parent-teacher meeting schedule. Please do not forward it.\n${url}`;
              return (
                <li key={t.id} id={`t-${t.id}`} className="scroll-mt-4 space-y-3 py-4 first:pt-0">
                  <form action={updateTeacherAction} className="flex flex-wrap items-end gap-x-3 gap-y-2">
                    <input type="hidden" name="id" value={t.id} />
                    <div className="min-w-0 flex-1 basis-56">
                      <label htmlFor={`tname-${t.id}`} className={small}>
                        Teacher&apos;s name
                      </label>
                      <input id={`tname-${t.id}`} name="name" required maxLength={80} defaultValue={t.name} className={adminInput} />
                    </div>
                    <label className="flex min-h-11 items-center gap-2 font-semibold">
                      <input type="checkbox" name="active" defaultChecked={t.active} className="size-5" />
                      Active
                    </label>
                    <SubmitButton variant="secondary" size="sm">
                      Save
                    </SubmitButton>
                  </form>
                  <p className="text-sm">
                    {t.classes?.length ? (
                      <>
                        <span className="text-muted">Class teacher of </span>
                        {t.classes.map((label) => (
                          <Pill key={label} className="mr-1">
                            {label}
                          </Pill>
                        ))}
                      </>
                    ) : (
                      <span className="text-muted">Not a class teacher of any class.</span>
                    )}
                  </p>
                  {t.active ? (
                    <div>
                      <label htmlFor={`link-${t.id}`} className={small}>
                        Private schedule link
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          id={`link-${t.id}`}
                          readOnly
                          value={url}
                          className={`${adminInput} min-w-0 flex-1 basis-64 bg-wash! font-mono text-base!`}
                        />
                        <CopyButton text={url} label="Copy link" />
                        <AnchorButton
                          href={whatsappShareUrl(message)}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="leaf"
                          size="sm"
                        >
                          Send on WhatsApp
                        </AnchorButton>
                      </div>
                      {newLinkFor === t.id ? (
                        <Notice kind="warn" role="alert" className="mt-3">
                          <p>
                            Make a new link for {t.name}? The link above stops working at once, on every phone that has it.
                            You will need to send the new one.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <form action={newTeacherLinkAction}>
                              <input type="hidden" name="id" value={t.id} />
                              <SubmitButton variant="danger" size="sm">
                                Yes, make a new link
                              </SubmitButton>
                            </form>
                            <LinkButton href="/admin/classes" variant="secondary" size="sm" scroll={false}>
                              No, keep this link
                            </LinkButton>
                          </div>
                        </Notice>
                      ) : (
                        <p className="mt-2 text-sm">
                          <Link href={`/admin/classes?newlink=${t.id}#t-${t.id}`} className="font-bold text-coral-ink">
                            Make a new link…
                          </Link>
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">Not active, so no schedule link. Tick Active and save to get one.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <h3 className="mb-2 text-lg font-extrabold">Add a teacher</h3>
        <form action={addTeacherAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="new-teacher" className={adminLabel}>
              Teacher&apos;s name
            </label>
            <input id="new-teacher" name="name" required maxLength={80} placeholder="e.g. Ms. Kaur" className={adminInput} />
          </div>
          <SubmitButton size="sm">Add teacher</SubmitButton>
        </form>
      </Panel>
    </AdminFrame>
  );
}
