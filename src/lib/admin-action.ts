import "server-only";
import { redirect } from "next/navigation";

/** Ends an admin action by going back to a page with a message to show. */
export function back(path: string, kind: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

export const str = (form: FormData, key: string, max = 500) => String(form.get(key) ?? "").trim().slice(0, max);
