/**
 * Pure SVG Line Chart component with interactive features.
 * Hover uses ref-only approach (no React state) to prevent SVG re-render flicker.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

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
  const [containerWidth, setContainerWidth] = useState(500);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // ── Refs for hover (NO state updates during hover) ──
  const crosshairRef = useRef<SVGLineElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverIdx = useRef<number | null>(null);
  const dotsGroupRef = useRef<SVGGElement>(null);

  // ── Compute layout (stable, no side effects) ──
  const padLeft = 48;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 40;
  const width = containerWidth;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const values = data.map((d) => d.value);
  const maxVal = useMemo(() => Math.max(...values, 1), [values]);
  const minVal = useMemo(() => Math.min(...values, 0), [values]);
  const range = maxVal - minVal || 1;

  const points = useMemo(
    () =>
      data.map((d, i) => {
        const x = padLeft + (i / (data.length - 1 || 1)) * chartW;
        const y = padTop + chartH - ((d.value - minVal) / range) * chartH;
        return { x, y };
      }),
    [data, chartW, chartH, padLeft, minVal, range]
  );

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = `${padLeft},${padTop + chartH} ${polylinePoints} ${width - padRight},${padTop + chartH}`;

  const gridLines = showGrid
    ? Array.from({ length: 5 }, (_, i) => {
        const y = padTop + (i / 4) * chartH;
        const val = maxVal - (i / 4) * range;
        return { y, val };
      })
    : [];

  // ── Hover handlers (now points/width are in scope) ──
  const updateDotVisuals = (idx: number | null) => {
    if (!dotsGroupRef.current) return;
    const gs = dotsGroupRef.current.children;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i] as SVGGElement;
      const circles = g.querySelectorAll("circle");
      circles.forEach((c) => {
        const circle = c as SVGCircleElement;
        const isGlow = circle.getAttribute("data-role") === "glow";
        if (isGlow) {
          circle.style.opacity = i === idx ? "1" : "0";
        } else {
          circle.setAttribute("r", i === idx ? "7" : "4");
          circle.setAttribute("stroke-width", i === idx ? "2.5" : "2");
        }
      });
    }
  };

  const showTooltipFor = (idx: number) => {
    if (!tooltipRef.current || !points[idx] || !data[idx]) return;
    const d = data[idx];
    const p = points[idx];
    const tooltipW = 160;
    let tx = p.x - tooltipW / 2;
    let ty = p.y - 90;
    if (tx < 4) tx = 4;
    if (tx + tooltipW > width - 4) tx = width - tooltipW - 4;
    if (ty < 4) ty = p.y + 14;

    const trend =
      idx > 0 && data[idx - 1].value !== 0
        ? ((d.value - data[idx - 1].value) / data[idx - 1].value) * 100
        : null;

    // Escape HTML entities to prevent XSS from label strings
    const safeLabel = d.label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    tooltipRef.current.style.left = `${tx}px`;
    tooltipRef.current.style.top = `${ty}px`;
    tooltipRef.current.style.opacity = "1";
    tooltipRef.current.innerHTML = `
      <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">${safeLabel}</div>
      <div style="display:flex;align-items:baseline;gap:4px">
        <span style="font-size:10px;color:var(--text-tertiary)">¥</span>
        <span style="font-weight:700;font-size:16px;font-family:var(--font-mono);color:var(--text-primary)">${d.value.toLocaleString()}</span>
      </div>
      ${d.income != null && d.income > 0 ? `<div style="font-size:11px;color:var(--color-success);margin-top:2px">收入: ¥${d.income.toLocaleString()}</div>` : ""}
      ${trend !== null ? `<div style="display:flex;align-items:center;gap:4px;margin-top:4px">
        <span style="font-size:11px;font-weight:600;color:${trend >= 0 ? "var(--color-success)" : "var(--color-danger)"};background:${trend >= 0 ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)"};padding:2px 6px;border-radius:4px">${trend >= 0 ? "↑" : "↓"} ${Math.abs(trend).toFixed(1)}%</span>
        <span style="font-size:10px;color:var(--text-tertiary)">环比</span>
      </div>` : ""}
    `;
  };

  const hideTooltip = () => {
    if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
  };

  const showCrosshairFor = (idx: number | null) => {
    if (!crosshairRef.current) return;
    if (idx !== null && showCrosshair && points[idx]) {
      const p = points[idx];
      crosshairRef.current.setAttribute("x1", String(p.x));
      crosshairRef.current.setAttribute("x2", String(p.x));
      crosshairRef.current.style.opacity = "0.5";
    } else {
      crosshairRef.current.style.opacity = "0";
    }
  };

  const handleEnter = useCallback(
    (i: number) => {
      hoverIdx.current = i;
      updateDotVisuals(i);
      showTooltipFor(i);
      showCrosshairFor(i);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, points, width]
  );

  const handleLeave = useCallback(() => {
    hoverIdx.current = null;
    updateDotVisuals(null);
    hideTooltip();
    showCrosshairFor(null);
  }, []);

  if (!data.length) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          No data available
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height, overflow: "visible" }}
        preserveAspectRatio="xMidYMid meet"
      >
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

        <polygon
          key={`area-${animKey}`}
          points={areaPoints}
          fill={`url(#lineAreaGrad-${color.replace("#", "")})`}
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 0.6s ease 0.1s",
          }}
        />

        {/* Crosshair - hidden by default */}
        <line
          ref={crosshairRef}
          x1={0}
          y1={padTop}
          x2={0}
          y2={padTop + chartH}
          stroke="var(--text-muted)"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0}
          style={{ transition: "opacity 0.15s ease" }}
        />

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

        {/* Dots - visual only, no pointer events */}
        {showDots && (
          <g ref={dotsGroupRef}>
            {points.map((p, i) => (
              <g key={i}>
                <circle
                  data-role="glow"
                  cx={p.x}
                  cy={p.y}
                  r={14}
                  fill={color}
                  fillOpacity={0.15}
                  style={{
                    pointerEvents: "none",
                    opacity: 0,
                    transition: "opacity 0.15s ease",
                  }}
                />
                <circle
                  data-role="dot"
                  cx={p.x}
                  cy={p.y}
                  r={4}
                  fill={color}
                  stroke="var(--bg-secondary)"
                  strokeWidth={2}
                  style={{
                    pointerEvents: "none",
                    transition: "r 0.15s ease, stroke-width 0.15s ease",
                  }}
                />
              </g>
            ))}
          </g>
        )}

        {/* Overlay - single rect, NO React state updates during hover */}
        <rect
          x={padLeft}
          y={0}
          width={chartW}
          height={height}
          fill="transparent"
          style={{ cursor: onDotClick ? "pointer" : "default" }}
          onMouseMove={(e) => {
            const svg = e.currentTarget.ownerSVGElement;
            if (!svg) return;
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) return;
            const svgP = pt.matrixTransform(ctm.inverse());
            let minDist = Infinity;
            let nearest = -1;
            points.forEach((p, i) => {
              const dx = p.x - svgP.x;
              const dy = p.y - svgP.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 35 && dist < minDist) {
                minDist = dist;
                nearest = i;
              }
            });
            if (nearest !== hoverIdx.current) {
              if (nearest >= 0) handleEnter(nearest);
              else handleLeave();
            }
          }}
          onMouseLeave={handleLeave}
          onClick={(e) => {
            if (!onDotClick) return;
            const svg = e.currentTarget.ownerSVGElement;
            if (!svg) return;
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) return;
            const svgP = pt.matrixTransform(ctm.inverse());
            let minDist = Infinity;
            let nearest = -1;
            points.forEach((p, i) => {
              const dx = p.x - svgP.x;
              const dy = p.y - svgP.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 35 && dist < minDist) {
                minDist = dist;
                nearest = i;
              }
            });
            if (nearest >= 0) onDotClick(nearest, data[nearest]);
          }}
        />
      </svg>

      {/* Tooltip - HTML div outside SVG */}
      <div
        ref={tooltipRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          background: "var(--bg-surface, #fff)",
          border: "1px solid var(--border-default, #e5e5e5)",
          padding: "10px 12px",
          borderRadius: 10,
          fontSize: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          lineHeight: 1.5,
          pointerEvents: "none",
          opacity: 0,
          transition: "opacity 0.15s ease",
          zIndex: 50,
          width: 160,
        }}
      />
    </div>
  );
}
