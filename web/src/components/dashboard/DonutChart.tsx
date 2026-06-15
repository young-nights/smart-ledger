/**
 * Donut Chart with legend — wrapper around PieChart for spending breakdown.
 * Inherits all interactivity from the enhanced PieChart (SVG sectors,
 * hover expansion, legend linkage, tooltips).
 */

import { PieChart } from "./PieChart";

export interface DonutChartItem {
  label: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutChartItem[];
  total: number;
}

export function DonutChart({ data, total }: DonutChartProps) {
  if (!data.length || total === 0) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          No spending data available
        </p>
      </div>
    );
  }

  return (
    <PieChart
      data={data}
      centerLabel="Total"
      centerValue={`¥${total.toLocaleString()}`}
      size={150}
    />
  );
}
