"use server";

import { refresh } from "next/cache";
import { getDb } from "@/db/client";
import { setAttendance } from "@/domain/booking";
import { findTeacher } from "@/domain/teacher-view";
import { sessionSecret } from "@/lib/env";
import { parseTeacherLink, verifyTeacherLink } from "@/lib/links";
import { hit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

/** Marks one booking attended / not. The link is verified again here; the page is not trusted. */
export async function markAttendance(form: FormData): Promise<void> {
  const link = String(form.get("link") ?? "");
  const bookingId = String(form.get("bookingId") ?? "");
  const value = String(form.get("attendance") ?? "");
  if (value !== "attended" && value !== "no_show" && value !== "pending") return;
  const parsed = parseTeacherLink(link);
  if (!parsed) return;
  const db = getDb();
  const teacher = await findTeacher(db, parsed.teacherId);
  if (!teacher || !teacher.active) return;
  if (!verifyTeacherLink(sessionSecret(), teacher.id, teacher.link_version, parsed.signature)) return;
  const ip = await clientIp();
  if (!(await hit(db, `teacher:${teacher.id}`, 300, 10 * 60))) return;
  await setAttendance(db, {
    bookingId,
    attendance: value,
    teacherId: teacher.id,
    actor: { actorType: "teacher", actor: teacher.id, ip },
  });
  refresh();
}
