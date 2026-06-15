/**
 * SpendingChart — horizontal bar chart for spending breakdown.
 * No card wrapper. Flat list with progress bars.
 */

import type { CategorySummary } from "../../lib/types";

interface SpendingChartProps {
  categories: CategorySummary[];
  totalExpense: number;
}

const barColors = [
  "var(--color-primary)",
  "#c96b4f",
  "#2d8a7a",
  "#6e72b8",
  "#c89a40",
  "#b04e3a",
];

export function SpendingChart({ categories, totalExpense }: SpendingChartProps) {
  const expenseCats = categories
    .filter((c) => c.total_expense > 0)
    .sort((a, b) => b.total_expense - a.total_expense)
    .slice(0, 6);

  if (expenseCats.length === 0) {
    return (
      <div>
        <h4 style={{ marginBottom: 12 }}>Spending Structure</h4>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No spending data</p>
      </div>
    );
  }

  const maxVal = Math.max(...expenseCats.map((c) => c.total_expense));

  return (
    <div>
      <h4 style={{ marginBottom: 16 }}>Spending Structure</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {expenseCats.map((cat, i) => {
          const pct = totalExpense > 0 ? (cat.total_expense / totalExpense) * 100 : 0;
          const barWidth = maxVal > 0 ? (cat.total_expense / maxVal) * 100 : 0;

          return (
            <div key={cat.category}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                  {cat.category}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  ¥{cat.total_expense.toLocaleString()} ({pct.toFixed(1)}%)
                </span>
              </div>
              <div
                className="progress-bar"
                style={{ height: 8 }}
              >
                <div
                  style={{
                    width: `${barWidth}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: barColors[i % barColors.length],
                    transition: "width 0.5s cubic-bezier(0.25, 1, 0.5, 1)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
