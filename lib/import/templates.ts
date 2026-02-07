/**
 * Import template generation for download.
 * Headers: fullName, phone, email, notes (Row 1 only).
 */

const TEMPLATE_HEADERS = "fullName,phone,email,notes";
const TEMPLATE_HEADERS_UTF8 = "\uFEFF" + TEMPLATE_HEADERS;

export function downloadCSVTemplate(): void {
  const csv = TEMPLATE_HEADERS_UTF8 + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadExcelTemplate(): void {
  import("xlsx").then((XLSX) => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS.split(",")]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    XLSX.writeFile(wb, "import-template.xlsx");
  });
}

export function downloadExampleFile(): void {
  const rows = [
    ["fullName", "phone", "email", "notes"],
    ["דנה לוי", "0541234567", "dana@example.com", ""],
    ["אבי כהן", "0529876543", "", "לקוח VIP"],
    ["שרה ישראלי", "0501112233", "sara@test.co.il", ""],
  ];
  const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "import-example.csv";
  a.click();
  URL.revokeObjectURL(url);
}
