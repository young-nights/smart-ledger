/**
 * Stacked Bar Chart: expense (red, bottom) + income (blue, top).
 * Each segment scaled independently to its own max for visibility.
 */

import { useState, useMemo, useRef, useCallback } from "react";

export interface BarChartItem {
  label: string;
  value: number;       // expense
  color?: string;
  secondary?: number;  // income
}

export interface BarChartProps {
  data: BarChartItem[];
  height?: number;
  showValues?: boolean;
  onBarClick?: (index: number, item: BarChartItem) => void;
  sortBy?: "value" | "name" | "none";
}

const COLOR_EXPENSE = "#c96b4f";
const COLOR_INCOME = "#0d7377";

type SortMode = "value" | "name";

export function BarChart({
  data,
  height = 220,
  showValues = true,
  onBarClick,
  sortBy = "value",
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
      indexed.sort((a, b) => (b.value || 0) - (a.value || 0));
    } else {
      indexed.sort((a, b) => a.label.localeCompare(b.label));
    }
    return indexed;
  }, [data, sortMode, sortBy]);

  // Scale each segment independently to its own max
  const maxExpense = useMemo(() => Math.max(...data.map((d) => d.value || 0), 1), [data]);
  const maxIncome = useMemo(() => Math.max(...data.map((d) => d.secondary || 0), 1), [data]);

  // Each segment gets up to half the available height
  const segMaxH = (height - 40) / 2;

  const updateBarVisuals = useCallback((idx: number | null) => {
    if (!barsRef.current) return;
    const items = barsRef.current.querySelectorAll("[data-bar-item]");
    items.forEach((el, i) => {
      const group = el as HTMLElement;
      const bar = group.querySelector("[data-stacked]");
      const lbl = group.querySelector("[data-label]");
      const val = group.querySelector("[data-value]");
      if (i === idx) {
        if (bar) (bar as HTMLElement).style.filter = "brightness(1.1) drop-shadow(0 2px 6px rgba(0,0,0,0.15))";
        if (lbl) (lbl as HTMLElement).style.color = "var(--text-primary)";
        if (val) (val as HTMLElement).style.color = "var(--text-primary)";
      } else {
        if (bar) (bar as HTMLElement).style.filter = "";
        if (lbl) (lbl as HTMLElement).style.color = "var(--text-muted)";
        if (val) (val as HTMLElement).style.color = "var(--text-secondary)";
      }
    });
  }, []);

  const showTooltipFor = useCallback(
    (idx: number, item: BarChartItem, barEl: HTMLElement) => {
      if (!tooltipRef.current || !containerRef.current) return;
      const inc = item.secondary || 0;
      const exp = item.value || 0;
      const net = inc - exp;

      tooltipRef.current.innerHTML = `
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">${item.label}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="width:8px;height:8px;border-radius:2px;background:${COLOR_INCOME}"></span>
          <span style="font-size:11px;color:var(--text-tertiary)">收入</span>
          <span style="font-weight:600;font-size:13px;font-family:var(--font-mono);color:var(--text-primary);margin-left:auto">¥${inc.toLocaleString()}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <span style="width:8px;height:8px;border-radius:2px;background:${COLOR_EXPENSE}"></span>
          <span style="font-size:11px;color:var(--text-tertiary)">支出</span>
          <span style="font-weight:600;font-size:13px;font-family:var(--font-mono);color:var(--text-primary);margin-left:auto">¥${exp.toLocaleString()}</span>
        </div>
        <div style="border-top:1px solid var(--border-light);padding-top:5px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;color:var(--text-tertiary)">净额</span>
          <span style="font-weight:700;font-size:14px;font-family:var(--font-mono);color:${net >= 0 ? "var(--color-success)" : "var(--color-danger)"}">¥${net >= 0 ? "+" : ""}${net.toLocaleString()}</span>
        </div>
      `;

      const cRect = containerRef.current.getBoundingClientRect();
      const bRect = barEl.getBoundingClientRect();
      const tw = 180;
      let tx = bRect.left - cRect.left + bRect.width / 2 - tw / 2;
      let ty = bRect.top - cRect.top - 10;
      if (tx + tw > cRect.width - 8) tx = cRect.width - tw - 8;
      if (tx < 8) tx = 8;
      if (ty < 8) ty = bRect.bottom - cRect.top + 10;

      tooltipRef.current.style.left = `${tx}px`;
      tooltipRef.current.style.top = `${ty}px`;
      tooltipRef.current.style.opacity = "1";
    },
    []
  );

  const hideTooltip = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
  }, []);

  const handleEnter = useCallback(
    (i: number, item: BarChartItem, el: HTMLElement) => {
      hoverIdx.current = i;
      updateBarVisuals(i);
      showTooltipFor(i, item, el);
    },
    [updateBarVisuals, showTooltipFor]
  );

  const handleLeave = useCallback(() => {
    hoverIdx.current = null;
    updateBarVisuals(null);
    hideTooltip();
  }, [updateBarVisuals, hideTooltip]);

  if (!data.length) {
    return <div style={{ padding: 24 }}><p style={{ fontSize: 13, color: "var(--text-muted)" }}>No data available</p></div>;
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {sortBy !== "none" && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: 4 }}>
          {(["value", "name"] as SortMode[]).map((m) => (
            <button key={m} onClick={() => setSortMode(m)} style={{
              padding: "2px 8px", fontSize: 11,
              fontWeight: sortMode === m ? 600 : 400,
              color: sortMode === m ? "var(--color-primary)" : "var(--text-muted)",
              background: sortMode === m ? "rgba(13,115,119,0.08)" : "transparent",
              border: "1px solid", borderColor: sortMode === m ? "rgba(13,115,119,0.2)" : "var(--border-light)",
              borderRadius: 4, cursor: "pointer", transition: "all 0.15s", fontFamily: "var(--font-body)",
            }}>{m === "value" ? "Amount" : "Name"}</button>
          ))}
        </div>
      )}

      <div ref={barsRef} style={{ display: "flex", alignItems: "flex-end", gap: 6, height, padding: "0 4px" }}>
        {sortedData.map((item) => {
          const exp = item.value || 0;
          const inc = item.secondary || 0;
          // Each segment scaled to its own max
          const expH = (exp / maxExpense) * segMaxH;
          const incH = (inc / maxIncome) * segMaxH;
          const total = exp + inc;

          return (
            <div
              key={`${item.label}-${item.originalIndex}`}
              data-bar-item
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", cursor: onBarClick ? "pointer" : "default" }}
              onMouseEnter={(e) => handleEnter(item.originalIndex, item, e.currentTarget)}
              onMouseLeave={handleLeave}
              onClick={() => onBarClick?.(item.originalIndex, data[item.originalIndex])}
            >
              {showValues && (
                <span data-value className="num-display" style={{ fontSize: 10, marginBottom: 3, whiteSpace: "nowrap", color: "var(--text-secondary)", transition: "color 0.15s ease" }}>
                  {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total}
                </span>
              )}

              {/* Stacked bar: income top (blue), expense bottom (red) */}
              <div data-stacked style={{ width: 40, transition: "filter 0.15s ease" }}>
                <div style={{ width: 40, height: incH, background: "#0d7377" }}></div>
                <div style={{ width: 40, height: expH, background: "#c96b4f" }}></div>
              </div>

              <span data-label style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 5, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 52, transition: "color 0.15s ease" }}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

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

      <div ref={tooltipRef} style={{
        position: "absolute", top: 0, left: 0,
        background: "var(--bg-surface, #fff)", border: "1px solid var(--border-default, #e5e5e5)",
        padding: "10px 14px", borderRadius: 10, fontSize: 12, whiteSpace: "nowrap",
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 50, pointerEvents: "none",
        opacity: 0, transition: "opacity 0.15s ease", lineHeight: 1.5, width: 180,
      }} />
    </div>
  );
}
