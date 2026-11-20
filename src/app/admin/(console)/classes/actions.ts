"use server";

import { getDb } from "@/db/client";
import { addClass, addTeacher, regenerateTeacherLink, updateClass, updateTeacher } from "@/domain/roster";
import { back, str } from "@/lib/admin-action";
import { requireAdmin } from "@/lib/authz";
import { clientIp } from "@/lib/request";

const PAGE = "/admin/classes";

export async function addClassAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const res = await addClass(
    getDb(),
    { className: str(form, "className", 80), section: str(form, "section", 20), teacherId: str(form, "teacherId", 40) || null },
    { adminId: admin.id, ip: await clientIp() },
  );
  if (!res.ok) back(PAGE, "error", res.error);
  back(PAGE, "ok", `${res.label} was added. Check its class teacher, colour and badge below.`);
}

export async function updateClassAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const orderText = str(form, "sortOrder", 10);
  if (!/^\d{1,4}$/.test(orderText)) back(PAGE, "error", "Order must be a whole number from 0 to 9999. Nothing was saved.");
  const res = await updateClass(
    getDb(),
    str(form, "id", 40),
    {
      label: str(form, "label", 80),
      teacherId: str(form, "teacherId", 40) || null,
      color: str(form, "color", 20),
      badge: str(form, "badge", 20),
      sortOrder: Number(orderText),
      active: form.get("active") === "on",
    },
    { adminId: admin.id, ip: await clientIp() },
  );
  if (!res.ok) back(PAGE, "error", `Nothing was saved. ${res.error}`);
  if (res.changed.length === 0) back(PAGE, "ok", `Nothing was different for ${res.label}.`);
  let message = `${res.label} saved (${res.changed.join(", ")}).`;
  if (res.changed.includes("class teacher")) {
    message += " A meeting that is already published keeps its sessions as they are — use Substitute teacher on the meeting page.";
  }
  back(PAGE, "ok", message);
}

export async function addTeacherAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const res = await addTeacher(getDb(), str(form, "name", 200), { adminId: admin.id, ip: await clientIp() });
  if (!res.ok) back(PAGE, "error", res.error);
  back(PAGE, "ok", `${res.name} was added. Choose them as a class teacher in the classes list.`);
}

export async function updateTeacherAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const res = await updateTeacher(
    getDb(),
    str(form, "id", 40),
    { name: str(form, "name", 200), active: form.get("active") === "on" },
    { adminId: admin.id, ip: await clientIp() },
  );
  if (!res.ok) back(PAGE, "error", `Nothing was saved. ${res.error}`);
  if (res.changed.length === 0) back(PAGE, "ok", `Nothing was different for ${res.name}.`);
  back(PAGE, "ok", `${res.name} saved (${res.changed.join(", ")}).`);
}

export async function newTeacherLinkAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const res = await regenerateTeacherLink(getDb(), str(form, "id", 40), { adminId: admin.id, ip: await clientIp() });
  if (!res.ok) back(PAGE, "error", res.error);
  back(PAGE, "ok", `${res.name} has a new schedule link. The old link no longer works — send the new one.`);
}
