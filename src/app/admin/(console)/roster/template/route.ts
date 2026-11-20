import ExcelJS from "exceljs";
import { TEMPLATE_HEADERS } from "@/domain/import/parse";
import { requireAdmin } from "@/lib/authz";

const WIDTHS = [16, 28, 14, 10, 24, 18, 18];
// Clearly not a real child; the phone is a well-known placeholder, so the
// preview warns if this row is left in.
const EXAMPLE = ["EXAMPLE-1", "EXAMPLE CHILD (delete this row)", "Nursery", "A", "Ms. Example Teacher", "9876543210", ""];

/** The roster template: the columns the upload understands, already formatted as text. */
export async function GET() {
  await requireAdmin();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = TEMPLATE_HEADERS.map((header, i) => ({ header, width: WIDTHS[i] ?? 18 }));
  TEMPLATE_HEADERS.forEach((header, i) => {
    // Admission numbers and phones must stay text, or Excel drops zeros and digits.
    if (/admission|phone/i.test(header)) ws.getColumn(i + 1).numFmt = "@";
  });
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF6FF" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF4C5680" } } };
  });
  const example = ws.addRow(EXAMPLE);
  example.font = { italic: true, color: { argb: "FF808080" } };

  const body = await wb.xlsx.writeBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="roster-template.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
