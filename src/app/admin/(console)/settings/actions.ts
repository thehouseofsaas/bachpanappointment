"use server";

import { hash, verify } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getDb, pgError } from "@/db/client";
import { purgeOldData } from "@/domain/purge";
import { back, str } from "@/lib/admin-action";
import { audit } from "@/lib/audit";
import { requireAdmin, requireOwner } from "@/lib/authz";
import { newId } from "@/lib/ids";
import { passwordProblem } from "@/lib/passwords";
import { hit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { adminSession } from "@/lib/session";
import { saveSettings } from "@/lib/settings";

const PAGE = "/admin/settings";
const MAX_LOGO_BYTES = 150 * 1024;

const tidy = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function imageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

// --------------------------------------------------------------- school

export async function saveSchoolAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const schoolName = tidy(str(form, "schoolName", 200));
  const schoolPlace = tidy(str(form, "schoolPlace", 200));
  const phoneRaw = str(form, "officePhone", 40);
  if (!schoolName) back(PAGE, "error", "Enter the school's name. Nothing was saved.");
  if (schoolName.length > 80 || schoolPlace.length > 80) {
    back(PAGE, "error", "The school name and place can be at most 80 characters each. Nothing was saved.");
  }
  let officePhone = "";
  if (phoneRaw) {
    const parsed = parsePhoneNumberFromString(phoneRaw, "IN");
    if (!parsed || !parsed.isValid()) {
      back(
        PAGE,
        "error",
        `"${phoneRaw}" is not a valid phone number. For a landline include the STD code, for example 01762 500000. Nothing was saved.`,
      );
    }
    officePhone = parsed.number;
  }
  const ip = await clientIp();
  await getDb().transaction(async (tx) => {
    await saveSettings(tx, { schoolName, schoolPlace, officePhone });
    await audit(tx, {
      actorType: "admin",
      actor: admin.id,
      action: "settings.update",
      entity: "settings",
      detail: { schoolName, schoolPlace, officePhone },
      ip,
    });
  });
  back(PAGE, "ok", "School details saved.");
}

export async function uploadLogoAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) back(PAGE, "error", "Choose a picture first.");
  if (file.size > MAX_LOGO_BYTES) {
    back(PAGE, "error", `That picture is ${Math.ceil(file.size / 1024)} KB. The logo can be at most 150 KB — make it smaller and try again.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = imageType(bytes);
  if (!type) back(PAGE, "error", "The logo must be a PNG, JPEG or WebP picture.");
  const logoDataUrl = `data:${type};base64,${bytes.toString("base64")}`;
  const ip = await clientIp();
  await getDb().transaction(async (tx) => {
    await saveSettings(tx, { logoDataUrl });
    await audit(tx, {
      actorType: "admin",
      actor: admin.id,
      action: "settings.logo",
      entity: "settings",
      detail: { type, kb: Math.ceil(bytes.length / 1024) },
      ip,
    });
  });
  back(PAGE, "ok", "Logo saved. Parents will see it on the booking pages.");
}

export async function removeLogoAction(): Promise<void> {
  const admin = await requireAdmin();
  const ip = await clientIp();
  await getDb().transaction(async (tx) => {
    await saveSettings(tx, { logoDataUrl: "" });
    await audit(tx, { actorType: "admin", actor: admin.id, action: "settings.logo", entity: "settings", detail: { removed: true }, ip });
  });
  back(PAGE, "ok", "Logo removed.");
}

// -------------------------------------------------------- booking rules

export async function saveBookingRulesAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const requireAdmissionNo = form.get("requireAdmissionNo") === "on";
  const limitText = str(form, "parentChangeLimit", 10);
  const slotText = str(form, "defaultSlotMinutes", 10);
  const privacyNote = str(form, "privacyNote", 2000).replace(/\s+/g, " ");
  const parentChangeLimit = Number(limitText);
  const defaultSlotMinutes = Number(slotText);
  if (!/^\d+$/.test(limitText) || parentChangeLimit < 1 || parentChangeLimit > 10) {
    back(PAGE, "error", "The change limit must be a whole number from 1 to 10. Nothing was saved.");
  }
  if (!/^\d+$/.test(slotText) || defaultSlotMinutes < 5 || defaultSlotMinutes > 60) {
    back(PAGE, "error", "The usual slot length must be a whole number of minutes from 5 to 60. Nothing was saved.");
  }
  if (!privacyNote) back(PAGE, "error", "The privacy note cannot be empty: parents see it where they type their number. Nothing was saved.");
  if (privacyNote.length > 400) back(PAGE, "error", "The privacy note can be at most 400 characters. Nothing was saved.");

  const ip = await clientIp();
  const db = getDb();
  await db.transaction(async (tx) => {
    await saveSettings(tx, { requireAdmissionNo, parentChangeLimit, defaultSlotMinutes, privacyNote });
    await audit(tx, {
      actorType: "admin",
      actor: admin.id,
      action: "settings.update",
      entity: "settings",
      detail: { requireAdmissionNo, parentChangeLimit, defaultSlotMinutes },
      ip,
    });
  });
  let message = "Booking rules saved.";
  if (requireAdmissionNo) {
    const res = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from students where archived_at is null and admission_no is null`,
    );
    const n = res.rows[0].n;
    if (n > 0) {
      message += ` Careful: ${plural(n, "active student has", "active students have")} no admission number, so their parents cannot sign in until you add one.`;
    }
  }
  back(PAGE, "ok", message);
}

