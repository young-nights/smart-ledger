/**
 * Pure CSS Bar Chart component with interactive features.
 * Features: hover glow, tooltip with details, click callback,
 * entry grow animation, sort toggle, horizontal/vertical orientation.
 */

import { useState, useMemo, useRef, useCallback } from "react";

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
  orientation?: "vertical" | "horizontal";
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
  orientation = "vertical",
}: BarChartProps) {
  const hoverIdx = useRef<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>(
    sortBy === "none" ? "value" : sortBy
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

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

  const maxValue = useMemo(
    () => Math.max(...data.map((d) => d.value), 1),
    [data]
  );

  const total = useMemo(
    () => data.reduce((sum, d) => sum + d.value, 0),
    [data]
  );

  // ── Ref-based hover (no React state during hover) ──
  const updateBarVisuals = useCallback(
    (idx: number | null) => {
      if (!barsRef.current) return;
      const items = barsRef.current.querySelectorAll("[data-bar-item]");
      items.forEach((el, i) => {
        const bar = el as HTMLElement;
        const barEl = bar.querySelector("[data-bar]") as HTMLElement | null;
        const labelEl = bar.querySelector("[data-label]") as HTMLElement | null;
        const valueEl = bar.querySelector("[data-value]") as HTMLElement | null;
        if (!barEl) return;

        if (i === idx) {
          barEl.style.opacity = "1";
          barEl.style.transform =
            orientation === "horizontal" ? "scaleX(1.04)" : "scaleY(1.04)";
          barEl.style.boxShadow = `0 4px 12px ${barEl.dataset.color || "#000"}40`;
          if (labelEl) labelEl.style.color = "var(--text-primary)";
          if (valueEl) valueEl.style.color = "var(--text-primary)";
        } else {
          barEl.style.opacity = "0.8";
          barEl.style.transform = "scale(1)";
          barEl.style.boxShadow = "none";
          if (labelEl) labelEl.style.color = "var(--text-muted)";
          if (valueEl) valueEl.style.color = "var(--text-secondary)";
        }
      });
    },
    [orientation]
  );

  const showTooltipFor = useCallback(
    (idx: number, item: BarChartItem, barEl: HTMLElement) => {
      if (!tooltipRef.current || !containerRef.current) return;
      const pct = ((item.value / maxValue) * 100).toFixed(1);
      const share = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";

      tooltipRef.current.innerHTML = `
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">${item.label}</div>
        <div style="display:flex;align-items:baseline;gap:4px">
          <span style="font-size:10px;color:var(--text-tertiary)">¥</span>
          <span style="font-weight:700;font-size:16px;font-family:var(--font-mono);color:var(--text-primary)">${item.value.toLocaleString()}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
          <span style="width:8px;height:8px;border-radius:2px;background:${item.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]}"></span>
          <span style="font-size:11px;color:var(--text-tertiary)">${pct}% max / ${share}% total</span>
        </div>
      `;

      const containerRect = containerRef.current.getBoundingClientRect();
      const barRect = barEl.getBoundingClientRect();
      const tooltipW = 170;

      let tx: number, ty: number;
      if (orientation === "horizontal") {
        tx = barRect.right - containerRect.left + 10;
        ty = barRect.top - containerRect.top + barRect.height / 2 - 40;
      } else {
        tx = barRect.left - containerRect.left + barRect.width / 2 - tooltipW / 2;
        ty = barRect.top - containerRect.top - 10;
      }

      // Clamp to container bounds
      if (tx + tooltipW > containerRect.width - 8) {
        tx = orientation === "horizontal"
          ? barRect.left - containerRect.left - tooltipW - 10
          : containerRect.width - tooltipW - 8;
      }
      if (tx < 8) tx = 8;
      if (ty < 8) ty = barRect.bottom - containerRect.top + 10;

      tooltipRef.current.style.left = `${tx}px`;
      tooltipRef.current.style.top = `${ty}px`;
      tooltipRef.current.style.opacity = "1";
    },
    [maxValue, total, orientation]
  );

  const hideTooltip = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
  }, []);

  const handleEnter = useCallback(
    (i: number, item: BarChartItem, barEl: HTMLElement) => {
      hoverIdx.current = i;
      updateBarVisuals(i);
      showTooltipFor(i, item, barEl);
    },
    [updateBarVisuals, showTooltipFor]
  );

  const handleLeave = useCallback(() => {
    hoverIdx.current = null;
    updateBarVisuals(null);
    hideTooltip();
  }, [updateBarVisuals, hideTooltip]);

  if (!data.length) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          No data available
        </p>
      </div>
    );
  }

  const isHorizontal = orientation === "horizontal";
  const barMaxLen = isHorizontal ? 200 : height - 36;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Sort toggle */}
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

      {/* Bars container */}
      <div
        ref={barsRef}
        style={
          isHorizontal
            ? {
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }
            : {
                display: "flex",
                alignItems: "flex-end",
                gap: 8,
                height,
                padding: "0 4px",
              }
        }
      >
        {sortedData.map((item, i) => {
          const barLen = (item.value / maxValue) * barMaxLen;
          const color =
            item.color ||
            DEFAULT_COLORS[item.originalIndex % DEFAULT_COLORS.length];
          const pct = ((item.value / maxValue) * 100).toFixed(0);
          const barKey = `${item.label}-${item.value}-${i}`;

          if (isHorizontal) {
            return (
              <div
                key={barKey}
                data-bar-item
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 28,
                }}
                onMouseEnter={(e) =>
                  handleEnter(item.originalIndex, item, e.currentTarget)
                }
                onMouseLeave={handleLeave}
                onClick={() =>
                  onBarClick?.(item.originalIndex, data[item.originalIndex])
                }
              >
                {/* Label */}
                <span
                  data-label
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    width: 80,
                    textAlign: "right",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    transition: "color 0.15s ease",
                  }}
                >
                  {item.label}
                </span>

                {/* Bar */}
                <div
                  data-bar
                  data-color={color}
                  style={{
                    height: 18,
                    width: barLen,
                    minWidth: 2,
                    background: `linear-gradient(90deg, ${color} 0%, ${color}dd 100%)`,
                    borderRadius: "2px 6px 6px 2px",
                    transition:
                      "all 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
                    opacity: 0.8,
                    transformOrigin: "left center",
                    cursor: onBarClick ? "pointer" : "default",
                    animation: animated
                      ? `barGrowH 0.5s cubic-bezier(0.25, 1, 0.5, 1) ${i * 40}ms both`
                      : "none",
                  }}
                />

                {/* Value */}
                {showValues && (
                  <span
                    data-value
                    className="num-display"
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      transition: "color 0.15s ease",
                    }}
                  >
                    {item.value >= 1000
                      ? `¥${(item.value / 1000).toFixed(1)}k`
                      : `¥${item.value}`}
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--text-tertiary)",
                        marginLeft: 4,
                      }}
                    >
                      {pct}%
                    </span>
                  </span>
                )}
              </div>
            );
          }

          // Vertical bar
          return (
            <div
              key={barKey}
              data-bar-item
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                height: "100%",
                position: "relative",
              }}
              onMouseEnter={(e) =>
                handleEnter(item.originalIndex, item, e.currentTarget)
              }
              onMouseLeave={handleLeave}
              onClick={() =>
                onBarClick?.(item.originalIndex, data[item.originalIndex])
              }
            >
              {/* Value label */}
              {showValues && (
                <span
                  data-value
                  className="num-display"
                  style={{
                    fontSize: 11,
                    marginBottom: 4,
                    whiteSpace: "nowrap",
                    transition: "color 0.15s ease",
                    color: "var(--text-secondary)",
                  }}
                >
                  {item.value >= 1000
                    ? `¥${(item.value / 1000).toFixed(1)}k`
                    : `¥${item.value}`}
                </span>
              )}

              {/* Bar */}
              <div
                data-bar
                data-color={color}
                style={{
                  width: "100%",
                  maxWidth: 48,
                  height: barLen,
                  background: `linear-gradient(180deg, ${color} 0%, ${color}dd 100%)`,
                  borderRadius: "6px 6px 2px 2px",
                  transition:
                    "all 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
                  opacity: 0.8,
                  transformOrigin: "bottom center",
                  cursor: onBarClick ? "pointer" : "default",
                  animation: animated
                    ? `barGrow 0.5s cubic-bezier(0.25, 1, 0.5, 1) ${i * 40}ms both`
                    : "none",
                }}
              />

              {/* Label */}
              <span
                data-label
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 6,
                  textAlign: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 56,
                  transition: "color 0.15s ease",
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          background: "var(--bg-surface, #fff)",
          border: "1px solid var(--border-default, #e5e5e5)",
          padding: "10px 14px",
          borderRadius: 10,
          fontSize: 12,
          whiteSpace: "nowrap",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          zIndex: 50,
          pointerEvents: "none",
          opacity: 0,
          transition: "opacity 0.15s ease",
          lineHeight: 1.5,
          width: 170,
        }}
      />

      {/* Keyframe animations */}
      <style>{`
        @keyframes barGrow {
          from { transform: scaleY(0); opacity: 0; }
          to { transform: scaleY(1); opacity: 0.8; }
        }
        @keyframes barGrowH {
          from { transform: scaleX(0); opacity: 0; }
          to { transform: scaleX(1); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
