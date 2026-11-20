import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { AdminFrame, AdminLoading, Flash, Panel, adminInput, adminLabel } from "@/components/admin/frame";
import { Notice, Pill } from "@/components/ui/bits";
import { AnchorButton, Button, LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDb } from "@/db/client";
import { MAX_PURGE_MONTHS, MIN_PURGE_MONTHS, purgeMonths, purgePreview } from "@/domain/purge";
import { requireAdmin } from "@/lib/authz";
import { getSettings } from "@/lib/settings";
import {
  addAdminAction,
  changeMyPasswordAction,
  purgeAction,
  removeLogoAction,
  resetAdminPasswordAction,
  saveBookingRulesAction,
  saveSchoolAction,
  setAdminActiveAction,
  uploadLogoAction,
} from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default function Page({ searchParams }: PageProps<"/admin/settings">) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <Settings searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const hint = "mt-1 text-sm text-muted";

/** "+911762500000" -> "01762 500 000": the way the office writes it. Other countries stay international. */
function showPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.country === "IN" ? parsed.formatNational() : parsed.formatInternational();
}

async function Settings({ searchParams }: Pick<PageProps<"/admin/settings">, "searchParams">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const db = getDb();
  const isOwner = admin.role === "owner";
  const settings = await getSettings(db);
  const missing = await db.execute<{ n: number; total: number }>(sql`
    select count(*) filter (where admission_no is null)::int as n, count(*)::int as total
    from students where archived_at is null`);
  const noAdmission = missing.rows[0].n;
  const admins = await db.execute<{ id: string; name: string; username: string; role: string; active: boolean; locked: boolean }>(sql`
    select id, name, username, role, active, coalesce(locked_until > now(), false) as locked
    from admin_users order by active desc, role desc, name`);

  const hasLogo = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(settings.logoDataUrl);
  const disableId = one(sp.disable);
  const resetId = one(sp.reset);
  const months = purgeMonths(one(sp.months));
  const showPurge = isOwner && one(sp.months) !== "";
  const purge = showPurge ? await purgePreview(db, months) : null;
  const purgeTotal = purge
    ? purge.meetings + purge.bookings + purge.slots + purge.auditRows + purge.students + purge.importPayloads + purge.rateLimits
    : 0;

  return (
    <AdminFrame admin={admin} title="Settings" current="/admin/settings">
      <Flash ok={sp.ok} error={sp.error} />

      <Panel title="School" className="mb-4">
        <form action={saveSchoolAction} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="schoolName" className={adminLabel}>
                School name
              </label>
              <input id="schoolName" name="schoolName" required maxLength={80} defaultValue={settings.schoolName} className={adminInput} />
            </div>
            <div>
              <label htmlFor="schoolPlace" className={adminLabel}>
                Place
              </label>
              <input id="schoolPlace" name="schoolPlace" maxLength={80} defaultValue={settings.schoolPlace} className={adminInput} />
            </div>
            <div>
              <label htmlFor="officePhone" className={adminLabel}>
                Office phone
              </label>
              <input
                id="officePhone"
                name="officePhone"
                type="tel"
                maxLength={30}
                defaultValue={settings.officePhone ? showPhone(settings.officePhone) : ""}
                className={adminInput}
              />
            </div>
          </div>
          <p className={hint}>
            Parents see the name and place on every page. The office phone gives them “Call” and WhatsApp buttons for
            when they need help; leave it empty to hide those.
          </p>
          <SubmitButton size="sm">Save school details</SubmitButton>
        </form>

        <div className="mt-4 border-t-2 border-line pt-4">
          <h3 className="mb-2 text-lg font-extrabold">Logo</h3>
          <div className="flex flex-wrap items-start gap-4">
            {hasLogo ? (
              <div className="grid size-20 shrink-0 place-items-center rounded-xl border-2 border-line bg-wash p-1">
                {/* A small data: URL from settings; next/image cannot optimise it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={settings.logoDataUrl} alt="Current school logo" className="max-h-full max-w-full object-contain" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1 basis-64 space-y-3">
              <form action={uploadLogoAction} className="space-y-2">
                <label htmlFor="logo" className={adminLabel}>
                  {hasLogo ? "Replace the logo" : "Upload a logo"} (PNG, JPEG or WebP, up to 150 KB)
                </label>
                <input
                  id="logo"
                  name="logo"
                  type="file"
                  required
                  accept="image/png,image/jpeg,image/webp"
                  className="block w-full rounded-xl border-2 border-dashed border-line bg-wash p-2 text-base file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-paper file:px-3 file:py-2 file:font-bold"
                />
                <SubmitButton variant="secondary" size="sm">
                  Save logo
                </SubmitButton>
              </form>
              {hasLogo ? (
                <form action={removeLogoAction}>
                  <SubmitButton variant="quiet" size="sm">
                    Remove the logo
                  </SubmitButton>
                </form>
              ) : (
                <p className={hint}>Without a logo, parents see the rainbow picture.</p>
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Booking rules" className="mb-4">
        <form action={saveBookingRulesAction} className="space-y-4">
          <div>
            <label className="flex items-start gap-2 font-bold">
              <input
                type="checkbox"
                name="requireAdmissionNo"
                defaultChecked={settings.requireAdmissionNo}
                className="mt-0.5 size-5 shrink-0"
              />
              Ask parents for the child&apos;s admission number when they sign in
            </label>
            <p className={hint}>
              A second check. Class WhatsApp groups show everyone&apos;s mobile number, so one parent could type another
              parent&apos;s number. With this on, they must also know that child&apos;s admission number. It only works for
              children who have an admission number in the roster.
            </p>
            {noAdmission > 0 ? (
              <Notice kind={settings.requireAdmissionNo ? "bad" : "warn"} className="mt-2">
                {plural(noAdmission, "active student has", "active students have")} no admission number
                {settings.requireAdmissionNo
                  ? " — their parents cannot sign in while this is on."
                  : ". Add the numbers before turning this on, or those parents will not be able to sign in."}{" "}
                <Link href="/admin/roster">Go to Students</Link>
              </Notice>
            ) : missing.rows[0].total > 0 ? (
              <p className="mt-1 text-sm font-semibold text-leaf-ink">Every active student has an admission number.</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="parentChangeLimit" className={adminLabel}>
                Times a parent may change or cancel
              </label>
              <input
                id="parentChangeLimit"
                name="parentChangeLimit"
                type="number"
                min={1}
                max={10}
                required
                defaultValue={settings.parentChangeLimit}
                className={`${adminInput} max-w-28`}
              />
              <p className={hint}>Per child, per meeting (1 to 10). After that the parent is asked to call the office.</p>
            </div>
            <div>
              <label htmlFor="defaultSlotMinutes" className={adminLabel}>
                Usual length of one slot, in minutes
              </label>
              <input
                id="defaultSlotMinutes"
                name="defaultSlotMinutes"
                type="number"
                min={5}
                max={60}
                required
                defaultValue={settings.defaultSlotMinutes}
                className={`${adminInput} max-w-28`}
              />
              <p className={hint}>Filled in when you create a meeting (5 to 60). You can change it for each meeting.</p>
            </div>
          </div>
          <div>
            <label htmlFor="privacyNote" className={adminLabel}>
              Privacy note
            </label>
            <textarea
              id="privacyNote"
              name="privacyNote"
              required
              rows={3}
              maxLength={400}
              defaultValue={settings.privacyNote}
              className={`${adminInput} py-2`}
            />
            <p className={hint}>Shown to parents where they type their mobile number. Up to 400 characters.</p>
          </div>
          <SubmitButton size="sm">Save booking rules</SubmitButton>
        </form>
      </Panel>

      <Panel title="Admin accounts" className="mb-4">
        <ul className="divide-y-2 divide-line">
          {admins.rows.map((a) => (
            <li key={a.id} id={`a-${a.id}`} className="scroll-mt-4 py-3 first:pt-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-base font-bold">
                  {a.name}
                  {a.id === admin.id ? <span className="font-normal text-muted"> (you)</span> : null}
                </span>
                <span className="text-sm text-muted">
                  username <span className="font-mono text-navy">{a.username}</span>
                </span>
                <span className="text-sm text-muted">{a.role === "owner" ? "Owner" : "Office staff"}</span>
                {a.active ? <Pill tone="leaf">Active</Pill> : <Pill tone="tangerine">Disabled</Pill>}
                {a.active && a.locked ? (
                  <span className="text-sm text-coral-ink">Locked for a few minutes (wrong passwords)</span>
                ) : null}
              </div>
              {!isOwner || a.id === admin.id ? null : disableId === a.id && a.active ? (
                <Notice kind="warn" role="alert" className="mt-2">
                  <p>
                    Disable {a.name}&apos;s account? They are signed out at once and cannot sign in until you enable the
                    account again.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={setAdminActiveAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="active" value="0" />
                      <SubmitButton variant="danger" size="sm">
                        Yes, disable
                      </SubmitButton>
                    </form>
                    <LinkButton href="/admin/settings" variant="secondary" size="sm" scroll={false}>
                      No, keep it
                    </LinkButton>
                  </div>
                </Notice>
              ) : resetId === a.id ? (
                <form action={resetAdminPasswordAction} className="mt-2 max-w-md space-y-2">
                  <input type="hidden" name="id" value={a.id} />
                  <label htmlFor={`pw-${a.id}`} className={adminLabel}>
                    New password for {a.name} (at least 10 characters)
                  </label>
                  <input
                    id={`pw-${a.id}`}
                    name="password"
                    type="password"
                    required
                    minLength={10}
                    autoComplete="new-password"
                    className={adminInput}
                  />
                  <p className={hint}>They are signed out everywhere and must use the new password.</p>
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton variant="secondary" size="sm">
                      Set password
                    </SubmitButton>
                    <LinkButton href="/admin/settings" variant="quiet" size="sm" scroll={false}>
                      Cancel
                    </LinkButton>
                  </div>
                </form>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  <Link href={`/admin/settings?reset=${a.id}#a-${a.id}`} className="font-bold">
                    Reset password…
                  </Link>
                  {a.active ? (
                    <Link href={`/admin/settings?disable=${a.id}#a-${a.id}`} className="font-bold text-coral-ink">
                      Disable…
                    </Link>
                  ) : (
                    <form action={setAdminActiveAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="active" value="1" />
                      <SubmitButton variant="leaf" size="sm">
                        Enable
                      </SubmitButton>
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {isOwner ? (
          <div className="mt-4 border-t-2 border-line pt-4">
            <h3 className="mb-2 text-lg font-extrabold">Add an admin</h3>
            <form action={addAdminAction} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="new-admin-name" className={adminLabel}>
                    Name
                  </label>
                  <input id="new-admin-name" name="name" required maxLength={80} autoComplete="off" className={adminInput} />
                </div>
                <div>
                  <label htmlFor="new-admin-username" className={adminLabel}>
                    Username
                  </label>
                  <input
                    id="new-admin-username"
                    name="username"
                    required
                    minLength={3}
                    maxLength={60}
                    autoComplete="off"
                    autoCapitalize="none"
                    className={adminInput}
                  />
                </div>
                <div>
                  <label htmlFor="new-admin-password" className={adminLabel}>
                    Password (10 or more)
                  </label>
                  <input
                    id="new-admin-password"
                    name="password"
                    type="password"
                    required
                    minLength={10}
                    autoComplete="new-password"
                    className={adminInput}
                  />
                </div>
                <div>
                  <label htmlFor="new-admin-role" className={adminLabel}>
                    Role
                  </label>
                  <select id="new-admin-role" name="role" defaultValue="admin" className={adminInput}>
                    <option value="admin">Office staff</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
              </div>
              <p className={hint}>
                Office staff can do everything except manage admin accounts, download everything and clear old data. Give
                each person their own account, so the activity log shows who did what.
              </p>
              <SubmitButton size="sm">Add admin</SubmitButton>
            </form>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Only an owner can add, disable or reset accounts.</p>
        )}
      </Panel>

      <Panel title="Change my password" className="mb-4">
        <form action={changeMyPasswordAction} className="space-y-3">
          {/* Helps password managers attach the new password to the right account. */}
          <input type="text" name="username" autoComplete="username" defaultValue={admin.username} readOnly hidden />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="current" className={adminLabel}>
                Current password
              </label>
              <input id="current" name="current" type="password" required autoComplete="current-password" className={adminInput} />
            </div>
            <div>
              <label htmlFor="next" className={adminLabel}>
                New password (10 or more)
              </label>
              <input id="next" name="next" type="password" required minLength={10} autoComplete="new-password" className={adminInput} />
            </div>
            <div>
              <label htmlFor="again" className={adminLabel}>
                New password again
              </label>
              <input id="again" name="again" type="password" required minLength={10} autoComplete="new-password" className={adminInput} />
            </div>
          </div>
          <SubmitButton variant="secondary" size="sm">
            Change password
          </SubmitButton>
        </form>
      </Panel>

      {isOwner ? (
        <Panel title="Year-end tools">
          <h3 className="mb-1 text-lg font-extrabold">Download everything</h3>
          <p className="mb-2 text-sm text-muted">
            One Excel file with students, phones, classes, teachers, meetings and bookings. Keep it somewhere safe: it holds
            every parent&apos;s number. Do this before clearing old data.
          </p>
          <AnchorButton href="/admin/settings/export" variant="secondary" size="sm" download>
            Download everything (.xlsx)
          </AnchorButton>

          <div id="clear" className="mt-5 scroll-mt-4 border-t-2 border-line pt-4">
            <h3 className="mb-1 text-lg font-extrabold">Clear old data</h3>
            <p className="mb-3 text-sm text-muted">
              Removes meetings held long ago together with their bookings, old activity-log entries, and children archived
              that long ago who have no bookings left. Current students, classes and teachers are never touched. This cannot
              be undone.
            </p>
            <Form action="/admin/settings" scroll={false} className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="months" className={adminLabel}>
                  Older than how many months? (at least {MIN_PURGE_MONTHS})
                </label>
                <input
                  id="months"
                  name="months"
                  type="number"
                  min={MIN_PURGE_MONTHS}
                  max={MAX_PURGE_MONTHS}
                  required
                  defaultValue={months}
                  className={`${adminInput} max-w-28`}
                />
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Show what would be cleared
              </Button>
            </Form>

            {purge ? (
              <div className="mt-4 rounded-2xl border-2 border-line bg-wash p-3">
                <p className="mb-2 font-bold">Older than {months} months, right now:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    {plural(purge.meetings, "meeting", "meetings")}, with {plural(purge.bookings, "booking", "bookings")} and{" "}
                    {plural(purge.slots, "time slot", "time slots")}
                  </li>
                  <li>{plural(purge.students, "archived student", "archived students")} with no bookings left (and their phone numbers)</li>
                  <li>{plural(purge.auditRows, "activity-log entry", "activity-log entries")}</li>
                  <li>{plural(purge.importPayloads, "stored roster upload", "stored roster uploads")} older than 30 days (the history line stays)</li>
                  <li>{plural(purge.rateLimits, "sign-in counter", "sign-in counters")} older than a day</li>
                </ul>
                {purgeTotal === 0 ? (
                  <p className="mt-3 font-semibold">There is nothing old enough to clear.</p>
                ) : (
                  <form action={purgeAction} className="mt-3 space-y-2">
                    <input type="hidden" name="months" value={months} />
                    <label htmlFor="confirm" className={adminLabel}>
                      Type PURGE to clear this for good
                    </label>
                    <input
                      id="confirm"
                      name="confirm"
                      required
                      autoComplete="off"
                      autoCapitalize="characters"
                      placeholder="PURGE"
                      className={`${adminInput} max-w-48`}
                    />
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton variant="danger" size="sm">
                        Clear old data
                      </SubmitButton>
                      <LinkButton href="/admin/settings" variant="secondary" size="sm" scroll={false}>
                        Cancel
                      </LinkButton>
                    </div>
                  </form>
                )}
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </AdminFrame>
  );
}
