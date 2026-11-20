import { expect, test } from "@playwright/test";
import { teacherLinkToken } from "../../src/lib/links";
import { E2E_SECRET } from "../../playwright.config";
import { alertBox, expectNoSidewaysScroll } from "./helpers";

const ADMIN_PASSWORD = "e2e-password-123";

async function signInAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin");
  await page.waitForURL("**/admin/login");
  await page.getByLabel("Username").fill("office");
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("the admin area is closed to visitors", async ({ page, request }) => {
  await page.goto("/admin/meetings");
  await page.waitForURL("**/admin/login");
  await page.getByLabel("Username").fill("office");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(alertBox(page)).toContainText("Wrong username or password");
  const csv = await request.get("/admin/meetings/anything/export");
  expect(csv.status()).toBe(401);
});

test("the office creates and publishes a meeting, books for a parent, and prints", async ({ page }) => {
  await signInAdmin(page);
  await page.goto("/admin/meetings/new");
  await page.getByLabel("Title", { exact: true }).fill("January PTM");
  const date = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Meeting date").fill(date);
  await page.getByLabel("First slot starts").fill("09:00");
  await page.getByLabel("Last slot ends by").fill("09:20");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  // Two slots for three Nursery A children: the page says so before publishing.
  await expect(page.getByText(/3 children but only 2 slots/)).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published. Share the parent link")).toBeVisible();
  await expect(page.getByLabel("Parent link")).toHaveValue(/\/m\/ptm-/);

  await page.getByRole("link", { name: "Book for a child" }).first().click();
  await page.getByLabel("Child", { exact: true }).selectOption({ label: "Zoya Khan (Nursery A)" });
  await page.getByRole("button", { name: "Book this time" }).click();
  await expect(page.getByText(/Booked\. Ref/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Zoya Khan" }).first()).toBeVisible();
  await expectNoSidewaysScroll(page);

  // Blocking that booked slot needs a second, explicit step that names the family.
  await page.getByRole("row", { name: /Zoya Khan/ }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Booking cancelled")).toBeVisible();

  await page.getByRole("link", { name: "Print sheets" }).click();
  await expect(page.getByRole("heading", { name: /January PTM/ }).first()).toBeVisible();
  await expect(page.getByText("Ms. Kaur").first()).toBeVisible();

  const id = new URL(page.url()).pathname.split("/")[3];
  const csv = await page.request.get(`/admin/meetings/${id}/export`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Teacher,Date,Time,Status");
});

test("a teacher's private link shows only their slots, without phone numbers, and marks attendance", async ({ page }) => {
  const link = `/t/${teacherLinkToken(E2E_SECRET, "teach2", 1)}`;
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Ms. Sharma" })).toBeVisible();
  const today = page.getByLabel(/Today PTM/);
  await expect(today.getByText("Noor Gill")).toBeVisible();
  await expect(page.getByText(/9000000004|90000 00004/)).toHaveCount(0);
  await expect(page.getByText("Kabir")).toHaveCount(0); // another teacher's class

  await today.getByRole("button", { name: /^Came$/ }).click();
  await expect(today.getByRole("button", { name: /^Came$/ })).toHaveAttribute("aria-pressed", "true");
  await expect(today.getByText(/1 came/)).toBeVisible();
  await expectNoSidewaysScroll(page);

  // A tampered link, and a link for a later version, do not work.
  await page.goto(link.slice(0, -2) + "zz");
  await expect(page.getByText("This link does not work")).toBeVisible();
  await page.goto(`/t/${teacherLinkToken(E2E_SECRET, "teach2", 2)}`);
  await expect(page.getByText("This link does not work")).toBeVisible();
});
