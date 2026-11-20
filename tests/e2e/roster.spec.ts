import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { signInParent } from "./helpers";

test("the office uploads a class list, checks the preview, applies it, and the new parent can sign in", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Username").fill("office");
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // A new class, with phone numbers typed the way real sheets have them.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  ws.addRow(["Bachpan Play School — UKG B"]);
  ws.addRow(["Admission No", "Student Name", "Class", "Section", "Class Teacher", "Parent Phone 1", "Parent Phone 2"]);
  ws.addRow(["E90", "Tara Bedi", "U.K.G", "B", "Ms. Gill", 9000000077, ""]);
  ws.addRow(["E91", "Veer Bedi", "UKG", "b", "Ms Gill", "+91 90000-00077", "12345"]);
  ws.addRow(["E92", "", "UKG", "B", "Ms. Gill", "9000000078", ""]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  await page.goto("/admin/roster/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "ukg-b.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await page.getByRole("button", { name: "Upload and check" }).click();

  // The preview explains everything before anything is saved.
  await expect(page.getByRole("heading", { name: "Check the upload" })).toBeVisible();
  await expect(page.getByText("2 new children", { exact: true })).toBeVisible();
  await expect(page.getByText("1 row with errors", { exact: true })).toBeVisible();
  await expect(page.getByText("Student name is missing.").first()).toBeVisible();
  await expect(page.getByText(/"12345" is too short/).first()).toBeVisible();
  await expect(page.getByText("UKG B").first()).toBeVisible();

  // Rows with errors block the upload until the office chooses to leave them out.
  await page.getByRole("button", { name: "Apply this upload" }).click();
  await expect(page.getByText(/Nothing was changed/).first()).toBeVisible();
  await page.locator('input[name="skipErrors"]').check();
  await page.getByRole("button", { name: "Apply this upload" }).click();
  await expect(page.getByText(/Roster updated from ukg-b\.xlsx/)).toBeVisible();

  // Both spellings of the class and of the phone number ended up as one class and one number.
  const parent = await page.context().browser()!.newContext();
  const p = await parent.newPage();
  await signInParent(p, "90000 00077");
  await expect(p.getByRole("heading", { name: "Tara" })).toBeVisible();
  await expect(p.getByRole("heading", { name: "Veer" })).toBeVisible();
  await expect(p.getByText("UKG B").first()).toBeVisible();
  await expect(p.getByText("No meeting is open for booking right now.").first()).toBeVisible();
  await parent.close();
});
