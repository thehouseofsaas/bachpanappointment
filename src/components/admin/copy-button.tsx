"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/button";

/** Copies a piece of text (for example a private link) and says so. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <button type="button" onClick={copy} className={buttonClass({ variant: "secondary", size: "sm" })}>
      <span aria-live="polite">
        {state === "copied" ? "Copied ✓" : state === "failed" ? "Select the link and copy it" : label}
      </span>
    </button>
  );
}
