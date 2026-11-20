"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A modal sheet that slides up from the bottom of the screen. Built on the
 *  native <dialog>, so focus is trapped and Escape closes it. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // tap on the backdrop
      }}
      aria-label={title}
      className="m-0 mt-auto mx-auto w-full max-w-md max-h-[85dvh] rounded-t-[2rem] bg-paper p-0 text-navy open:animate-sheet-up fixed inset-x-0 bottom-0 top-auto border-0"
    >
      <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />
        <h2 className="text-2xl font-extrabold mb-2">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
