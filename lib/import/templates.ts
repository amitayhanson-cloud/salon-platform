/**
 * Import template generation for download.
 * Spec: name, phone (required); notes, clientType (optional). clientType default "Regular".
 */

export const TEMPLATE_HEADERS = "name,phone,notes,clientType";
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
    ["name", "phone", "notes", "clientType"],
    ["דנה לוי", "0541234567", "", "Regular"],
    ["אבי כהן", "0529876543", "לקוח VIP", "VIP"],
    ["שרה ישראלי", "0501112233", "", ""],
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
