/**
 * Pure CSS Bar Chart component with interactive features.
 * Supports: vertical/horizontal, single/stacked bars, hover glow, tooltip, click callback.
 */

import { useState, useMemo, useRef, useCallback } from "react";

export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
  /** For stacked bars: secondary value shown in different color */
  secondary?: number;
  secondaryColor?: string;
}

export interface BarChartProps {
  data: BarChartItem[];
  height?: number;
  showValues?: boolean;
  onBarClick?: (index: number, item: BarChartItem) => void;
  sortBy?: "value" | "name" | "none";
  orientation?: "vertical" | "horizontal";
}

const DEFAULT_COLORS = [
  "#0d7377",
  "#c96b4f",
  "#2d8a7a",
  "#6e72b8",
  "#c89a40",
  "#b04e3a",
  "#3d8a5c",
  "#b06b8a",
  "#7a6854",
  "#8a8078",
];

const COLOR_EXPENSE = "#c96b4f";
const COLOR_INCOME = "#0d7377";

type SortMode = "value" | "name";

export function BarChart({
  data,
  height = 220,
  showValues = true,
  onBarClick,
  sortBy = "value",
  orientation = "vertical",
}: BarChartProps) {
  const [sortMode, setSortMode] = useState<SortMode>(
    sortBy === "none" ? "value" : sortBy
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverIdx = useRef<number | null>(null);

  const sortedData = useMemo(() => {
    const indexed = data.map((d, i) => ({ ...d, originalIndex: i }));
    if (sortBy === "none") return indexed;
    if (sortMode === "value") {
      indexed.sort((a, b) => {
        const aTotal = (a.value || 0) + (a.secondary || 0);
        const bTotal = (b.value || 0) + (b.secondary || 0);
        return bTotal - aTotal;
      });
    } else {
      indexed.sort((a, b) => a.label.localeCompare(b.label));
    }
    return indexed;
  }, [data, sortMode, sortBy]);

  const maxValue = useMemo(() => {
    return Math.max(
      ...data.map((d) => (d.value || 0) + (d.secondary || 0)),
      1
    );
  }, [data]);

  const total = useMemo(
    () => data.reduce((sum, d) => sum + (d.value || 0) + (d.secondary || 0), 0),
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
            orientation === "horizontal" ? "scaleX(1.03)" : "scaleY(1.03)";
          if (labelEl) labelEl.style.color = "var(--text-primary)";
          if (valueEl) valueEl.style.color = "var(--text-primary)";
        } else {
          barEl.style.opacity = "0.85";
          barEl.style.transform = "scale(1)";
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
      const total_val = (item.value || 0) + (item.secondary || 0);
      const pct = ((total_val / maxValue) * 100).toFixed(1);
      const share = total > 0 ? ((total_val / total) * 100).toFixed(1) : "0";

      let html = `
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">${item.label}</div>
      `;

      if (item.secondary !== undefined) {
        // Stacked bar tooltip
        html += `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="width:8px;height:8px;border-radius:2px;background:${COLOR_INCOME}"></span>
            <span style="font-size:11px;color:var(--text-tertiary)">收入</span>
            <span style="font-weight:600;font-size:13px;font-family:var(--font-mono);color:var(--text-primary);margin-left:auto">¥${(item.secondary || 0).toLocaleString()}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="width:8px;height:8px;border-radius:2px;background:${COLOR_EXPENSE}"></span>
            <span style="font-size:11px;color:var(--text-tertiary)">支出</span>
            <span style="font-weight:600;font-size:13px;font-family:var(--font-mono);color:var(--text-primary);margin-left:auto">¥${(item.value || 0).toLocaleString()}</span>
          </div>
          <div style="border-top:1px solid var(--border-light);padding-top:4px;display:flex;justify-content:space-between">
            <span style="font-size:11px;color:var(--text-tertiary)">结余</span>
            <span style="font-weight:700;font-size:13px;font-family:var(--font-mono);color:${(item.secondary || 0) - item.value >= 0 ? "var(--color-success)" : "var(--color-danger)"}">¥${((item.secondary || 0) - item.value).toLocaleString()}</span>
          </div>
        `;
      } else {
        html += `
          <div style="display:flex;align-items:baseline;gap:4px">
            <span style="font-size:10px;color:var(--text-tertiary)">¥</span>
            <span style="font-weight:700;font-size:16px;font-family:var(--font-mono);color:var(--text-primary)">${item.value.toLocaleString()}</span>
          </div>
        `;
      }

      html += `
        <div style="display:flex;align-items:center;gap:4px;margin-top:4px">
          <span style="font-size:11px;color:var(--text-tertiary)">${pct}% max / ${share}% total</span>
        </div>
      `;

      tooltipRef.current.innerHTML = html;

      const containerRect = containerRef.current.getBoundingClientRect();
      const barRect = barEl.getBoundingClientRect();
      const tooltipW = 180;

      let tx: number, ty: number;
      if (orientation === "horizontal") {
        tx = barRect.right - containerRect.left + 10;
        ty = barRect.top - containerRect.top + barRect.height / 2 - 50;
      } else {
        tx = barRect.left - containerRect.left + barRect.width / 2 - tooltipW / 2;
        ty = barRect.top - containerRect.top - 10;
      }

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
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No data available</p>
      </div>
    );
  }

  const isHorizontal = orientation === "horizontal";
  const barMaxLen = isHorizontal ? 200 : height - 36;
  const isStacked = data.some((d) => d.secondary !== undefined);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Sort toggle */}
      {sortBy !== "none" && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: 4 }}>
          {(["value", "name"] as SortMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              style={{
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: sortMode === mode ? 600 : 400,
                color: sortMode === mode ? "var(--color-primary)" : "var(--text-muted)",
                background: sortMode === mode ? "rgba(13, 115, 119, 0.08)" : "transparent",
                border: "1px solid",
                borderColor: sortMode === mode ? "rgba(13, 115, 119, 0.2)" : "var(--border-light)",
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

      {/* Bars */}
      <div
        ref={barsRef}
        style={
          isHorizontal
            ? { display: "flex", flexDirection: "column", gap: 6 }
            : { display: "flex", alignItems: "flex-end", gap: 8, height, padding: "0 4px" }
        }
      >
        {sortedData.map((item, i) => {
          const color = item.color || DEFAULT_COLORS[item.originalIndex % DEFAULT_COLORS.length];
          const totalVal = (item.value || 0) + (item.secondary || 0);
          const barLen = (totalVal / maxValue) * barMaxLen;

          if (isHorizontal) {
            const secLen = item.secondary ? (item.secondary / totalVal) * barLen : 0;
            const priLen = item.value ? (item.value / totalVal) * barLen : 0;

            return (
              <div
                key={`${item.label}-${item.originalIndex}`}
                data-bar-item
                style={{ display: "flex", alignItems: "center", gap: 10, height: 28 }}
                onMouseEnter={(e) => handleEnter(item.originalIndex, item, e.currentTarget)}
                onMouseLeave={handleLeave}
                onClick={() => onBarClick?.(item.originalIndex, data[item.originalIndex])}
              >
                <span
                  data-label
                  style={{
                    fontSize: 12, color: "var(--text-muted)", width: 80, textAlign: "right",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    flexShrink: 0, transition: "color 0.15s ease",
                  }}
                >
                  {item.label}
                </span>

                <div
                  data-bar
                  style={{
                    display: "flex",
                    height: 18,
                    borderRadius: "2px 6px 6px 2px",
                    overflow: "hidden",
                    opacity: 0.85,
                    transformOrigin: "left center",
                    cursor: onBarClick ? "pointer" : "default",
                    transition: "all 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
                  }}
                >
                  {isStacked && item.secondary !== undefined && (
                    <div
                      style={{
                        width: secLen,
                        height: "100%",
                        background: COLOR_INCOME,
                        transition: "width 0.3s ease",
                      }}
                    />
                  )}
                  <div
                    style={{
                      width: isStacked ? priLen : barLen,
                      height: "100%",
                      background: isStacked ? COLOR_EXPENSE : `linear-gradient(90deg, ${color} 0%, ${color}dd 100%)`,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>

                {showValues && (
                  <span
                    data-value
                    className="num-display"
                    style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", flexShrink: 0, transition: "color 0.15s ease" }}
                  >
                    {totalVal >= 1000 ? `¥${(totalVal / 1000).toFixed(1)}k` : `¥${totalVal}`}
                  </span>
                )}
              </div>
            );
          }

          // Vertical bar
          const secH = item.secondary ? (item.secondary / totalVal) * barLen : 0;
          const priH = item.value ? (item.value / totalVal) * barLen : 0;

          return (
            <div
              key={`${item.label}-${item.originalIndex}`}
              data-bar-item
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "flex-end", height: "100%",
              }}
              onMouseEnter={(e) => handleEnter(item.originalIndex, item, e.currentTarget)}
              onMouseLeave={handleLeave}
              onClick={() => onBarClick?.(item.originalIndex, data[item.originalIndex])}
            >
              {showValues && (
                <span
                  data-value
                  className="num-display"
                  style={{ fontSize: 11, marginBottom: 4, whiteSpace: "nowrap", color: "var(--text-secondary)", transition: "color 0.15s ease" }}
                >
                  {totalVal >= 1000 ? `¥${(totalVal / 1000).toFixed(1)}k` : `¥${totalVal}`}
                </span>
              )}

              <div
                data-bar
                style={{
                  width: "100%",
                  maxWidth: 48,
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "6px 6px 2px 2px",
                  overflow: "hidden",
                  opacity: 0.85,
                  transformOrigin: "bottom center",
                  cursor: onBarClick ? "pointer" : "default",
                  transition: "all 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
                }}
              >
                {/* Income on top (green) */}
                {isStacked && item.secondary !== undefined && (
                  <div
                    style={{
                      height: secH,
                      background: COLOR_INCOME,
                      transition: "height 0.3s ease",
                    }}
                  />
                )}
                {/* Expense on bottom (red) */}
                <div
                  style={{
                    height: isStacked ? priH : barLen,
                    background: isStacked ? COLOR_EXPENSE : `linear-gradient(180deg, ${color} 0%, ${color}dd 100%)`,
                    transition: "height 0.3s ease",
                  }}
                />
              </div>

              <span
                data-label
                style={{
                  fontSize: 11, color: "var(--text-muted)", marginTop: 6,
                  textAlign: "center", overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", maxWidth: 56, transition: "color 0.15s ease",
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend for stacked mode */}
      {isStacked && (
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: COLOR_INCOME }} />
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>收入</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: COLOR_EXPENSE }} />
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>支出</span>
          </div>
        </div>
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: "absolute", top: 0, left: 0,
          background: "var(--bg-surface, #fff)",
          border: "1px solid var(--border-default, #e5e5e5)",
          padding: "10px 14px", borderRadius: 10, fontSize: 12,
          whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          zIndex: 50, pointerEvents: "none", opacity: 0,
          transition: "opacity 0.15s ease", lineHeight: 1.5, width: 180,
        }}
      />
    </div>
  );
}
