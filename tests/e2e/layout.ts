import type { Page } from "@playwright/test";

/** Screen sizes we check: small and large phones, phones held sideways, tablets, laptops. */
export const SCREENS = [
  { name: "Galaxy Fold, folded", width: 280, height: 653, mobile: true },
  { name: "small phone (iPhone SE 1st gen)", width: 320, height: 568, mobile: true },
  { name: "common Android", width: 360, height: 780, mobile: true },
  { name: "iPhone SE / 8", width: 375, height: 667, mobile: true },
  { name: "iPhone 14/15", width: 390, height: 844, mobile: true },
  { name: "Pixel 7", width: 412, height: 915, mobile: true },
  { name: "iPhone Pro Max", width: 430, height: 932, mobile: true },
  { name: "phone held sideways", width: 844, height: 390, mobile: true },
  { name: "iPad portrait", width: 768, height: 1024, mobile: true },
  { name: "laptop", width: 1280, height: 800, mobile: false },
  { name: "desktop", width: 1920, height: 1080, mobile: false },
] as const;

export type LayoutReport = {
  pageOverflow: number;
  sidewaysScrollers: string[];
  offscreen: string[];
  smallFields: string[];
};

/** Runs in the page: what would make it awkward on this screen. */
export function measureLayout(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const label = (el: Element) =>
      `${el.tagName.toLowerCase()} "${((el as HTMLElement).innerText || (el as HTMLInputElement).value || "").trim().slice(0, 30)}"`;
    const scrollers: Element[] = [];
    const sidewaysScrollers: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none") continue;
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2) {
        scrollers.push(el);
        sidewaysScrollers.push(label(el));
      }
    }
    const offscreen: string[] = [];
    for (const el of document.querySelectorAll("main *, header *, nav *, footer *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest("svg") || el.closest(".stack-table thead")) continue;
      if (scrollers.some((s) => s.contains(el))) continue;
      if (r.right > vw + 1 || r.left < -1) offscreen.push(`${label(el)} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
    }
    // iOS zooms the page when a field under 16px gets focus.
    const smallFields: string[] = [];
    for (const el of document.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea",
    )) {
      if (parseFloat(getComputedStyle(el).fontSize) < 16) smallFields.push(label(el));
    }
    return {
      pageOverflow: document.documentElement.scrollWidth - vw,
      sidewaysScrollers,
      offscreen: offscreen.slice(0, 5),
      smallFields: smallFields.slice(0, 5),
    };
  });
}

/** Whether an element is fully inside the part of the screen the keyboard is not covering. */
export function visibleAboveKeyboard(page: Page, selector: string): Promise<{ visible: boolean; detail: string }> {
  return page.evaluate((sel) => {
    const vv = window.visualViewport!;
    const top = vv.offsetTop;
    const bottom = vv.offsetTop + vv.height;
    const el = document.querySelector(sel);
    if (!el) return { visible: false, detail: "not found" };
    const r = el.getBoundingClientRect();
    return {
      visible: r.top >= top - 1 && r.bottom <= bottom + 1,
      detail: `element ${Math.round(r.top)}–${Math.round(r.bottom)}, visible area ${Math.round(top)}–${Math.round(bottom)}`,
    };
  }, selector);
}
