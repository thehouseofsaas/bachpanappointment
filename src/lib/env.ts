import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return v;
}

/** 32+ character secret that encrypts session cookies and signs teacher links. */
export function sessionSecret(): string {
  const v = required("SESSION_SECRET");
  if (v.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters long.");
  return v;
}

export const isProduction = process.env.NODE_ENV === "production";
