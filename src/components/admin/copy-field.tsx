"use client";

import { useState } from "react";

/** Read-only text with a Copy button; `multiline` for messages to paste into WhatsApp. */
export function CopyField({ value, label, multiline = false }: { value: string; label: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the text stays selectable for manual copying */
    }
  };
  const cls = "block w-full min-w-0 rounded-xl border-2 border-line bg-wash px-3 py-2 text-base text-navy";
  return (
    <div>
      <p className="mb-1 text-sm font-bold">{label}</p>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea readOnly value={value} rows={4} aria-label={label} className={cls} onFocus={(e) => e.currentTarget.select()} />
        ) : (
          <input readOnly value={value} aria-label={label} className={`${cls} min-h-11`} onFocus={(e) => e.currentTarget.select()} />
        )}
        <button
          type="button"
          onClick={copy}
          className="min-h-11 shrink-0 cursor-pointer rounded-xl border-2 border-line bg-paper px-3 text-sm font-bold"
          aria-live="polite"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print min-h-11 cursor-pointer rounded-xl border-2 border-sunshine-deep bg-sunshine px-4 font-display font-bold"
    >
      Print
    </button>
  );
}
