"use server";

import { getDb } from "@/db/client";
import { addStudent, archiveStudent, MAX_PHONES, restoreStudent, updateStudent, type StudentInput } from "@/domain/roster";
import { back, str } from "@/lib/admin-action";
import { requireAdmin } from "@/lib/authz";
import { clientIp } from "@/lib/request";

function studentInput(form: FormData): StudentInput {
  const phones = [];
  for (let n = 1; n <= MAX_PHONES; n++) {
    phones.push({ phone: str(form, `phone${n}`, 40), label: str(form, `label${n}`, 20) || null });
  }
  return {
    name: str(form, "name", 200),
    admissionNo: str(form, "admissionNo", 60),
    classSectionId: str(form, "classSectionId", 40),
    phones,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const warningText = (warnings: string[]) => (warnings.length ? ` Check: ${warnings.join(" ")}` : "");

export async function addStudentAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const res = await addStudent(getDb(), studentInput(form), { adminId: admin.id, ip: await clientIp() });
  if (!res.ok) back("/admin/roster?add=1", "error", res.error);
  back(`/admin/roster/${res.id}`, "ok", `${res.name} was added.${warningText(res.warnings)}`);
}

export async function updateStudentAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(form, "id", 40);
  const res = await updateStudent(getDb(), id, studentInput(form), { adminId: admin.id, ip: await clientIp() });
  if (!res.ok) back(`/admin/roster/${id}`, "error", `Nothing was saved. ${res.error}`);
  if (res.changed.length === 0) back(`/admin/roster/${id}`, "ok", "Nothing was different, so nothing was changed.");
  let message = `Saved (${res.changed.join(", ")}).`;
  if (res.moved) {
    message +=
      res.bookingsCancelled > 0
        ? ` ${plural(res.bookingsCancelled, "upcoming booking was", "upcoming bookings were")} cancelled because it was with the old class's teacher. Ask the parent to book again.`
        : " The child had no upcoming bookings to cancel.";
  }
  back(`/admin/roster/${id}`, "ok", message + warningText(res.warnings));
}

export async function archiveStudentAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(form, "id", 40);
  const res = await archiveStudent(getDb(), id, { adminId: admin.id, ip: await clientIp() });
  if (!res.ok) back(`/admin/roster/${id}`, "error", res.error);
  const cancelled =
    res.bookingsCancelled > 0
      ? ` ${plural(res.bookingsCancelled, "upcoming booking was", "upcoming bookings were")} cancelled.`
      : "";
  back(`/admin/roster/${id}`, "ok", `${res.name} is archived and can no longer be booked for.${cancelled} You can restore the child from this page.`);
}

export async function restoreStudentAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(form, "id", 40);
  const res = await restoreStudent(getDb(), id, { adminId: admin.id, ip: await clientIp() });
  if (!res.ok) back(`/admin/roster/${id}`, "error", res.error);
  back(`/admin/roster/${id}`, "ok", `${res.name} is active again. Bookings that were cancelled are not brought back; the parent can book again.`);
}
