"use client";

import { useEffect } from "react";

const TYPING = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=hidden]), textarea, [contenteditable="true"]';
const GAP = 12; // px of breathing room above the keyboard

/**
 * Keeps the field being typed in visible above the on-screen keyboard.
 *
 * Android Chrome shrinks the page for the keyboard (we ask for that with
 * interactive-widget=resizes-content); iOS Safari and others only shrink the
 * *visual* viewport. Both report it through window.visualViewport, so when the
 * keyboard opens or the focus moves we scroll the field (and, if it fits, the
 * rest of its little form marked with data-keep-visible, e.g. the submit
 * button) into the part of the screen the keyboard is not covering.
 * Also publishes the keyboard height as --keyboard-inset for fixed elements.
 */
export function KeyboardAware() {
  useEffect(() => {
    const vv = window.visualViewport;
    let timer: number | undefined;

    const keyboardInset = () => (vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0);

    const reveal = () => {
      const el = document.activeElement as HTMLElement | null;
      document.documentElement.style.setProperty("--keyboard-inset", `${keyboardInset()}px`);
      if (!el || !el.matches?.(TYPING)) return;
      const top = vv ? vv.offsetTop : 0;
      const bottom = top + (vv ? vv.height : window.innerHeight);
      const field = el.getBoundingClientRect();
      const group = el.closest<HTMLElement>("[data-keep-visible]")?.getBoundingClientRect();
      // Prefer showing the whole group (field + its button) when it fits.
      const want = group && group.height <= bottom - top - 2 * GAP ? group : field;
      const wantTop = Math.min(want.top, field.top);
      let dy = 0;
      if (want.bottom > bottom - GAP) dy = want.bottom - (bottom - GAP);
      if (wantTop - dy < top + GAP) dy = wantTop - (top + GAP); // never push the field above the top
      if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: "smooth" });
    };

    const later = () => {
      window.clearTimeout(timer);
      // Wait for the keyboard animation to settle before measuring.
      timer = window.setTimeout(reveal, 120);
    };

    document.addEventListener("focusin", later);
    vv?.addEventListener("resize", later);
    window.addEventListener("resize", later);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("focusin", later);
      vv?.removeEventListener("resize", later);
      window.removeEventListener("resize", later);
    };
  }, []);
  return null;
}
