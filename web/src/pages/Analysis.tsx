/**
 * Analysis — Financial analysis dashboard with 4 modules:
 * 1. Monthly income vs expense comparison (grouped bar chart)
 * 2. Current month expense category breakdown (donut chart)
 * 3. Savings rate trend (line chart with reference lines)
 * 4. Current vs previous month comparison cards
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "../i18n";
import {
  fetchAnalysis,
  type AnalysisData,
  type AnalysisMonthlyItem,
  type AnalysisCategoryItem,
} from "../lib/api";

// ── Grouped Bar Chart (monthly income vs expense) ────────────────

function GroupedBarChart({
  data,
  height = 240,
}: {
  data: AnalysisMonthlyItem[];
  height?: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredBar, setHoveredBar] = useState<"income" | "expense" | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(false);
    setAnimKey((k) => k + 1);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [data]);

  if (!data.length) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          No data available
        </p>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1);
  const padLeft = 52;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 36;
  const chartW = 100; // percentage-based
  const barGroupWidth = 100 / data.length;
  const barWidth = barGroupWidth * 0.3;
  const barGap = barGroupWidth * 0.05;

  const formatLabel = (month: string) => {
    const parts = month.split("-");
    return `${parts[1]}月`;
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 12,
          justifyContent: "flex-end",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "#16a34a",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Income
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "#dc2626",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Expense
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 500 ${height}`}
        style={{ width: "100%", height }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
          const y = padTop + (1 - frac) * (height - padTop - padBottom);
          const val = frac * maxVal;
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={500 - padRight}
                y2={y}
                stroke="var(--border-default)"
                strokeWidth={1}
                opacity={0.3}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--text-secondary)"
                fontFamily="var(--font-mono)"
              >
                {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Bar groups */}
        {data.map((item, i) => {
          const groupX =
            padLeft + (i / data.length) * (500 - padLeft - padRight);
          const groupW = (500 - padLeft - padRight) / data.length;
          const incomeH =
            (item.income / maxVal) * (height - padTop - padBottom);
          const expenseH =
            (item.expense / maxVal) * (height - padTop - padBottom);
          const barW = groupW * 0.3;
          const gap = groupW * 0.05;
          const baseY = height - padBottom;

          return (
            <g key={`${animKey}-${item.month}`}>
              {/* Income bar */}
              <rect
                x={groupX + gap}
                y={visible ? baseY - incomeH : baseY}
                width={barW}
                height={visible ? incomeH : 0}
                rx={3}
                fill="#16a34a"
                opacity={
                  hoveredIndex !== null && hoveredIndex !== i ? 0.4 : 0.85
                }
                style={{
                  transition: `all 0.5s cubic-bezier(0.25, 1, 0.5, 1) ${i * 60}ms`,
                  cursor: "pointer",
                }}
                onMouseEnter={() => {
                  setHoveredIndex(i);
                  setHoveredBar("income");
                }}
                onMouseLeave={() => {
                  setHoveredIndex(null);
                  setHoveredBar(null);
                }}
              />

              {/* Expense bar */}
              <rect
                x={groupX + gap + barW + gap}
                y={visible ? baseY - expenseH : baseY}
                width={barW}
                height={visible ? expenseH : 0}
                rx={3}
                fill="#dc2626"
                opacity={
                  hoveredIndex !== null && hoveredIndex !== i ? 0.4 : 0.85
                }
                style={{
                  transition: `all 0.5s cubic-bezier(0.25, 1, 0.5, 1) ${
                    i * 60 + 30
                  }ms`,
                  cursor: "pointer",
                }}
                onMouseEnter={() => {
                  setHoveredIndex(i);
                  setHoveredBar("expense");
                }}
                onMouseLeave={() => {
                  setHoveredIndex(null);
                  setHoveredBar(null);
                }}
              />

              {/* X-axis label */}
              <text
                x={groupX + groupW / 2}
                y={height - 10}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text-secondary)"
                fontFamily="var(--font-mono)"
              >
                {formatLabel(item.month)}
              </text>
            </g>
          );
        })}

        {/* Tooltip */}
        {hoveredIndex !== null && (() => {
          const item = data[hoveredIndex];
          const groupX =
            padLeft +
            (hoveredIndex / data.length) * (500 - padLeft - padRight);
          const groupW = (500 - padLeft - padRight) / data.length;
          const tipX = Math.min(Math.max(groupX + groupW / 2 - 70, 4), 500 - 144);
          const tipY = 4;

          return (
            <foreignObject
              x={tipX}
              y={tipY}
              width={140}
              height={80}
              style={{ overflow: "visible" }}
            >
              <div
                style={{
                  background: "var(--bg-surface, #fff)",
                  border: "1px solid var(--border-default, #e5e5e5)",
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontSize: 12,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  lineHeight: 1.5,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    marginBottom: 4,
                  }}
                >
                  {item.month}
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginBottom: 2,
                      }}
                    >
                      Income
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        fontFamily: "var(--font-mono)",
                        color: "#16a34a",
                      }}
                    >
                      ¥{item.income.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginBottom: 2,
                      }}
                    >
                      Expense
                    </div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        fontFamily: "var(--font-mono)",
                        color: "#dc2626",
                      }}
                    >
                      ¥{item.expense.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </foreignObject>
          );
        })()}
      </svg>
    </div>
  );
}

