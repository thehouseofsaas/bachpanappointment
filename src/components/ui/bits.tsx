import type { ComponentProps, ReactNode } from "react";
import type { Tone } from "@/theme/tones";

export function Card({ tone, className = "", ...props }: ComponentProps<"div"> & { tone?: Tone }) {
  return (
    <div
      data-tone={tone}
      {...props}
      className={`rounded-card border-2 bg-paper p-4 sticker ${
        tone ? "border-tone [--sticker-edge:var(--tone)]" : "border-line"
      } ${className}`}
    />
  );
}

const noticeIcons: Record<string, string> = {
  info: "i",
  good: "✓",
  warn: "!",
  bad: "!",
};

/** A coloured message. Meaning is carried by the icon and words, not colour alone. */
export function Notice({
  kind = "info",
  children,
  className = "",
  role,
}: {
  kind?: "info" | "good" | "warn" | "bad";
  children: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const tone = { info: "sky", good: "leaf", warn: "tangerine", bad: "coral" }[kind];
  return (
    <div
      data-tone={tone}
      role={role}
      className={`flex gap-3 rounded-2xl border-2 border-tone bg-tone-soft px-3.5 py-3 text-tone-ink ${className}`}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-tone-ink text-sm font-extrabold text-white"
      >
        {noticeIcons[kind]}
      </span>
      <div className="min-w-0 font-semibold">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      data-tone={tone}
      className={`inline-flex items-center gap-1 rounded-full bg-tone-soft px-2.5 py-0.5 text-sm font-bold text-tone-ink ${className}`}
    >
      {children}
    </span>
  );
}

export const inputClass =
  "block w-full min-h-12 rounded-2xl border-2 border-line bg-paper px-4 text-lg font-semibold text-navy " +
  "placeholder:text-muted/60 placeholder:font-normal focus:border-grape focus:outline-none";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block font-display text-lg font-bold">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-sm font-bold text-coral-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
