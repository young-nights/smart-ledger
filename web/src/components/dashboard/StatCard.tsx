/**
 * StatCard — editorial metric display.
 * No glass morphism, no gradient overlays. Clean typography hierarchy.
 */

import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  accentColor?: string;
  delay?: number;
  trend?: number;
}

export function StatCard({
  icon,
  label,
  value,
  accentColor = "#0d7377",
  delay = 0,
  trend,
}: StatCardProps) {
  return (
    <div
      className="animate-in"
      style={{
        animationDelay: `${delay}s`,
        animationFillMode: "both",
        padding: "16px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ color: accentColor, display: "flex" }}>{icon}</span>
        <span
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="num-display"
        style={{
          fontSize: 26,
          fontWeight: 600,
          lineHeight: 1.1,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {trend !== undefined && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            marginTop: 6,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            color:
              trend >= 0
                ? "var(--color-success)"
                : "var(--color-danger)",
          }}
        >
          <span>{trend >= 0 ? "↑" : "↓"}</span>
          <span>{Math.abs(trend).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
