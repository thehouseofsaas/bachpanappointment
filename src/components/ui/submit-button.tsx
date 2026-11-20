"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

export function Dots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 rounded-full bg-current animate-bounce-dot"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  );
}

/** Submit button that shows bouncing dots while its form's action runs. */
export function SubmitButton({
  variant,
  size,
  full,
  className,
  children,
  pending: pendingProp,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button
      type="submit"
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={buttonClass({ variant, size, full, className })}
    >
      {pending ? (
        <>
          <Dots />
          <span className="sr-only">Please wait</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
