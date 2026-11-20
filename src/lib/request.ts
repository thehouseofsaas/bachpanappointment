import "server-only";
import { headers } from "next/headers";

/** Best-effort client IP (first hop of X-Forwarded-For, as set by Vercel or a reverse proxy). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64);
  return h.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

/** Public origin of this site as the visitor sees it, e.g. "https://ptm.example.com". */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
