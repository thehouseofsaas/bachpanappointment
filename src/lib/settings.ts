import { inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { settings } from "@/db/schema";

export type AppSettings = {
  schoolName: string;
  schoolPlace: string;
  /** Office phone in E.164 (shown as tap-to-call and WhatsApp). */
  officePhone: string;
  /** Small logo as a data: URL, or empty. */
  logoDataUrl: string;
  /** Second check at sign-in: parents also type the child's admission number. */
  requireAdmissionNo: boolean;
  /** How many times a parent may change or cancel per child per meeting. */
  parentChangeLimit: number;
  defaultSlotMinutes: number;
  privacyNote: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  schoolName: "Bachpan Play School",
  schoolPlace: "Rajpura",
  officePhone: "",
  logoDataUrl: "",
  requireAdmissionNo: false,
  parentChangeLimit: 3,
  defaultSlotMinutes: 10,
  privacyNote:
    "We use your mobile number only to find your child in the school's records and to manage this booking.",
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as Array<keyof AppSettings>;

export async function getSettings(db: DbOrTx): Promise<AppSettings> {
  const rows = await db.select().from(settings).where(inArray(settings.key, KEYS));
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    const def = DEFAULT_SETTINGS[row.key as keyof AppSettings];
    if (typeof row.value === typeof def) out[row.key] = row.value;
  }
  return out as AppSettings;
}

/** Only keys in the fixed list above can ever be written. */
export async function saveSettings(db: DbOrTx, patch: Partial<AppSettings>): Promise<void> {
  for (const key of KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (typeof value !== typeof DEFAULT_SETTINGS[key]) continue;
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value` } });
  }
}
