import { expect, type Page } from "@playwright/test";

export async function signInParent(page: Page, phone: string) {
  await page.goto("/");
  await page.getByLabel("Your mobile number").fill(phone);
  await page.getByRole("button", { name: /Find my child/ }).click();
  await page.waitForURL("**/my");
  await expect(page.getByRole("heading", { name: "Your children" })).toBeVisible();
}

/** The card for one child within the December meeting. */
export function childCard(page: Page, name: string) {
  return page.getByLabel("December PTM").locator("article", { has: page.getByRole("heading", { name }) });
}

export async function pickSlot(page: Page, name: string, time: string, confirm: RegExp = /Yes, book it/) {
  const card = childCard(page, name);
  const choose = card.getByRole("button", { name: /Choose a time/ });
  if (await choose.isVisible()) await choose.click();
  await card.getByRole("button", { name: new RegExp(`^${time}`) }).click();
  await page.getByRole("button", { name: confirm }).click();
}

export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

/** Our own alert boxes (Next.js adds a hidden route announcer that is also role=alert). */
export function alertBox(scope: Page | import("@playwright/test").Locator) {
  return scope.locator('[role="alert"]:not(#__next-route-announcer__)');
}
