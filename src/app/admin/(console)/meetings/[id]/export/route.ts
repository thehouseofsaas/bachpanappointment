import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { getMeetingDetail } from "@/domain/admin-view";
import { formatPhone } from "@/domain/phone";
import { formatDate, formatTime } from "@/domain/time";
import { currentAdmin } from "@/lib/authz";
import { toCsv } from "@/lib/share";

/** Every slot and every unbooked child of one meeting as a spreadsheet. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/admin/meetings/[id]/export">) {
  if (!(await currentAdmin())) return new Response("Please sign in.", { status: 401 });
  const { id } = await ctx.params;
  const m = await getMeetingDetail(getDb(), id);
  if (!m) return new Response("Not found.", { status: 404 });
  const rows: unknown[][] = [
    ["Teacher", "Date", "Time", "Status", "Child", "Admission no.", "Class", "Phones", "Booking ref", "Booked by", "Attendance"],
  ];
  for (const s of m.sessions) {
    for (const slot of s.slots) {
      const b = slot.booking;
      rows.push([
        s.teacherName,
        formatDate(m.date, "short"),
        formatTime(slot.startsAt),
        !s.active ? "Session cancelled" : b ? "Booked" : slot.state === "blocked" ? "Blocked" : "Free",
        b?.studentName ?? "",
        b?.admissionNo ?? "",
        b?.classLabel ?? "",
        b?.phones.map(formatPhone).join(" / ") ?? "",
        b?.refCode ?? "",
        b ? (b.source === "admin" ? "Office" : "Parent") : "",
        b ? { pending: "", attended: "Attended", no_show: "Did not come" }[b.attendance] : "",
      ]);
    }
    for (const u of s.unbooked) {
      rows.push([s.teacherName, formatDate(m.date, "short"), "", "Not booked", u.name, "", u.classLabel, u.phones.map(formatPhone).join(" / "), "", "", ""]);
    }
  }
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${m.slug}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
