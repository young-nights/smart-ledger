/**
 * Bar Chart with dual-bar layout per item:
 * - Stacked bar: expense (red, bottom) + income (blue, top)
 * - Net bar: income - expense (green positive, red negative)
 */

import { useState, useMemo, useRef, useCallback } from "react";

export interface BarChartItem {
  label: string;
  value: number;
  color?: string;
  secondary?: number;
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
const COLOR_NET_POS = "#3d8a5c";
const COLOR_NET_NEG = "#c96b4f";

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
      indexed.sort((a, b) => {
        const aNet = (a.secondary || 0) - (a.value || 0);
        const bNet = (b.secondary || 0) - (b.value || 0);
        return bNet - aNet;
      });
    } else {
      indexed.sort((a, b) => a.label.localeCompare(b.label));
    }
    return indexed;
  }, [data, sortMode, sortBy]);

  // Max total for stacked bar height normalization
  const maxTotal = useMemo(() => {
    return Math.max(
      ...data.map((d) => (d.value || 0) + (d.secondary || 0)),
      1
    );
  }, [data]);

  // Max absolute net for net bar height normalization
  const maxNet = useMemo(() => {
    return Math.max(
      ...data.map((d) => Math.abs((d.secondary || 0) - (d.value || 0))),
      1
    );
  }, [data]);

  const barAreaH = height - 32;

  // ── Ref-based hover ──
  const updateBarVisuals = useCallback((idx: number | null) => {
    if (!barsRef.current) return;
    const groups = barsRef.current.querySelectorAll("[data-group]");
    groups.forEach((el, i) => {
      const group = el as HTMLElement;
      const bars = group.querySelectorAll("[data-bar]");
      bars.forEach((b) => {
        const bar = b as HTMLElement;
        if (i === idx) {
          bar.style.filter = "brightness(1.1)";
        } else {
          bar.style.filter = "";
        }
      });
      const labelEl = group.querySelector("[data-label]");
      if (labelEl) {
        (labelEl as HTMLElement).style.color = i === idx ? "var(--text-primary)" : "var(--text-muted)";
      }
    });
  }, []);

  const showTooltipFor = useCallback(
    (idx: number, item: BarChartItem, groupEl: HTMLElement) => {
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
          <span style="font-size:11px;color:var(--text-tertiary)">净收入</span>
          <span style="font-weight:700;font-size:14px;font-family:var(--font-mono);color:${net >= 0 ? COLOR_NET_POS : COLOR_NET_NEG}">¥${net >= 0 ? "+" : ""}${net.toLocaleString()}</span>
        </div>
      `;

      const containerRect = containerRef.current.getBoundingClientRect();
      const groupRect = groupEl.getBoundingClientRect();
      const tooltipW = 180;
      let tx = groupRect.left - containerRect.left + groupRect.width / 2 - tooltipW / 2;
      let ty = groupRect.top - containerRect.top - 10;
      if (tx + tooltipW > containerRect.width - 8) tx = containerRect.width - tooltipW - 8;
      if (tx < 8) tx = 8;
      if (ty < 8) ty = groupRect.bottom - containerRect.top + 10;

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
    (i: number, item: BarChartItem, groupEl: HTMLElement) => {
      hoverIdx.current = i;
      updateBarVisuals(i);
      showTooltipFor(i, item, groupEl);
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
                padding: "2px 8px", fontSize: 11,
                fontWeight: sortMode === mode ? 600 : 400,
                color: sortMode === mode ? "var(--color-primary)" : "var(--text-muted)",
                background: sortMode === mode ? "rgba(13, 115, 119, 0.08)" : "transparent",
                border: "1px solid",
                borderColor: sortMode === mode ? "rgba(13, 115, 119, 0.2)" : "var(--border-light)",
                borderRadius: 4, cursor: "pointer", transition: "all 0.15s",
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
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          height,
          padding: "0 4px",
        }}
      >
        {sortedData.map((item, i) => {
          const inc = item.secondary || 0;
          const exp = item.value || 0;
          const net = inc - exp;
          const total = inc + exp;

          // Stacked bar heights
          const stackedH = (total / maxTotal) * barAreaH;
          const expH = total > 0 ? (exp / total) * stackedH : 0;
          const incH = total > 0 ? (inc / total) * stackedH : 0;

          // Net bar height
          const netH = (Math.abs(net) / maxNet) * barAreaH;
          const netPositive = net >= 0;

          return (
            <div
              key={`${item.label}-${item.originalIndex}`}
              data-group
              style={{
                flex: 1,
                display: "flex",
                alignItems: "flex-end",
                gap: 3,
                height: "100%",
                cursor: onBarClick ? "pointer" : "default",
                transition: "transform 0.2s ease",
                transformOrigin: "center bottom",
              }}
              onMouseEnter={(e) => handleEnter(item.originalIndex, item, e.currentTarget)}
              onMouseLeave={handleLeave}
              onClick={() => onBarClick?.(item.originalIndex, data[item.originalIndex])}
            >
              {/* Stacked bar: expense (red, bottom) + income (blue, top) */}
              <div
                data-bar
                style={{
                  flex: 2,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  height: "100%",
                  transition: "filter 0.15s ease",
                }}
              >
                {/* Income on top */}
                <div
                  style={{
                    height: incH,
                    background: `linear-gradient(180deg, ${COLOR_INCOME} 0%, ${COLOR_INCOME}cc 100%)`,
                    borderRadius: incH > 0 && expH === 0 ? "4px 4px 0 0" : 0,
                    transition: "height 0.3s ease",
                  }}
                />
                {/* Expense on bottom */}
                <div
                  style={{
                    height: expH,
                    background: `linear-gradient(180deg, ${COLOR_EXPENSE} 0%, ${COLOR_EXPENSE}cc 100%)`,
                    borderRadius: "0 0 4px 4px",
                    transition: "height 0.3s ease",
                  }}
                />
              </div>

              {/* Net bar */}
              <div
                data-bar
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  height: "100%",
                  transition: "filter 0.15s ease",
                }}
              >
                <div
                  style={{
                    height: netH,
                    background: netPositive
                      ? `linear-gradient(180deg, ${COLOR_NET_POS} 0%, ${COLOR_NET_POS}cc 100%)`
                      : `linear-gradient(180deg, ${COLOR_NET_NEG} 0%, ${COLOR_NET_NEG}cc 100%)`,
                    borderRadius: "4px 4px 0 0",
                    transition: "height 0.3s ease",
                  }}
                />
              </div>

              {/* Label */}
              <span
                data-label
                style={{
                  position: "absolute",
                  bottom: -20,
                  left: 0,
                  right: 0,
                  fontSize: 11,
                  color: "var(--text-muted)",
                  textAlign: "center",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  transition: "color 0.15s ease",
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: COLOR_INCOME }} />
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>收入</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: COLOR_EXPENSE }} />
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>支出</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: COLOR_NET_POS }} />
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>净收入</span>
        </div>
      </div>

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