// ------------------------------------------------------- admin accounts

export async function addAdminAction(form: FormData): Promise<void> {
  const owner = await requireOwner();
  const name = tidy(str(form, "name", 200));
  const username = str(form, "username", 100).toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = str(form, "role", 10) === "owner" ? "owner" : "admin";
  if (!name || name.length > 80) back(PAGE, "error", "Enter the person's name (at most 80 characters). No account was made.");
  if (!/^[a-z0-9._-]{3,60}$/.test(username)) {
    back(PAGE, "error", "The username needs 3 to 60 small letters, digits, dots or dashes, with no spaces. No account was made.");
  }
  const problem = passwordProblem(password);
  if (problem) back(PAGE, "error", `${problem} No account was made.`);
  const passwordHash = await hash(password);
  const ip = await clientIp();
  const id = newId();
  try {
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`
        insert into admin_users (id, name, username, password_hash, role)
        values (${id}, ${name}, ${username}, ${passwordHash}, ${role})`);
      await audit(tx, {
        actorType: "admin",
        actor: owner.id,
        action: "admin.add",
        entity: "admin",
        entityId: id,
        detail: { name, username, role },
        ip,
      });
    });
  } catch (err) {
    const pg = pgError(err);
    if (pg?.code === "23505" && pg.constraint === "admin_users_username_key") {
      back(PAGE, "error", `The username "${username}" is already taken. Choose another. No account was made.`);
    }
    throw err;
  }
  back(PAGE, "ok", `Account made for ${name}. Give them the username "${username}" and the password, and ask them to change it after signing in.`);
}

export async function setAdminActiveAction(form: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = str(form, "id", 40);
  const active = str(form, "active", 5) === "1";
  if (id === owner.id) back(PAGE, "error", "You cannot disable your own account. Ask another owner to do it.");
  const ip = await clientIp();
  const result = await getDb().transaction(async (tx): Promise<{ error?: string; name?: string; unchanged?: boolean }> => {
    // Lock every account so two owners cannot disable each other at the same moment.
    const all = await tx.execute<{ id: string; name: string; role: string; active: boolean }>(
      sql`select id, name, role, active from admin_users order by id for update`,
    );
    const target = all.rows.find((a) => a.id === id);
    if (!target) return { error: "That account no longer exists." };
    if (target.active === active) return { name: target.name, unchanged: true };
    if (!active && target.role === "owner" && !all.rows.some((a) => a.role === "owner" && a.active && a.id !== id)) {
      return { error: "That is the last active owner account. Make another owner first." };
    }
    // Disabling signs the person out everywhere; enabling also clears a lock from wrong passwords.
    await tx.execute(sql`
      update admin_users
      set active = ${active}, session_version = session_version + ${active ? 0 : 1}, failed_logins = 0, locked_until = null
      where id = ${id}`);
    await audit(tx, {
      actorType: "admin",
      actor: owner.id,
      action: active ? "admin.enable" : "admin.disable",
      entity: "admin",
      entityId: id,
      detail: { name: target.name },
      ip,
    });
    return { name: target.name };
  });
  if (result.error) back(PAGE, "error", result.error);
  if (result.unchanged) back(PAGE, "ok", `${result.name}'s account was already ${active ? "active" : "disabled"}.`);
  back(
    PAGE,
    "ok",
    active ? `${result.name} can sign in again.` : `${result.name}'s account is disabled and signed out everywhere.`,
  );
}

