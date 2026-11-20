// Phone numbers are the parent's identity, so every spelling of the same
// number must normalize to one E.164 string (+919876543210).
import { parsePhoneNumberFromString } from "libphonenumber-js";

export type PhoneResult =
  | { ok: true; phone: string; warning?: string }
  | { ok: false; error: string };

const DIGIT_MAPS: Array<[number, number]> = [
  [0x0966, 0x096f], // Devanagari ०-९
  [0x0a66, 0x0a6f], // Gurmukhi ੦-੯
];

function toAsciiDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const map = DIGIT_MAPS.find(([lo, hi]) => cp >= lo && cp <= hi);
    out += map ? String(cp - map[0]) : ch;
  }
  return out;
}

const PLACEHOLDERS = new Set(["9999999999", "9876543210", "1234567890", "0000000000", "9999999990", "9898989898"]);

function isPlaceholder(national: string): boolean {
  return PLACEHOLDERS.has(national) || /^(\d)\1{9}$/.test(national);
}

/**
 * Normalizes one phone value. Accepts strings and numbers (Excel stores
 * phone columns as numbers, sometimes with a trailing ".0").
 */
export function normalizePhone(raw: unknown): PhoneResult {
  if (raw === null || raw === undefined) return { ok: false, error: "No phone number." };
  let s: string;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, error: "Not a phone number." };
    s = Number.isInteger(raw) ? String(raw) : raw.toFixed(0);
  } else {
    s = String(raw);
  }
  s = toAsciiDigits(s.normalize("NFKC")).trim();
  if (!s) return { ok: false, error: "No phone number." };

  // Excel turned the number into scientific notation and digits were lost.
  if (/^\d(\.\d+)?e\+?\d+$/i.test(s)) {
    return { ok: false, error: `"${s}" lost digits in the spreadsheet. Format the phone column as Text and re-enter it.` };
  }
  s = s.replace(/^['’`]/, "").replace(/\.0+$/, "");
  const international = s.startsWith("+") || s.startsWith("00");
  let digits = s.replace(/\D/g, "");
  if (!digits) return { ok: false, error: `"${String(raw)}" is not a phone number.` };

  if (s.startsWith("00")) digits = digits.slice(2);

  // Explicit country code that is not India: keep, validate with the library.
  if (international && !digits.startsWith("91")) {
    const parsed = parsePhoneNumberFromString(`+${digits}`);
    if (!parsed || !parsed.isValid()) return { ok: false, error: `"${String(raw)}" is not a valid international number.` };
    return { ok: true, phone: parsed.number };
  }

  // Indian number: strip trunk 0 and country code 91.
  let national = digits;
  if (national.length === 11 && national.startsWith("0")) national = national.slice(1);
  else if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
  else if (national.length === 13 && national.startsWith("091")) national = national.slice(3);

  if (national.length !== 10) {
    return {
      ok: false,
      error:
        national.length < 10
          ? `"${String(raw)}" is too short (${national.length} digits, need 10).`
          : `"${String(raw)}" is too long (${national.length} digits, need 10).`,
    };
  }
  if (!/^[6-9]/.test(national)) {
    return { ok: false, error: `"${String(raw)}" is not a mobile number (Indian mobiles start with 6, 7, 8 or 9).` };
  }
  const phone = `+91${national}`;
  if (isPlaceholder(national)) return { ok: true, phone, warning: "Looks like a placeholder number." };
  return { ok: true, phone };
}

/** Splits a cell that may hold several numbers ("98765 43210 / 9123456780"). */
export function splitPhoneCell(raw: unknown): unknown[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === "number") return [raw];
  const s = String(raw).trim();
  if (!s) return [];
  const parts = s
    .split(/[\/,;|\n]|\s+(?:or|and)\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [s];
}

/** "+919876543210" -> "98765 43210"; other countries shown as stored. */
export function formatPhone(phone: string): string {
  if (phone.startsWith("+91") && phone.length === 13) return `${phone.slice(3, 8)} ${phone.slice(8)}`;
  return phone;
}

/** Last two digits, for "changed from number ending ••42". */
export function phoneTail(phone: string): string {
  return phone.slice(-2);
}

/** Digits only, for wa.me links. */
export function waNumber(phone: string): string {
  return phone.replace(/\D/g, "");
}
