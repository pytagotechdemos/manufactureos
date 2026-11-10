/**
 * Utility for exporting tabular ERP data into standard UTF-8 CSV with Excel BOM compatibility.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
) {
  if (typeof window === "undefined") return;

  const content = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? "").replace(/"/g, '""');
          return /[",\n\r]/.test(text) ? `"${text}"` : text;
        })
        .join(","),
    )
    .join("\r\n");

  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatCsvCell(value: unknown): string {
  const text = String(value ?? "").replace(/"/g, '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}