// ── Savings Rate Line Chart (with reference lines) ───────────────

function SavingsRateChart({
  data,
  height = 220,
}: {
  data: { month: string; rate: number }[];
  height?: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(500);
  const containerRef = useRef<HTMLDivElement>(null);
  const [animKey, setAnimKey] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setVisible(false);
    setAnimKey((k) => k + 1);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [data]);

  if (!data.length) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          No data available
        </p>
      </div>
    );
  }

  const padLeft = 48;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 32;
  const width = containerWidth;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = 100;
  const minVal = 0;
  const range = maxVal - minVal;

  const points = data.map((d, i) => {
    const x = padLeft + (i / (data.length - 1 || 1)) * chartW;
    const y = padTop + chartH - ((d.rate - minVal) / range) * chartH;
    return { x, y };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = `${padLeft},${padTop + chartH} ${polylinePoints} ${
    width - padRight
  },${padTop + chartH}`;

  // Reference lines
  const refLines = [
    { value: 40, label: "40% Excellent", color: "#16a34a" },
    { value: 20, label: "20% Good", color: "#eab308" },
  ];

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="savingsAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0891b2" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#0891b2" stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {/* Y-axis labels */}
        {[0, 25, 50, 75, 100].map((val) => {
          const y = padTop + chartH - (val / range) * chartH;
          return (
            <text
              key={val}
              x={padLeft - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--text-secondary)"
              fontFamily="var(--font-mono)"
            >
              {val}%
            </text>
          );
        })}

        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((val) => {
          const y = padTop + chartH - (val / range) * chartH;
          return (
            <line
              key={val}
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="var(--border-default)"
              strokeWidth={1}
              opacity={0.2}
            />
          );
        })}

        {/* Reference lines */}
        {refLines.map((ref) => {
          const y = padTop + chartH - (ref.value / range) * chartH;
          return (
            <g key={ref.value}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke={ref.color}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                opacity={0.5}
              />
              <text
                x={width - padRight + 4}
                y={y + 4}
                fontSize={10}
                fill={ref.color}
                fontFamily="var(--font-mono)"
                opacity={0.7}
              >
                {ref.label}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          const x = padLeft + (i / (data.length - 1 || 1)) * chartW;
          const label = d.month.split("-")[1] + "月";
          return (
            <text
              key={i}
              x={x}
              y={height - 8}
              textAnchor="middle"
              fontSize={11}
              fill="var(--text-secondary)"
              fontFamily="var(--font-mono)"
            >
              {label}
            </text>
          );
        })}

        {/* Area fill */}
        <polygon
          key={`area-${animKey}`}
          points={areaPoints}
          fill="url(#savingsAreaGrad)"
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 0.6s ease 0.1s",
          }}
        />

        {/* Crosshair */}
        {hoverIndex !== null && (
          <line
            x1={points[hoverIndex].x}
            y1={padTop}
            x2={points[hoverIndex].x}
            y2={padTop + chartH}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.4}
          />
        )}

        {/* Line */}
        <polyline
          key={`line-${animKey}`}
          points={polylinePoints}
          fill="none"
          stroke="#0891b2"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.5s ease, transform 0.5s ease",
          }}
        />

        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={24}
              fill="transparent"
              style={{ cursor: "default" }}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
            />
            {hoverIndex === i && (
              <circle
                cx={p.x}
                cy={p.y}
                r={10}
                fill="#0891b2"
                fillOpacity={0.1}
                style={{ pointerEvents: "none" }}
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={hoverIndex === i ? 5 : 3}
              fill="#0891b2"
              stroke="var(--bg-secondary)"
              strokeWidth={hoverIndex === i ? 2 : 1.5}
              style={{
                pointerEvents: "none",
                transition: "r 0.2s cubic-bezier(0.25, 1, 0.5, 1)",
              }}
            />
          </g>
        ))}

        {/* Tooltip */}
        {hoverIndex !== null && (() => {
          const p = points[hoverIndex];
          const item = data[hoverIndex];
          const tipW = 100;
          const tipH = 48;
          let tx = p.x - tipW / 2;
          let ty = p.y - tipH - 12;
          if (tx < 4) tx = 4;
          if (tx + tipW > width - 4) tx = width - tipW - 4;
          if (ty < 4) ty = p.y + 12;

          return (
            <foreignObject
              x={tx}
              y={ty}
              width={tipW}
              height={tipH}
              style={{ overflow: "visible" }}
            >
              <div
                style={{
                  background: "var(--bg-surface, #fff)",
                  border: "1px solid var(--border-default, #e5e5e5)",
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  lineHeight: 1.4,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginBottom: 2,
                  }}
                >
                  {item.month}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 15,
                    fontFamily: "var(--font-mono)",
                    color: "#0891b2",
                  }}
                >
                  {item.rate.toFixed(1)}%
                </div>
              </div>
            </foreignObject>
          );
        })()}
      </svg>
    </div>
  );
}

