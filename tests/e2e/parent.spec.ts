import { expect, test } from "@playwright/test";
import { alertBox, childCard, expectNoSidewaysScroll, pickSlot, signInParent } from "./helpers";

test("an unknown number gets a neutral message and reveals nothing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("December PTM").first()).toBeVisible();
  await page.getByLabel("Your mobile number").fill("98111 22233");
  await page.getByRole("button", { name: /Find my child/ }).click();
  await expect(alertBox(page)).toContainText("couldn't find that number");
  await expect(page.getByText("Kabir")).toHaveCount(0);
  await page.getByLabel("Your mobile number").fill("12345");
  await page.getByRole("button", { name: /Find my child/ }).click();
  await expect(alertBox(page)).toContainText("10-digit mobile number");
  await expectNoSidewaysScroll(page);
});

test("a signed-out visitor cannot open the bookings page", async ({ page }) => {
  await page.goto("/my");
  await page.waitForURL((url) => url.pathname === "/");
});

test("a parent books, changes and cancels a time", async ({ page }) => {
  await signInParent(page, "90000 00002");
  const card = childCard(page, "Kabir");
  await expect(card).toContainText("Nursery A");
  await expect(card).toContainText("Ms. Kaur");
  // Only the first name is shown to parents.
  await expect(card).not.toContainText("Sandhu");

  await pickSlot(page, "Kabir", "9:00 am");
  await expect(card.getByText("Booking ref")).toBeVisible();
  await expect(card).toContainText("9:00 am");
  await expect(card.getByRole("link", { name: /Send to my WhatsApp/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
  await expect(card.getByRole("link", { name: /Add to Google Calendar/ })).toHaveAttribute("href", /calendar\.google\.com/);
  const ics = await page.request.get(await card.getByRole("link", { name: /\.ics/ }).getAttribute("href").then((h) => h!));
  expect(ics.status()).toBe(200);
  expect(await ics.text()).toContain("BEGIN:VEVENT");
  await expectNoSidewaysScroll(page);

  await card.getByRole("button", { name: "Change time" }).click();
  await card.getByRole("button", { name: /^9:50 am/ }).click();
  await page.getByRole("button", { name: /Yes, change it/ }).click();
  await expect(card).toContainText("9:50 am");
  await expect(card.getByRole("button", { name: /^9:50 am/ })).toHaveCount(0);

  // The booking survives a reload and a fresh visit from the front page.
  await page.goto("/");
  await page.getByRole("link", { name: /Continue with number ending 02/ }).click();
  await expect(childCard(page, "Kabir")).toContainText("9:50 am");

  await childCard(page, "Kabir").getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(childCard(page, "Kabir").getByRole("button", { name: /Choose a time/ })).toBeVisible();
});

test("when two parents want the same time, the second is told and shown what is left", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const kabir = await a.newPage();
  const zoya = await b.newPage();
  await signInParent(kabir, "9000000002");
  await signInParent(zoya, "9000000003");
  // Zoya's parent opens the list first, then Kabir's parent takes 9:10.
  await childCard(zoya, "Zoya").getByRole("button", { name: /Choose a time/ }).click();
  await expect(childCard(zoya, "Zoya").getByRole("button", { name: /^9:10 am/ })).toBeVisible();
  await pickSlot(kabir, "Kabir", "9:10 am");
  await expect(childCard(kabir, "Kabir").getByText("Booking ref")).toBeVisible();

  await childCard(zoya, "Zoya").getByRole("button", { name: /^9:10 am/ }).click();
  await zoya.getByRole("button", { name: /Yes, book it/ }).click();
  await expect(alertBox(childCard(zoya, "Zoya"))).toContainText("just taken");
  await expect(childCard(zoya, "Zoya").getByRole("button", { name: /^9:10 am/ })).toHaveCount(0);
  await childCard(zoya, "Zoya").getByRole("button", { name: /^9:20 am/ }).click();
  await zoya.getByRole("button", { name: /Yes, book it/ }).click();
  await expect(childCard(zoya, "Zoya").getByText("Booking ref")).toBeVisible();
  await a.close();
  await b.close();
});

test("siblings: one sign-in shows both children, with back-to-back and clash hints", async ({ page }) => {
  await signInParent(page, "9000000001");
  await expect(childCard(page, "Aarav")).toBeVisible();
  await expect(childCard(page, "Meher")).toBeVisible();
  await pickSlot(page, "Aarav", "9:30 am");
  await expect(childCard(page, "Aarav").getByText("Booking ref")).toBeVisible();
  const meher = childCard(page, "Meher");
  await meher.getByRole("button", { name: /Choose a time/ }).click();
  await expect(meher.getByRole("button", { name: /9:40 am.*Right after Aarav's/ })).toBeVisible();
  await expect(meher.getByRole("button", { name: /9:30 am.*Same time as Aarav's/ })).toBeVisible();
  // Another family's children are never shown.
  await expect(page.getByText("Kabir")).toHaveCount(0);
});

test.describe("on a phone set to another timezone", () => {
  test.use({ timezoneId: "America/Toronto" });
  test("times are still India time", async ({ page }) => {
    await signInParent(page, "9000000004");
    await pickSlot(page, "Noor", "9:40 am");
    const card = childCard(page, "Noor");
    await expect(card.getByText("Booking ref")).toBeVisible();
    await expect(card).toContainText("9:40 am");
    await expect(page.getByText("All times are India time.").filter({ visible: true })).toHaveCount(1);
  });
});

test("the sign-in form works even if the page's scripts have not loaded", async ({ page }) => {
  // A slow connection: the HTML has arrived but the JavaScript files have not.
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.goto("/");
  await page.getByLabel("Your mobile number").fill("9000000004");
  await page.getByRole("button", { name: /Find my child/ }).click();
  await expect(page.getByRole("heading", { name: "Your children" })).toBeVisible();
  await expect(childCard(page, "Noor")).toBeVisible();
});
