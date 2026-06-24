/**
 * Interactive SVG Pie/Donut Chart with hover effects and legend linkage.
 * Replaces conic-gradient approach with SVG path sectors for full interactivity.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";

export interface PieChartItem {
  label: string;
  value: number;
  color: string;
}

export interface PieChartProps {
  data: PieChartItem[];
  centerLabel?: string;
  centerValue?: string;
  size?: number;
  variant?: "pie" | "donut";
}

/**
 * Convert polar coordinates to cartesian for SVG arc paths.
 */
function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/**
 * Generate SVG arc path for a donut sector.
 */
function describeArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const clampedEnd = Math.min(endAngle, startAngle + 359.999);
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, clampedEnd);
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0;

  // Full pie (no inner hole): lines to center
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

export function PieChart({
  data,
  centerLabel,
  centerValue,
  size = 180,
  variant = "donut",
}: PieChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredLegend, setHoveredLegend] = useState<number | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);

  const total = useMemo(
    () => data.reduce((s, d) => s + d.value, 0),
    [data],
  );

  // Trigger re-mount animation when data changes
  useEffect(() => {
    setIsAnimating(true);
    setAnimKey((k) => k + 1);
    const timer = setTimeout(() => setIsAnimating(false), 500);
    return () => clearTimeout(timer);
  }, [data]);

  if (!data.length || total === 0) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          No data available
        </p>
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = variant === "pie" ? 0 : outerR * 0.58;
  const hoverOffset = 6;

  // Compute sector angles (stroke-based separation replaces gap-based approach)
  const sectors = useMemo(() => {
    let cumulative = 0;
    return data.map((item) => {
      const startAngle = (cumulative / total) * 360;
      cumulative += item.value;
      const endAngle = (cumulative / total) * 360;
      const midAngle = (startAngle + endAngle) / 2;
      return { startAngle, endAngle, midAngle };
    });
  }, [data, total]);

  // The active index is whichever is hovered (chart or legend)
  // Compute sector angles for parent-SVG angle-based hover detection
  const sectorAngles = useMemo(() => {
    let cum = 0;
    return data.map((item) => {
      const start = (cum / total) * 360;
      cum += item.value;
      const end = (cum / total) * 360;
      return { start, end };
    });
  }, [data, total]);

  // Determine which sector the mouse angle falls into
  const findSectorByAngle = useCallback(
    (angleDeg: number): number | null => {
      for (let i = 0; i < sectorAngles.length; i++) {
        const { start, end } = sectorAngles[i];
        if (angleDeg >= start && angleDeg < end) return i;
      }
      // Handle floating-point edge at 360°
      if (sectorAngles.length > 0 && angleDeg >= sectorAngles[sectorAngles.length - 1].end - 0.01) {
        return sectorAngles.length - 1;
      }
      return null;
    },
    [sectorAngles],
  );

  const activeIndex = hoveredIndex ?? hoveredLegend;

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
      {/* SVG Donut */}
      <div
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          position: "relative",
        }}
      >
        <svg
          ref={svgRef}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: "visible" }}
          onMouseMove={(e) => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left - cx;
            const y = e.clientY - rect.top - cy;
            // Check if mouse is outside the outer radius
            if (Math.sqrt(x * x + y * y) > outerR + 4) {
              setHoveredIndex(null);
              return;
            }
            // Check if mouse is inside the inner radius (donut hole)
            if (innerR > 0 && Math.sqrt(x * x + y * y) < innerR - 2) {
              setHoveredIndex(null);
              return;
            }
            // Calculate angle from top, clockwise
            let angle = Math.atan2(x, -y) * (180 / Math.PI);
            if (angle < 0) angle += 360;
            setHoveredIndex(findSectorByAngle(angle));
          }}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Sectors — no per-sector events, pure SVG paths */}
          {data.map((item, i) => {
            const { startAngle, endAngle, midAngle } = sectors[i];
            const isActive = activeIndex === i;
            const offsetRad = ((midAngle - 90) * Math.PI) / 180;
            const tx = isActive ? Math.cos(offsetRad) * hoverOffset : 0;
            const ty = isActive ? Math.sin(offsetRad) * hoverOffset : 0;
            const sectorOpacity = isAnimating ? 0 : (activeIndex !== null && !isActive ? 0.5 : 1);
            const animDelay = isAnimating ? i * 40 : 0;

            return (
              <path
                key={`${animKey}-${item.label}`}
                d={describeArc(cx, cy, outerR, innerR, startAngle, endAngle)}
                fill={item.color}
                transform={`translate(${tx}, ${ty})`}
                style={{
                  transition: `opacity 0.4s ease-out ${animDelay}ms, transform 0.2s cubic-bezier(0.25, 1, 0.5, 1), filter 0.2s`,
                  cursor: "pointer",
                  opacity: sectorOpacity,
                  filter: isActive ? "brightness(1.15)" : "none",
                }}
              />
            );
          })}

          {/* Center content — donut only */}
          {variant === "donut" && (
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
              {centerValue && (
                <span
                  className="num-display"
                  style={{
                    fontSize: size > 160 ? 16 : 13,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    lineHeight: 1.2,
                  }}
                >
                  {centerValue}
                </span>
              )}
              {centerLabel && (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginTop: 2,
                  }}
                >
                  {centerLabel}
                </span>
              )}
            </div>
          </foreignObject>
          )}
        </svg>

        {/* Tooltip overlay for hovered sector */}
        {activeIndex !== null && (() => {
          const { midAngle } = sectors[activeIndex];
          const tipR = variant === "pie" ? outerR * 0.7 : (outerR + innerR) / 2;
          const tipPos = polarToCartesian(cx, cy, tipR, midAngle);
          const item = data[activeIndex];
          const pct = ((item.value / total) * 100).toFixed(1);

          // Position tooltip: flip to left if on right side
          const isRight = tipPos.x > cx;
          const tipX = isRight ? tipPos.x + 14 : tipPos.x - 14;
          const tipY = tipPos.y;

          return (
            <div
              style={{
                position: "absolute",
                left: tipX,
                top: tipY,
                transform: isRight
                  ? "translate(0, -50%)"
                  : "translate(-100%, -50%)",
                background: "rgba(30, 30, 30, 0.92)",
                backdropFilter: "blur(8px)",
                color: "#fff",
                padding: "10px 14px",
                borderRadius: 10,
                fontSize: 12,
                whiteSpace: "nowrap",
                boxShadow: "0 8px 24px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.06)",
                zIndex: 10,
                pointerEvents: "none",
                lineHeight: 1.6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{item.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14 }}>
                  ¥{item.value.toLocaleString()}
                </span>
                <span style={{ opacity: 0.5, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {pct}%
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((item, i) => {
          const pct =
            total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
          const isActive = activeIndex === i;

          return (
            <div
              key={item.label}
              onMouseEnter={() => setHoveredLegend(i)}
              onMouseLeave={() => setHoveredLegend(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity:
                  hoveredLegend !== null && !isActive
                    ? 0.4
                    : 1,
                transition: "opacity 0.2s cubic-bezier(0.25, 1, 0.5, 1)",
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
                  boxShadow: isActive
                    ? `0 0 6px ${item.color}80`
                    : "none",
                  transition: "box-shadow 0.2s",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-primary)",
                  minWidth: 48,
                  fontWeight: isActive ? 600 : 400,
                  transition: "font-weight 0.15s",
                }}
              >
                {item.label}
              </span>
              <span
                className="num-display"
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                ¥{item.value.toLocaleString()}
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
