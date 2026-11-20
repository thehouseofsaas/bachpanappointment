import { randomBytes, randomInt } from "node:crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no l, o, 0, 1

/** Random, URL-safe id. 16 chars of a 32-letter alphabet = 80 bits. */
export function newId(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] & 31];
  return out;
}

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Short booking reference a parent can read out at the gate, e.g. "K7M-4QP". */
export function newRefCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}
