"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Slots change while a tab sits in the background; refetch when the parent comes back. */
export function RefreshOnFocus() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 15_000) {
        last = Date.now();
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [router]);
  return null;
}