export async function resetAdminPasswordAction(form: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = str(form, "id", 40);
  const password = String(form.get("password") ?? "");
  if (id === owner.id) back(PAGE, "error", "To change your own password, use “Change my password” below.");
  const problem = passwordProblem(password);
  if (problem) back(PAGE, "error", `${problem} The password was not changed.`);
  const passwordHash = await hash(password);
  const ip = await clientIp();
  const name = await getDb().transaction(async (tx) => {
    const res = await tx.execute<{ name: string }>(sql`
      update admin_users
      set password_hash = ${passwordHash}, session_version = session_version + 1, failed_logins = 0, locked_until = null
      where id = ${id} returning name`);
    if (!res.rows[0]) return null;
    await audit(tx, {
      actorType: "admin",
      actor: owner.id,
      action: "admin.password_reset",
      entity: "admin",
      entityId: id,
      detail: { name: res.rows[0].name },
      ip,
    });
    return res.rows[0].name;
  });
  if (!name) back(PAGE, "error", "That account no longer exists.");
  back(PAGE, "ok", `New password set for ${name}. They are signed out everywhere; give them the new password.`);
}

export async function changeMyPasswordAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const current = String(form.get("current") ?? "").slice(0, 200);
  const next = String(form.get("next") ?? "");
  const again = String(form.get("again") ?? "");
  const db = getDb();
  if (!(await hit(db, `admin-password:${admin.id}`, 10, 15 * 60))) {
    back(PAGE, "error", "Too many tries. Wait fifteen minutes and try again.");
  }
  const problem = passwordProblem(next);
  if (problem) back(PAGE, "error", `${problem} Your password was not changed.`);
  if (next !== again) back(PAGE, "error", "The two new passwords are not the same. Your password was not changed.");
  const rows = await db.execute<{ password_hash: string }>(sql`select password_hash from admin_users where id = ${admin.id}`);
  const good = rows.rows[0] ? await verify(rows.rows[0].password_hash, current).catch(() => false) : false;
  if (!good) back(PAGE, "error", "The current password is not right. Your password was not changed.");

  const passwordHash = await hash(next);
  const ip = await clientIp();
  const version = await db.transaction(async (tx) => {
    const res = await tx.execute<{ session_version: number }>(sql`
      update admin_users set password_hash = ${passwordHash}, session_version = session_version + 1
      where id = ${admin.id} returning session_version`);
    await audit(tx, { actorType: "admin", actor: admin.id, action: "admin.password_change", entity: "admin", entityId: admin.id, ip });
    return res.rows[0].session_version;
  });
  // Every other device is signed out; this one stays signed in.
  const session = await adminSession();
  session.v = version;
  await session.save();
  back(PAGE, "ok", "Your password is changed. Other devices signed in with this account have been signed out.");
}

// ------------------------------------------------------- year-end tools

export async function purgeAction(form: FormData): Promise<void> {
  const owner = await requireOwner();
  const monthsText = str(form, "months", 5);
  const months = /^\d{1,3}$/.test(monthsText) ? Number(monthsText) : NaN;
  const here = `${PAGE}?months=${encodeURIComponent(monthsText)}`;
  if (str(form, "confirm", 20).toUpperCase() !== "PURGE") {
    back(here, "error", "Nothing was cleared. Type PURGE in the box to confirm.");
  }
  const res = await purgeOldData(getDb(), months, { adminId: owner.id, ip: await clientIp() });
  if (!res.ok) back(PAGE, "error", `Nothing was cleared. ${res.error}`);
  const c = res.counts;
  const parts = [
    c.meetings ? `${plural(c.meetings, "meeting", "meetings")} with ${plural(c.bookings, "booking", "bookings")}` : "",
    c.students ? plural(c.students, "archived student", "archived students") : "",
    c.auditRows ? plural(c.auditRows, "activity-log entry", "activity-log entries") : "",
    c.importPayloads ? plural(c.importPayloads, "stored roster upload", "stored roster uploads") : "",
  ].filter(Boolean);
  back(PAGE, "ok", parts.length ? `Cleared: ${parts.join(", ")}.` : "There was nothing old enough to clear.");
}
