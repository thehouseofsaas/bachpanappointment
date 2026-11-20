import Link from "next/link";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "tone" | "danger" | "leaf" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-btn font-display font-bold leading-none text-center select-none " +
  "sticker sticker-press disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer no-underline";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-sunshine text-navy border-2 border-sunshine-deep [--sticker-edge:var(--sunshine-deep)]",
  secondary: "bg-paper text-navy border-2 border-line [--sticker-edge:var(--line)]",
  tone: "bg-tone-soft text-tone-ink border-2 border-tone [--sticker-edge:var(--tone)]",
  danger: "bg-coral-soft text-coral-ink border-2 border-coral [--sticker-edge:var(--coral)]",
  leaf: "bg-leaf-soft text-leaf-ink border-2 border-leaf [--sticker-edge:var(--leaf)]",
  quiet: "bg-transparent text-navy underline underline-offset-4 shadow-none! active:translate-y-0!",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3.5 text-sm",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-6 text-lg",
};

export function buttonClass(opts: { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; className?: string } = {}) {
  const { variant = "primary", size = "md", full, className } = opts;
  return [base, variants[variant], sizes[size], full ? "w-full" : "", className ?? ""].join(" ").trim();
}

type Extra = { variant?: ButtonVariant; size?: ButtonSize; full?: boolean };

export function Button({ variant, size, full, className, ...props }: ComponentProps<"button"> & Extra) {
  return <button {...props} className={buttonClass({ variant, size, full, className })} />;
}

export function LinkButton({ variant, size, full, className, ...props }: ComponentProps<typeof Link> & Extra) {
  return <Link {...props} className={buttonClass({ variant, size, full, className })} />;
}

/** For wa.me, tel: and other outside links. */
export function AnchorButton({ variant, size, full, className, ...props }: ComponentProps<"a"> & Extra) {
  return <a {...props} className={buttonClass({ variant, size, full, className })} />;
}
