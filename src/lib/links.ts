import { createHmac, timingSafeEqual } from "node:crypto";

// Teacher schedule links carry no stored token: the link is the teacher's id
// plus a signature over (id, link_version). Bumping link_version in the
// database makes every older link stop working.

function sign(secret: string, teacherId: string, version: number): string {
  return createHmac("sha256", secret).update(`teacher-link:${teacherId}:${version}`).digest("base64url").slice(0, 24);
}

export function teacherLinkToken(secret: string, teacherId: string, version: number): string {
  return `${teacherId}.${sign(secret, teacherId, version)}`;
}

export function parseTeacherLink(token: string): { teacherId: string; signature: string } | null {
  const m = /^([a-z0-9]{6,32})\.([A-Za-z0-9_-]{24})$/.exec(token);
  return m ? { teacherId: m[1], signature: m[2] } : null;
}

export function verifyTeacherLink(secret: string, teacherId: string, version: number, signature: string): boolean {
  const expected = Buffer.from(sign(secret, teacherId, version));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