// ── Category Donut Chart ─────────────────────────────────────────

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
): string {
  const clampedEnd = Math.min(endAngle, startAngle + 359.999);
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, clampedEnd);
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0;

  if (innerR === 0) {
    return [
      `M ${cx} ${cy}`,
      `L ${outerStart.x} ${outerStart.y}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
      `Z`,
    ].join(" ");
  }

  const innerStart = polarToCartesian(cx, cy, innerR, clampedEnd);
  const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

function CategoryDonut({
  data,
  total,
}: {
  data: AnalysisCategoryItem[];
  total: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredLegend, setHoveredLegend] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    setIsAnimating(true);
    setAnimKey((k) => k + 1);
    const timer = setTimeout(() => setIsAnimating(false), 500);
    return () => clearTimeout(timer);
  }, [data]);

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR * 0.58;
  const hoverOffset = 6;

  const sectors = data.map((_, i) => {
    let cumulative = 0;
    for (let j = 0; j < i; j++) cumulative += data[j].value;
    const startAngle = (cumulative / total) * 360;
    cumulative += data[i].value;
    const endAngle = (cumulative / total) * 360;
    const midAngle = (startAngle + endAngle) / 2;
    return { startAngle, endAngle, midAngle };
  });

  const activeIndex = hoveredIndex ?? hoveredLegend;

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
      {/* SVG Donut */}
      <div
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          position: "relative",
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {data.map((item, i) => {
            const { startAngle, endAngle, midAngle } = sectors[i];
            const isActive = activeIndex === i;
            const offsetRad = ((midAngle - 90) * Math.PI) / 180;
            const tx = isActive ? Math.cos(offsetRad) * hoverOffset : 0;
            const ty = isActive ? Math.sin(offsetRad) * hoverOffset : 0;
            const sectorOpacity = isAnimating
              ? 0
              : activeIndex !== null && !isActive
              ? 0.5
              : 1;

            return (
              <path
                key={`${animKey}-${item.category}`}
                d={describeArc(cx, cy, outerR, innerR, startAngle, endAngle)}
                fill={item.color}
                transform={`translate(${tx}, ${ty})`}
                style={{
                  transition: `opacity 0.4s ease-out ${i * 40}ms, all 0.2s cubic-bezier(0.25, 1, 0.5, 1)`,
                  cursor: "pointer",
                  opacity: sectorOpacity,
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}

          {/* Center */}
          <foreignObject
            x={cx - innerR * 0.7}
            y={cy - innerR * 0.6}
            width={innerR * 1.4}
            height={innerR * 1.2}
            style={{ pointerEvents: "none" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <span
                className="num-display"
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  lineHeight: 1.2,
                }}
              >
                ¥{total.toLocaleString()}
              </span>
              <span
                style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}
              >
                Total
              </span>
            </div>
          </foreignObject>
        </svg>
      </div>

      {/* Legend list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flex: 1,
          minWidth: 160,
        }}
      >
        {data.map((item, i) => {
          const pct = total > 0 ? ((item.amount / total) * 100).toFixed(1) : "0.0";
          const isActive = activeIndex === i;

          return (
            <div
              key={item.category}
              onMouseEnter={() => setHoveredLegend(i)}
              onMouseLeave={() => setHoveredLegend(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: hoveredLegend !== null && !isActive ? 0.4 : 1,
                transition: "opacity 0.2s",
                cursor: "pointer",
                padding: "2px 0",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: item.color,
                  flexShrink: 0,
                  boxShadow: isActive ? `0 0 6px ${item.color}80` : "none",
                  transition: "box-shadow 0.2s",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-primary)",
                  minWidth: 48,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {item.category}
              </span>
              <span
                className="num-display"
                style={{ fontSize: 12, color: "var(--text-secondary)" }}
              >
                ¥{item.amount.toLocaleString()}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Comparison Card ──────────────────────────────────────────────

function ComparisonCard({
  label,
  current,
  previous,
  changePct,
  color,
}: {
  label: string;
  current: number;
  previous: number;
  changePct: number;
  color: string;
}) {
  const isPositive = changePct >= 0;
  const changeColor = isPositive ? "var(--color-success)" : "var(--color-danger)";

  return (
    <div
      className="animate-in"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "20px 24px",
        boxShadow: "var(--shadow-sm)",
        transition: "all 0.3s var(--ease-out-quart)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 500,
          marginBottom: 12,
        }}
      >
        {label}
      </div>

      {/* Current value */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            marginBottom: 2,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          This Month
        </div>
        <div
          className="num-display"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "var(--text-primary)",
            lineHeight: 1.1,
          }}
        >
          ¥{current.toLocaleString()}
        </div>
      </div>

      {/* Previous value */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            marginBottom: 2,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Last Month
        </div>
        <div
          className="num-display"
          style={{
            fontSize: 16,
            fontWeight: 500,
            color: "var(--text-secondary)",
          }}
        >
          ¥{previous.toLocaleString()}
        </div>
      </div>

      {/* Change percentage */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "var(--font-mono)",
          color: changeColor,
          background: isPositive
            ? "rgba(22, 163, 74, 0.1)"
            : "rgba(220, 38, 38, 0.1)",
          padding: "3px 8px",
          borderRadius: 6,
        }}
      >
        <span>{isPositive ? "↑" : "↓"}</span>
        <span>{Math.abs(changePct).toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ── Main Analysis Page ───────────────────────────────────────────

export default function Analysis() {
  const { t } = useTranslation();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchAnalysis()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page">
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          {t("common.loading")}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          {t("analysis.noData")}
        </p>
      </div>
    );
  }

  const categoryTotal = data.category_breakdown.reduce(
    (sum, c) => sum + c.amount,
    0
  );

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Page title */}
      <div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 24,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {t("analysis.title")}
        </h2>
      </div>

      {/* Comparison cards row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        <ComparisonCard
          label={t("analysis.income")}
          current={data.current_vs_previous.income.current}
          previous={data.current_vs_previous.income.previous}
          changePct={data.current_vs_previous.income.change_pct}
          color="#16a34a"
        />
        <ComparisonCard
          label={t("analysis.expense")}
          current={data.current_vs_previous.expense.current}
          previous={data.current_vs_previous.expense.previous}
          changePct={data.current_vs_previous.expense.change_pct}
          color="#dc2626"
        />
        <ComparisonCard
          label={t("analysis.savings")}
          current={data.current_vs_previous.savings.current}
          previous={data.current_vs_previous.savings.previous}
          changePct={data.current_vs_previous.savings.change_pct}
          color="#0891b2"
        />
      </div>

      {/* Charts row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        {/* Monthly comparison */}
        <div
          className="elevated-card"
          style={{ overflow: "visible" }}
        >
          <h4
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 16,
            }}
          >
            {t("analysis.monthlyComparison")}
          </h4>
          <GroupedBarChart data={data.monthly_comparison} />
        </div>

        {/* Category breakdown */}
        <div
          className="elevated-card"
          style={{ overflow: "visible" }}
        >
          <h4
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 16,
            }}
          >
            {t("analysis.categoryBreakdown")}
          </h4>
          {data.category_breakdown.length > 0 ? (
            <CategoryDonut data={data.category_breakdown} total={categoryTotal} />
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-muted)", padding: 24 }}>
              {t("analysis.noData")}
            </p>
          )}
        </div>
      </div>

      {/* Savings rate trend (full width) */}
      <div className="elevated-card" style={{ overflow: "visible" }}>
        <h4
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 16,
          }}
        >
          {t("analysis.savingsTrend")}
        </h4>
        <SavingsRateChart data={data.savings_trend} />
      </div>
    </div>
  );
}
