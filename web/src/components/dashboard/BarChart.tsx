/**
 * Pure CSS Bar Chart component with interactive features.
 * Features: hover scale + glow, tooltip with percentage, click callback,
 * entry grow animation, sort toggle.
 */

import { useState, useMemo } from "react";

export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
}

export interface BarChartProps {
  data: BarChartItem[];
  height?: number;
  showValues?: boolean;
  onBarClick?: (index: number, item: BarChartItem) => void;
  animated?: boolean;
  sortBy?: "value" | "name" | "none";
}

const DEFAULT_COLORS = [
  "#0d7377", // deep teal (primary)
  "#c96b4f", // warm coral
  "#2d8a7a", // sage teal
  "#6e72b8", // muted indigo
  "#c89a40", // amber
  "#b04e3a", // brick red
  "#3d8a5c", // forest green
  "#b06b8a", // dusty rose
  "#7a6854", // warm brown
  "#8a8078", // warm grey
];

type SortMode = "value" | "name";

export function BarChart({
  data,
  height = 220,
  showValues = true,
  onBarClick,
  animated = true,
  sortBy = "value",
}: BarChartProps) {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>(sortBy === "none" ? "value" : sortBy);

  // Sort data
  const sortedData = useMemo(() => {
    const indexed = data.map((d, i) => ({ ...d, originalIndex: i }));
    if (sortBy === "none") return indexed;
    if (sortMode === "value") {
      indexed.sort((a, b) => b.value - a.value);
    } else {
      indexed.sort((a, b) => a.label.localeCompare(b.label));
    }
    return indexed;
  }, [data, sortMode, sortBy]);

  if (!data.length) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          No data available
        </p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div>
      {/* Sort toggle — hidden when sortBy is 'none' */}
      {sortBy !== "none" && (
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 8,
          gap: 4,
        }}
      >
        {(["value", "name"] as SortMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setSortMode(mode)}
            style={{
              padding: "2px 8px",
              fontSize: 11,
              fontWeight: sortMode === mode ? 600 : 400,
              color:
                sortMode === mode
                  ? "var(--color-primary)"
                  : "var(--text-muted)",
              background:
                sortMode === mode
                  ? "rgba(13, 115, 119, 0.08)"
                  : "transparent",
              border: "1px solid",
              borderColor:
                sortMode === mode
                  ? "rgba(13, 115, 119, 0.2)"
                  : "var(--border-light)",
              borderRadius: 4,
              cursor: "pointer",
              transition: "all 0.15s",
              fontFamily: "var(--font-body)",
            }}
          >
            {mode === "value" ? "Amount" : "Name"}
          </button>
        ))}
      </div>
      )}

      {/* Bar container */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          height,
          padding: "0 4px",
        }}
      >
        {sortedData.map((item, i) => {
          const barHeight = (item.value / maxValue) * (height - 36);
          const color =
            item.color || DEFAULT_COLORS[item.originalIndex % DEFAULT_COLORS.length];
          const isHovered = hoveredBar === item.originalIndex;
          // Unique key to force re-mount and re-trigger animation on data change
          const barKey = `${item.label}-${item.value}-${i}`;

          return (
            <div
              key={barKey}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                height: "100%",
                position: "relative",
              }}
            >
              {/* Value label */}
              {showValues && (
                <span
                  className="num-display"
                  style={{
                    fontSize: 11,
                    marginBottom: 4,
                    whiteSpace: "nowrap",
                    transition:
                      "color 0.2s cubic-bezier(0.25, 1, 0.5, 1)",
                    color: isHovered
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  }}
                >
                  {item.value >= 1000
                    ? `¥${(item.value / 1000).toFixed(1)}k`
                    : `¥${item.value}`}
                </span>
              )}

              {/* Tooltip */}
              {isHovered && (
                <div
                  style={{
                    position: "absolute",
                    bottom: barHeight + 40,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "var(--bg-surface, #fff)",
                    border: "1px solid var(--border-default, #e5e5e5)",
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    zIndex: 10,
                    pointerEvents: "none",
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
                    {item.label}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>¥</span>
                    <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                      {item.value.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {((item.value / maxValue) * 100).toFixed(1)}% 占比
                    </span>
                  </div>
                </div>
              )}

              {/* Bar */}
              <div
                style={{
                  width: "100%",
                  maxWidth: 48,
                  height: barHeight,
                  background: `linear-gradient(180deg, ${color} 0%, ${color}dd 100%)`,
                  borderRadius: "6px 6px 2px 2px",
                  transition:
                    "all 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
                  opacity: isHovered ? 1 : 0.8,
                  transformOrigin: "bottom center",
                  cursor: onBarClick ? "pointer" : "default",
                  boxShadow: isHovered
                    ? `0 4px 12px ${color}40`
                    : "none",
                  animation: animated
                    ? `barGrow 0.5s cubic-bezier(0.25, 1, 0.5, 1) ${i * 40}ms both`
                    : "none",
                }}
                onMouseEnter={() => setHoveredBar(item.originalIndex)}
                onMouseLeave={() => setHoveredBar(null)}
                onClick={() => onBarClick?.(item.originalIndex, data[item.originalIndex])}
              />

              {/* Label */}
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 6,
                  textAlign: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 56,
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
