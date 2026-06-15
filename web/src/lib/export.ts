/**
 * Data export utilities — CSV and JSON format.
 */

import type { Transaction } from "./types";

/** Convert transactions array to CSV string. */
export function exportToCSV(transactions: Transaction[]): string {
  const headers = [
    "id",
    "date",
    "amount",
    "currency",
    "category",
    "subcategory",
    "description",
  ];
  const rows = transactions.map((t) =>
    [
      t.id,
      t.date,
      t.amount,
      t.currency,
      t.category,
      t.subcategory,
      `"${(t.description || "").replace(/"/g, '""')}"`,
    ].join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

/** Convert transactions array to formatted JSON string. */
export function exportToJSON(transactions: Transaction[]): string {
  return JSON.stringify(
    transactions.map((t) => ({
      id: t.id,
      date: t.date,
      amount: t.amount,
      currency: t.currency,
      category: t.category,
      subcategory: t.subcategory,
      description: t.description,
    })),
    null,
    2
  );
}

/** Trigger a file download in the browser. */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
