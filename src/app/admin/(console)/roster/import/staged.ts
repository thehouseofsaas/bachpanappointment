// Small helpers shared by the upload pages and their actions.
import type { ClassMapping } from "@/domain/import/diff";
import type { RawRow } from "@/domain/import/parse";

/** The rows kept with a staged upload, or null if they are gone or damaged. */
export function stagedRows(staged: unknown): RawRow[] | null {
  const rows = (staged as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const good = rows.every(
    (r) => r && typeof r === "object" && typeof (r as RawRow).rowNumber === "number" && Array.isArray((r as RawRow).phones),
  );
  return good ? (rows as RawRow[]) : null;
}

const PREFIX = "map.";

/** Reads the admin's class choices: fields or query keys named "map.<class key>". */
export function mappingFrom(entries: Iterable<[string, unknown]>): ClassMapping {
  const mapping: ClassMapping = {};
  for (const [key, raw] of entries) {
    if (!key.startsWith(PREFIX)) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.length <= 40) mapping[key.slice(PREFIX.length, PREFIX.length + 80)] = value;
  }
  return mapping;
}

export const mappingField = (classKey: string) => `${PREFIX}${classKey}`;

export function mappingQuery(mapping: ClassMapping): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(mapping)) params.set(mappingField(key), value);
  return params.toString();
}

export type ImportSummary = Partial<
  Record<"add" | "update" | "move" | "restore" | "unchanged" | "error" | "archive" | "bookingsCancelled", number>
>;

/** "12 added, 3 updated, 1 archived" — only the parts that are not zero. */
export function summaryText(summary: ImportSummary | null | undefined): string {
  if (!summary) return "";
  const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
  const parts = [
    n(summary.add) ? `${summary.add} added` : "",
    n(summary.update) ? `${summary.update} updated` : "",
    n(summary.move) ? `${summary.move} moved class` : "",
    n(summary.restore) ? `${summary.restore} restored` : "",
    n(summary.archive) ? `${summary.archive} archived` : "",
    n(summary.unchanged) ? `${summary.unchanged} unchanged` : "",
    n(summary.error) ? `${summary.error} left out (errors)` : "",
    n(summary.bookingsCancelled)
      ? `${summary.bookingsCancelled} ${summary.bookingsCancelled === 1 ? "booking" : "bookings"} cancelled`
      : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing changed";
}
