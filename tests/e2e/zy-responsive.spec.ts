import { expect, test, type Browser, type Page } from "@playwright/test";
import { teacherLinkToken } from "../../src/lib/links";
import { E2E_SECRET } from "../../playwright.config";
import { measureLayout, SCREENS, visibleAboveKeyboard } from "./layout";

// Every page, on every screen size: nothing scrolls sideways, nothing sticks out,
// and no form field is small enough to make iPhones zoom in.

const ADMIN = { username: "office", password: "e2e-password-123" };

async function adminState(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/admin/login");
  await page.getByLabel("Username").fill(ADMIN.username);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/meetings");
  const meeting = await page.locator('main a[href^="/admin/meetings/"]').filter({ hasText: "December PTM" }).first().getAttribute("href");
  await page.goto("/admin/roster");
  const student = await page.locator('main a[href^="/admin/roster/"]').filter({ hasText: "Kabir" }).first().getAttribute("href");
  const state = await ctx.storageState();
  await ctx.close();
  return { state, meeting: meeting!, student: student! };
}

/** Signs a parent in once; sign-ins per phone number are rate limited, so tests reuse the cookie. */
async function parentState(browser: Browser) {
  const ctx = await browser.newContext();
  const page: Page = await ctx.newPage();
  await page.goto("/");
  await page.getByLabel("Your mobile number").fill("9000000004");
  await page.getByRole("button", { name: /Find my child/ }).click();
  await page.waitForURL("**/my");
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

test("every page fits every screen", async ({ browser }) => {
  test.setTimeout(240_000);
  const { state, meeting, student } = await adminState(browser);
  const parent = await parentState(browser);
  const pages: Array<[string, string, "parent" | "admin" | "none"]> = [
    ["parent landing", "/", "none"],
    ["parent bookings", "/my", "parent"],
    ["teacher schedule", `/t/${teacherLinkToken(E2E_SECRET, "teach2", 1)}`, "none"],
    ["admin sign-in", "/admin/login", "none"],
    ["admin dashboard", "/admin", "admin"],
    ["admin meetings", "/admin/meetings", "admin"],
    ["admin meeting", meeting, "admin"],
    ["admin new meeting", "/admin/meetings/new", "admin"],
    ["admin students", "/admin/roster", "admin"],
    ["admin student", student, "admin"],
    ["admin classes", "/admin/classes", "admin"],
    ["admin upload", "/admin/roster/import", "admin"],
    ["admin settings", "/admin/settings", "admin"],
    ["admin activity", "/admin/audit", "admin"],
  ];
  const problems: string[] = [];
  for (const screen of SCREENS) {
    const admin = await browser.newContext({
      viewport: { width: screen.width, height: screen.height },
      isMobile: screen.mobile,
      hasTouch: screen.mobile,
      storageState: state,
    });
    const visitor = await browser.newContext({
      viewport: { width: screen.width, height: screen.height },
      isMobile: screen.mobile,
      hasTouch: screen.mobile,
      storageState: parent,
    });
    const parentPage = await visitor.newPage();
    const adminPage = await admin.newPage();
    for (const [name, path, who] of pages) {
      const page = who === "admin" ? adminPage : parentPage;
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (path === "/my") {
        const choose = page.getByRole("button", { name: /Choose a time/ }).first();
        if (await choose.isVisible()) await choose.click();
      }
      const r = await measureLayout(page);
      const where = `${screen.name} (${screen.width}×${screen.height}) · ${name}`;
      if (r.pageOverflow > 1) problems.push(`${where}: page scrolls sideways by ${r.pageOverflow}px`);
      if (r.sidewaysScrollers.length) problems.push(`${where}: sideways-scrolling box ${r.sidewaysScrollers.join(", ")}`);
      if (r.offscreen.length) problems.push(`${where}: off screen ${r.offscreen.join(", ")}`);
      if (r.smallFields.length) problems.push(`${where}: fields under 16px ${r.smallFields.join(", ")}`);
    }
    await admin.close();
    await visitor.close();
  }
  expect(problems).toEqual([]);
});

test("large system text (130%) still fits a small phone", async ({ browser }) => {
  const { state, meeting } = await adminState(browser);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, storageState: state });
  const page = await ctx.newPage();
  const problems: string[] = [];
  for (const path of ["/", meeting, "/admin/classes", "/admin/settings"]) {
    await page.goto(path);
    await page.addStyleTag({ content: "html { font-size: 130% }" });
    const r = await measureLayout(page);
    if (r.pageOverflow > 1 || r.offscreen.length) problems.push(`${path}: ${JSON.stringify(r)}`);
  }
  await ctx.close();
  expect(problems).toEqual([]);
});

test.describe("fields stay visible above the on-screen keyboard", () => {
  // Opening a phone keyboard shrinks the visible area; we simulate that by
  // shrinking the window after the field gets focus.
  const cases: Array<{ name: string; path: string | "meeting"; field: string; also?: string; admin: boolean }> = [
    { name: "parent phone number, with its button", path: "/", field: "#phone", also: "form[data-keep-visible] button[type=submit]", admin: false },
    { name: "office sign-in password, with its button", path: "/admin/login", field: "#password", also: "form[data-keep-visible] button[type=submit]", admin: false },
    { name: "a field at the very bottom of the meeting page", path: "meeting", field: "#cancel-confirm", admin: true },
    { name: "add a teacher, bottom of the classes page", path: "/admin/classes", field: 'input[placeholder="e.g. Ms. Kaur"]', admin: true },
    { name: "note to parents on a new meeting", path: "/admin/meetings/new", field: "#parentNote", admin: true },
  ];
  for (const screen of [
    { width: 375, height: 667, keyboard: 300 },
    { width: 390, height: 844, keyboard: 420 },
    { width: 360, height: 640, keyboard: 330 },
  ]) {
    for (const c of cases) {
      test(`${screen.width}×${screen.height}: ${c.name}`, async ({ browser }) => {
        const setup = c.admin ? await adminState(browser) : null;
        const ctx = await browser.newContext({
          viewport: { width: screen.width, height: screen.height },
          isMobile: true,
          hasTouch: true,
          storageState: setup?.state,
        });
        const page = await ctx.newPage();
        await page.goto(c.path === "meeting" ? setup!.meeting : c.path);
        await page.waitForLoadState("networkidle");
        const field = page.locator(c.field).first();
        await field.scrollIntoViewIfNeeded();
        await field.tap();
        await page.setViewportSize({ width: screen.width, height: screen.height - screen.keyboard });
        await expect(field).toBeFocused();
        // The page scrolls smoothly, so wait for the field (and its button) to settle into view.
        await expect
          .poll(async () => (await visibleAboveKeyboard(page, c.field)).visible && (!c.also || (await visibleAboveKeyboard(page, c.also)).visible), {
            timeout: 4000,
          })
          .toBe(true);
        await ctx.close();
      });
    }
  }
});

test("the admin menu works on a phone", async ({ browser }) => {
  const { state } = await adminState(browser);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, storageState: state });
  const page = await ctx.newPage();
  await page.goto("/admin");
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Meetings" })).toBeHidden();
  await page.locator("summary", { hasText: "Menu" }).tap();
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Meetings" }).tap();
  await page.waitForURL("**/admin/meetings");
  // The menu closes itself after moving to another page.
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Students" })).toBeHidden();
  await ctx.close();
});
