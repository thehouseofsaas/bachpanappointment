// All school time is India time (UTC+05:30, no daylight saving).
// Instants are stored as timestamptz; these helpers convert to and from the
// wall-clock date and time an admin types or a parent reads.

export const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-31). */
export function isValidDate(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Minutes since midnight for "HH:MM" (or "HH:MM:SS"); null if malformed. */
export function parseTime(time: string): number | null {
  const m = TIME_RE.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** The instant of a wall-clock date + minutes-since-midnight in India. */
export function istToInstant(date: string, minutes: number): Date {
  const m = DATE_RE.exec(date);
  if (!m || !isValidDate(date)) throw new Error(`Invalid date: ${date}`);
  const utcMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + (minutes - IST_OFFSET_MIN) * 60_000;
  return new Date(utcMs);
}

/** India wall-clock parts of an instant. */
export function istParts(instant: Date): { date: string; minutes: number } {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MIN * 60_000);
  const date = shifted.toISOString().slice(0, 10);
  return { date, minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

export function istDate(instant: Date): string {
  return istParts(instant).date;
}

/** Whole days from date a to date b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dayFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});
const shortDayFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const weekdayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, weekday: "long" });
const yearFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, year: "numeric" });

/** "10:20 am" */
export function formatTime(instant: Date): string {
  return timeFmt.format(instant).replace(/ | /g, " ").toLowerCase();
}
/** "Saturday, 12 December" */
export function formatDay(instant: Date): string {
  return dayFmt.format(instant);
}
/** "Sat, 12 Dec" */
export function formatShortDay(instant: Date): string {
  return shortDayFmt.format(instant);
}
export function formatWeekday(instant: Date): string {
  return weekdayFmt.format(instant);
}
/** "Saturday, 12 December 2026" */
export function formatFullDay(instant: Date): string {
  return `${dayFmt.format(instant)} ${yearFmt.format(instant)}`;
}
/** "Sat, 12 Dec, 10:20 am" */
export function formatDayTime(instant: Date): string {
  return `${formatShortDay(instant)}, ${formatTime(instant)}`;
}
/** Formats a YYYY-MM-DD date. */
export function formatDate(date: string, style: "long" | "short" | "full" = "long"): string {
  const noon = istToInstant(date, 12 * 60);
  return style === "short" ? formatShortDay(noon) : style === "full" ? formatFullDay(noon) : formatDay(noon);
}
/** Value for <input type="datetime-local"> in India time. */
export function toLocalInput(instant: Date): string {
  const { date, minutes } = istParts(instant);
  return `${date}T${minutesToTime(minutes)}`;
}
/** Parses <input type="datetime-local"> (India time); null if malformed. */
export function fromLocalInput(value: string): Date | null {
  const [date, time] = value.split("T");
  if (!date || !time || !isValidDate(date)) return null;
  const minutes = parseTime(time);
  return minutes === null ? null : istToInstant(date, minutes);
}
