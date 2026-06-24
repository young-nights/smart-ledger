/**
 * Pure SVG Line Chart component with interactive features.
 * Features: crosshair, gradient area fill, animated line draw,
 * hover tooltip card, and dot click callback.
 */

import { useState, useRef, useEffect, useCallback } from "react";

export interface LineChartItem {
  label: string;
  value: number;
  income?: number;
}

export interface LineChartProps {
  data: LineChartItem[];
  height?: number;
  color?: string;
  showDots?: boolean;
  showGrid?: boolean;
  onDotClick?: (index: number, item: LineChartItem) => void;
  showCrosshair?: boolean;
}

export function LineChart({
  data,
  height = 200,
  color = "#0d7377",
  showDots = true,
  showGrid = true,
  onDotClick,
  showCrosshair = true,
}: LineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const lastHoveredRef = useRef<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(500);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure container width for responsive sizing
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

  // Fade-in animation on data change
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

  const handleDotEnter = useCallback((i: number) => { lastHoveredRef.current = i; setHoverIndex(i); }, []);
  const handleDotLeave = useCallback(() => { lastHoveredRef.current = null; setHoverIndex(null); }, []);

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
  const padBottom = 40;
  const width = containerWidth;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = padLeft + (i / (data.length - 1 || 1)) * chartW;
    const y = padTop + chartH - ((d.value - minVal) / range) * chartH;
    return { x, y };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Closed polygon for gradient area fill
  const areaPoints = `${padLeft},${padTop + chartH} ${polylinePoints} ${width - padRight},${padTop + chartH}`;

  const gridLines = showGrid
    ? Array.from({ length: 5 }, (_, i) => {
        const y = padTop + (i / 4) * chartH;
        const val = maxVal - (i / 4) * range;
        return { y, val };
      })
    : [];

  // Compute tooltip position (clamped to SVG bounds)
  const getTooltipPos = (idx: number) => {
    const p = points[idx];
    const tooltipW = 160;
    const tooltipH = 80;
    let tx = p.x - tooltipW / 2;
    let ty = p.y - tooltipH - 14;
    // Clamp horizontally
    if (tx < 4) tx = 4;
    if (tx + tooltipW > width - 4) tx = width - tooltipW - 4;
    // If tooltip goes above SVG, show below the dot
    if (ty < 4) ty = p.y + 14;
    return { x: tx, y: ty };
  };

  // Compute trend between consecutive points
  const getTrend = (idx: number) => {
    if (idx <= 0 || data.length < 2) return null;
    const prev = data[idx - 1].value;
    const curr = data[idx].value;
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height, overflow: "visible" }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Gradient definition for area fill */}
        <defs>
          <linearGradient
            id={`lineAreaGrad-${color.replace("#", "")}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              y1={g.y}
              x2={width - padRight}
              y2={g.y}
              stroke="var(--border-default)"
              strokeWidth={1}
              opacity={0.4}
            />
            <text
              x={padLeft - 8}
              y={g.y + 4}
              textAnchor="end"
              fontSize={12}
              fill="var(--text-secondary)"
              fontFamily="var(--font-mono)"
            >
              {g.val >= 1000
                ? `${(g.val / 1000).toFixed(0)}k`
                : g.val.toFixed(0)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => {
          const x = padLeft + (i / (data.length - 1 || 1)) * chartW;
          return (
            <text
              key={i}
              x={x}
              y={height - 8}
              textAnchor="middle"
              fontSize={12}
              fill="var(--text-secondary)"
              fontFamily="var(--font-mono)"
            >
              {d.label}
            </text>
          );
        })}

        {/* Gradient area fill under the line */}
        <polygon
          key={`area-${animKey}`}
          points={areaPoints}
          fill={`url(#lineAreaGrad-${color.replace("#", "")})`}
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 0.6s ease 0.1s",
          }}
        />

        {/* Crosshair vertical line on hover */}
        {hoverIndex !== null && showCrosshair && (
          <line
            x1={points[hoverIndex].x}
            y1={padTop}
            x2={points[hoverIndex].x}
            y2={padTop + chartH}
            stroke="var(--text-muted)"
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.5}
          />
        )}

        {/* Line with fade-in */}
        <polyline

          key={animKey}
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.5s ease, transform 0.5s ease",
          }}
        />

        {/* Data dots */}
        {showDots &&
          points.map((p, i) => (
            <g key={i}>
              {/* Hover glow ring */}
              {hoverIndex === i && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={14}
                  fill={color}
                  fillOpacity={0.15}
                  style={{ pointerEvents: "none" }}
                />
              )}
              {/* Dot */}
              <circle
                cx={p.x}
                cy={p.y}
                r={hoverIndex === i ? 7 : 4}
                fill={color}
                stroke="var(--bg-secondary)"
                strokeWidth={hoverIndex === i ? 2.5 : 2}
                style={{
                  pointerEvents: "none",
                  transition: "r 0.15s ease",
                }}
              />
            </g>
          ))}

        {/* Hit detection circles - rendered last to receive events */}
        {showDots &&
          points.map((p, i) => (
            <circle
              key={`hit-${i}`}
              cx={p.x}
              cy={p.y}
              r={35}
              fill="transparent"
              stroke="none"
              style={{ cursor: onDotClick ? "pointer" : "default" }}
              onMouseEnter={() => handleDotEnter(i)}
              onMouseLeave={handleDotLeave}
              onClick={() => onDotClick?.(i, data[i])}
            />
          ))}

{/* Tooltip card on hover */}
        {hoverIndex !== null && (() => {
          const tp = getTooltipPos(hoverIndex);
          const trend = getTrend(hoverIndex);
          const item = data[hoverIndex];
          return (
            <foreignObject
              x={tp.x}
              y={tp.y}
              width={160}
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
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
                  {item.label}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>¥</span>
                  <span style={{ fontWeight: 700, fontSize: 16, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                    {item.value.toLocaleString()}
                  </span>
                </div>
                {item.income !== undefined && item.income > 0 && (
                  <div style={{ fontSize: 11, color: "var(--color-success)", marginTop: 2 }}>
                    收入: ¥{item.income.toLocaleString()}
                  </div>
                )}
                {trend !== null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: trend >= 0 ? "var(--color-success)" : "var(--color-danger)",
                        background: trend >= 0 ? "rgba(22, 163, 74, 0.1)" : "rgba(220, 38, 38, 0.1)",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>环比</span>
                  </div>
                )}
              </div>
            </foreignObject>
          );
        })()}
      </svg>
    </div>
  );
}
