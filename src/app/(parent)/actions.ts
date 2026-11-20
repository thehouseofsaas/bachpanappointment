"use server";

import { sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { bookSlot, cancelBooking, changeSlot, type BookingErrorCode } from "@/domain/booking";
import { tidyAdmissionNo } from "@/domain/import/normalize-class";
import { normalizePhone } from "@/domain/phone";
import { audit } from "@/lib/audit";
import { currentParentPhone } from "@/lib/authz";
import { hit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { parentSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { t } from "@/lib/strings";

export type SignInState = { error?: string; phone?: string };

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const db = getDb();
  const ip = await clientIp();
  const raw = String(form.get("phone") ?? "").slice(0, 40);
  const settings = await getSettings(db);

  const parsed = normalizePhone(raw);
  if (!parsed.ok) return { error: t.landing.invalidPhone, phone: raw };
  const phone = parsed.phone;

  // Generous per-network limit (mobile carriers share addresses between many
  // phones), a tighter one per target number, and a global ceiling.
  const withinIp = await hit(db, `signin:ip:${ip}`, 40, 15 * 60);
  const withinPhone = await hit(db, `signin:phone:${phone}`, 12, 60 * 60);
  if (!withinIp || !withinPhone) return { error: t.landing.tooMany, phone: raw };

  const kids = await db.execute<{ admission_no: string | null }>(sql`
    select st.admission_no from student_phones p join students st on st.id = p.student_id
    where p.phone = ${phone} and st.archived_at is null`);

  let ok = kids.rows.length > 0;
  if (ok && settings.requireAdmissionNo) {
    const given = tidyAdmissionNo(form.get("admissionNo"));
    ok = !!given && kids.rows.some((k) => k.admission_no === given);
  }
  if (!ok) {
    const withinGlobal = await hit(db, "signin:failed:all", 400, 60 * 60);
    if (!withinGlobal) {
      await audit(db, { actorType: "system", action: "signin.flood", detail: { note: "Many failed sign-ins in one hour" } });
    }
    return {
      error: settings.requireAdmissionNo ? t.landing.notFoundWithAdmission : t.landing.notFound,
      phone: raw,
    };
  }

  const session = await parentSession();
  session.phone = phone;
  await session.save();
  redirect("/my");
}

export async function signOut(): Promise<void> {
  const session = await parentSession();
  session.destroy();
  redirect("/");
}

export type ActionResult = { ok: true } | { ok: false; code: BookingErrorCode | "SIGNED_OUT"; message: string };

async function parentActor() {
  const phone = await currentParentPhone();
  if (!phone) return null;
  return { kind: "parent" as const, phone, ip: await clientIp() };
}

const signedOut: ActionResult = { ok: false, code: "SIGNED_OUT", message: t.my.notOnRoster };

function fail(code: BookingErrorCode): ActionResult {
  return { ok: false, code, message: t.errors[code] };
}

export async function bookAction(slotId: string, studentId: string): Promise<ActionResult> {
  const actor = await parentActor();
  if (!actor) return signedOut;
  const db = getDb();
  if (!(await hit(db, `book:${actor.phone}`, 30, 10 * 60))) return fail("BUSY");
  const res = await bookSlot(db, { slotId: String(slotId), studentId: String(studentId), actor });
  refresh(); // show fresh slots whether it worked or not
  return res.ok ? { ok: true } : fail(res.code);
}

export async function changeAction(bookingId: string, newSlotId: string): Promise<ActionResult> {
  const actor = await parentActor();
  if (!actor) return signedOut;
  const db = getDb();
  if (!(await hit(db, `book:${actor.phone}`, 30, 10 * 60))) return fail("BUSY");
  const { parentChangeLimit } = await getSettings(db);
  const res = await changeSlot(db, {
    bookingId: String(bookingId),
    newSlotId: String(newSlotId),
    actor,
    changeLimit: parentChangeLimit,
  });
  refresh();
  return res.ok ? { ok: true } : fail(res.code);
}

export async function cancelAction(bookingId: string): Promise<ActionResult> {
  const actor = await parentActor();
  if (!actor) return signedOut;
  const db = getDb();
  const { parentChangeLimit } = await getSettings(db);
  const res = await cancelBooking(db, { bookingId: String(bookingId), actor, changeLimit: parentChangeLimit });
  refresh();
  return res.ok ? { ok: true } : fail(res.code);
}

/** "Keep this time" after the school moved the meeting to another date. */
export async function keepTimeAction(bookingId: string): Promise<ActionResult> {
  const actor = await parentActor();
  if (!actor) return signedOut;
  await getDb().execute(sql`
    update bookings b set time_changed_at = null
    where b.id = ${String(bookingId)} and b.status = 'booked'
      and exists (select 1 from student_phones p where p.student_id = b.student_id and p.phone = ${actor.phone})`);
  refresh();
  return { ok: true };
}
