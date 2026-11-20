// Text and links a parent can take away from a booking. Nothing here is sent
// by the server; the parent taps to share or save.
import { formatFullDay, formatTime } from "@/domain/time";

export type ShareBooking = {
  childName: string;
  classLabel: string;
  teacherName: string;
  startsAt: Date;
  endsAt: Date;
  room?: string | null;
  venue?: string | null;
  refCode: string;
  schoolName: string;
  meetingTitle: string;
};

export function bookingText(b: ShareBooking, siteUrl?: string): string {
  const where = [b.room, b.venue].filter(Boolean).join(", ");
  return [
    `${b.meetingTitle} — ${b.schoolName}`,
    `Child: ${b.childName} (${b.classLabel})`,
    `Teacher: ${b.teacherName}`,
    `When: ${formatFullDay(b.startsAt)}, ${formatTime(b.startsAt)} (India time)`,
    where ? `Where: ${where}` : null,
    `Booking ref: ${b.refCode}`,
    siteUrl ? `Change or cancel: ${siteUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Opens WhatsApp with the text ready to send to any chat (including "message yourself"). */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Opens a WhatsApp chat with one number, text pre-filled. */
export function whatsappChatUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export function googleCalendarUrl(b: ShareBooking): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${b.meetingTitle}: ${b.childName} with ${b.teacherName}`,
    dates: `${stamp(b.startsAt)}/${stamp(b.endsAt)}`,
    details: `${b.schoolName}\nChild: ${b.childName} (${b.classLabel})\nBooking ref: ${b.refCode}`,
    location: [b.room, b.venue, b.schoolName].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

export function icsFile(b: ShareBooking, uid: string, now: Date): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PTM Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@ptm-booking`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(b.startsAt)}`,
    `DTEND:${stamp(b.endsAt)}`,
    `SUMMARY:${icsEscape(`${b.meetingTitle}: ${b.childName} with ${b.teacherName}`)}`,
    `DESCRIPTION:${icsEscape(`${b.schoolName}\nChild: ${b.childName} (${b.classLabel})\nBooking ref: ${b.refCode}`)}`,
    `LOCATION:${icsEscape([b.room, b.venue, b.schoolName].filter(Boolean).join(", "))}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Parent-teacher meeting",
    "TRIGGER:-PT60M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Guards spreadsheet exports against formula injection. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
