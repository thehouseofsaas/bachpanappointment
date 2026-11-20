import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { teacherLinkToken } from "../../src/lib/links";
import { E2E_SECRET } from "../../playwright.config";
import { childCard, signInParent } from "./helpers";

// Automated accessibility scan (WCAG 2.1 A and AA) of the pages parents and
// teachers use. Runs last, so bookings from the earlier tests are on screen.
async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary).toEqual([]);
}

test("landing page has no accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Your mobile number")).toBeVisible();
  await scan(page);
});

test("bookings page has none, with the time list open and with a booked ticket", async ({ page }) => {
  await signInParent(page, "9000000001");
  await childCard(page, "Meher").getByRole("button", { name: /Choose a time/ }).click();
  await expect(childCard(page, "Aarav").getByText("Booking ref")).toBeVisible();
  await scan(page);
});

test("teacher page has none", async ({ page }) => {
  await page.goto(`/t/${teacherLinkToken(E2E_SECRET, "teach2", 1)}`);
  await expect(page.getByRole("heading", { name: "Ms. Sharma" })).toBeVisible();
  await scan(page);
});

test("pages stay light for slow phones", async ({ page }) => {
  let bytes = 0;
  page.on("response", async (res) => {
    const type = res.headers()["content-type"] ?? "";
    if (/javascript|css|font|html/.test(type)) bytes += Number(res.headers()["content-length"] ?? 0) || (await res.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto("/", { waitUntil: "networkidle" });
  // Compressed transfer of HTML + CSS + JS + fonts for the landing page.
  console.log(`landing page transfer: ${(bytes / 1024).toFixed(0)} KB`);
  expect(bytes).toBeLessThan(600 * 1024);
});
