/**
 * Analysis — 百万存款目标追踪页面
 *
 * Sections:
 * 1. Goal progress card (full width)
 * 2. Monthly saving trend (SVG line chart)
 * 3. Income & Expense breakdown (SVG pie charts)
 * 4. Asset growth curve (SVG line chart)
 * 5. Key metrics cards (4 small cards)
 */

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "../i18n";
import {
  fetchAnalysis,
  type AnalysisData,
  type AnalysisMonthlySaving,
  type AnalysisAssetPoint,
} from "../lib/api";

// ── Color Palette ───────────────────────────────────────────────

const COLORS = {
  primary: "#2563eb",
  primaryLight: "#3b82f6",
  success: "#16a34a",
  danger: "#dc2626",
  warning: "#f59e0b",
  teal: "#0891b2",
  purple: "#7c3aed",
  orange: "#ea580c",
  pink: "#d946ef",
};

const PIE_COLORS = [
  "#0891b2", "#ea580c", "#16a34a", "#7c3aed", "#eab308",
  "#dc2626", "#2563eb", "#d946ef", "#0d9488", "#ca8a04",
];

// ── Helpers ─────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  return `¥${n.toLocaleString()}`;
}

function fmtFull(n: number): string {
  return `¥${n.toLocaleString()}`;
}

function goalColor(pct: number): string {
  if (pct >= 80) return COLORS.success;
  if (pct >= 50) return COLORS.primary;
  if (pct >= 20) return COLORS.warning;
  return COLORS.danger;
}

// ── 1. Goal Progress Card ───────────────────────────────────────

function GoalProgressCard({
  goal,
  t,
}: {
  goal: AnalysisData["goal"];
  t: (k: string) => string;
}) {
  const [animWidth, setAnimWidth] = useState(0);
  const pct = Math.min(goal.progress_pct, 100);
  const color = goalColor(goal.progress_pct);

  useEffect(() => {
    const timer = setTimeout(() => setAnimWidth(pct), 100);
    return () => clearTimeout(timer);
  }, [pct]);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 16,
        padding: "28px 32px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            {t("analysis.goalProgress")}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              className="num-display"
              style={{ fontSize: 36, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1 }}
            >
              {fmtFull(goal.current)}
            </span>
            <span style={{ fontSize: 16, color: "var(--text-muted)" }}>/</span>
            <span
              className="num-display"
              style={{ fontSize: 20, fontWeight: 500, color: "var(--text-secondary)" }}
            >
              {fmtFull(goal.target)}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              color,
              lineHeight: 1,
            }}
          >
            {goal.progress_pct.toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            {t("analysis.estimatedDate")}: {goal.estimated_date}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 16,
          borderRadius: 8,
          background: "var(--bg-secondary)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${animWidth}%`,
            borderRadius: 8,
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
            transition: "width 1s cubic-bezier(0.25, 1, 0.5, 1)",
            position: "relative",
          }}
        >
          {/* Shimmer */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
              animation: "shimmer 2s infinite",
            }}
          />
        </div>
      </div>

      {/* Milestone markers */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {[0, 25, 50, 75, 100].map((mark) => (
          <span
            key={mark}
            style={{
              fontSize: 10,
              color: goal.progress_pct >= mark ? color : "var(--text-muted)",
              fontWeight: goal.progress_pct >= mark ? 600 : 400,
            }}
          >
            {mark}%
          </span>
        ))}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 16,
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <StatItem label={t("analysis.monthlyAvgSaving")} value={fmt(goal.monthly_avg_saving)} color={COLORS.teal} />
        <StatItem label={t("analysis.remaining")} value={fmt(goal.remaining)} color={COLORS.warning} />
        <StatItem label={t("analysis.monthlyTarget")} value={fmt(Math.round(goal.remaining / Math.max(goal.months_to_goal, 1)))} color={COLORS.primary} />
        <StatItem label={t("analysis.estimatedDate")} value={goal.estimated_date} color={COLORS.purple} />
      </div>
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span className="num-display" style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

// ── 2. Line Chart (Monthly Saving Trend) ────────────────────────

function LineChart({
  data,
  height = 260,
  yLabel,
  valueKey,
  targetKey,
  lineColor,
  targetColor,
  label,
  targetLabel,
}: {
  data: Record<string, string | number>[];
  height?: number;
  yLabel?: string;
  valueKey: string;
  targetKey?: string;
  lineColor: string;
  targetColor?: string;
  label: string;
  targetLabel?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((e) => {
      for (const en of e) setContainerW(en.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    setVisible(false);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [data]);

  if (!data.length) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No data available</p>
      </div>
    );
  }

  const padL = 56, padR = 16, padT = 20, padB = 32;
  const W = containerW;
  const H = height;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const allVals = data.map((d) => Number(d[valueKey]) || 0);
  if (targetKey) data.forEach((d) => allVals.push(Number(d[targetKey]) || 0));
  const maxV = Math.max(...allVals, 1);
  const minV = Math.min(0, Math.min(...allVals));
  const range = maxV - minV || 1;

  const toX = (i: number) => padL + (i / (data.length - 1 || 1)) * chartW;
  const toY = (v: number) => padT + chartH - ((v - minV) / range) * chartH;

  const mainPts = data.map((d, i) => ({ x: toX(i), y: toY(Number(d[valueKey]) || 0) }));
  const mainLine = mainPts.map((p) => `${p.x},${p.y}`).join(" ");
  const mainArea = `${padL},${padT + chartH} ${mainLine} ${W - padR},${padT + chartH}`;

  let targetLine = "";
  if (targetKey) {
    const tPts = data.map((d, i) => ({ x: toX(i), y: toY(Number(d[targetKey]) || 0) }));
    targetLine = tPts.map((p) => `${p.x},${p.y}`).join(" ");
  }

  // Y-axis ticks
  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minV + (range * i) / yTicks);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginBottom: 8, justifyContent: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 3, borderRadius: 2, background: lineColor }} />
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
        </div>
        {targetKey && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 3, borderRadius: 2, background: targetColor || "#999", borderTop: "2px dashed" }} />
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{targetLabel}</span>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`areaGrad-${valueKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.15} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTickVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)} stroke="var(--border-default)" strokeWidth={1} opacity={0.2} />
            <text x={padL - 8} y={toY(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-secondary)" fontFamily="var(--font-mono)">
              {v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {data.map((d, i) => (
          <text key={i} x={toX(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-secondary)" fontFamily="var(--font-mono)">
            {String(d.month).split("-")[1]}月
          </text>
        ))}

        {/* Target line */}
        {targetKey && targetLine && (
          <polyline
            points={targetLine}
            fill="none"
            stroke={targetColor || "#999"}
            strokeWidth={2}
            strokeDasharray="6 4"
            opacity={visible ? 0.5 : 0}
            style={{ transition: "opacity 0.6s ease 0.2s" }}
          />
        )}

        {/* Area */}
        <polygon
          points={mainArea}
          fill={`url(#areaGrad-${valueKey})`}
          style={{ opacity: visible ? 1 : 0, transition: "opacity 0.6s ease 0.1s" }}
        />

        {/* Main line */}
        <polyline
          points={mainLine}
          fill="none"
          stroke={lineColor}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.5s ease, transform 0.5s ease",
          }}
        />

        {/* Crosshair */}
        {hoverIdx !== null && (
          <line x1={toX(hoverIdx)} y1={padT} x2={toX(hoverIdx)} y2={padT + chartH} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 3" opacity={0.3} />
        )}

        {/* Dots */}
        {mainPts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={20} fill="transparent" style={{ cursor: "default" }} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} />
            {hoverIdx === i && <circle cx={p.x} cy={p.y} r={10} fill={lineColor} fillOpacity={0.1} style={{ pointerEvents: "none" }} />}
            <circle cx={p.x} cy={p.y} r={hoverIdx === i ? 5 : 3} fill={lineColor} stroke="var(--bg-secondary)" strokeWidth={hoverIdx === i ? 2 : 1.5} style={{ pointerEvents: "none", transition: "r 0.2s cubic-bezier(0.25, 1, 0.5, 1)" }} />
          </g>
        ))}

        {/* Tooltip */}
        {hoverIdx !== null && (() => {
          const item = data[hoverIdx];
          const val = Number(item[valueKey]) || 0;
          const tgt = targetKey ? Number(item[targetKey]) || 0 : null;
          const tipW = 130;
          const tipH = tgt !== null ? 64 : 44;
          let tx = toX(hoverIdx) - tipW / 2;
          let ty = mainPts[hoverIdx].y - tipH - 12;
          if (tx < 4) tx = 4;
          if (tx + tipW > W - 4) tx = W - tipW - 4;
          if (ty < 4) ty = mainPts[hoverIdx].y + 12;

          return (
            <foreignObject x={tx} y={ty} width={tipW} height={tipH} style={{ overflow: "visible" }}>
              <div style={{
                background: "var(--bg-surface, #fff)",
                border: "1px solid var(--border-default, #e5e5e5)",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                lineHeight: 1.4,
              }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{item.month}</div>
                <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "var(--font-mono)", color: lineColor }}>
                  {fmt(val)}
                </div>
                {tgt !== null && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    目标: {fmt(tgt)}
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

// ── 3. Pie Chart ────────────────────────────────────────────────

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, outerR: number, innerR: number, start: number, end: number): string {
  const e = Math.min(end, start + 359.999);
  const os = polarToXY(cx, cy, outerR, start);
  const oe = polarToXY(cx, cy, outerR, e);
  const large = e - start > 180 ? 1 : 0;

  if (innerR === 0) {
    return `M ${cx} ${cy} L ${os.x} ${os.y} A ${outerR} ${outerR} 0 ${large} 1 ${oe.x} ${oe.y} Z`;
  }

  const is = polarToXY(cx, cy, innerR, e);
  const ie = polarToXY(cx, cy, innerR, start);
  return `M ${os.x} ${os.y} A ${outerR} ${outerR} 0 ${large} 1 ${oe.x} ${oe.y} L ${is.x} ${is.y} A ${innerR} ${innerR} 0 ${large} 0 ${ie.x} ${ie.y} Z`;
}

function PieChart({
  data,
  total,
  height = 200,
}: {
  data: { category: string; amount: number; percentage: number; color?: string }[];
  total: number;
  height?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredLegend, setHoveredLegend] = useState<number | null>(null);
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    setAnimDone(false);
    const t = setTimeout(() => setAnimDone(true), 500);
    return () => clearTimeout(t);
  }, [data]);

  const size = height;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.55;
  const activeIdx = hoveredIdx ?? hoveredLegend;

  const sectors = data.map((_, i) => {
    let cum = 0;
    for (let j = 0; j < i; j++) cum += data[j].amount;
    const start = (cum / (total || 1)) * 360;
    cum += data[i].amount;
    const end = (cum / (total || 1)) * 360;
    return { start, end, mid: (start + end) / 2 };
  });

  if (!data.length || total === 0) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No data</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {data.map((item, i) => {
            const { start, end, mid } = sectors[i];
            const color = item.color || PIE_COLORS[i % PIE_COLORS.length];
            const isActive = activeIdx === i;
            const offsetRad = ((mid - 90) * Math.PI) / 180;
            const tx = isActive ? Math.cos(offsetRad) * 6 : 0;
            const ty = isActive ? Math.sin(offsetRad) * 6 : 0;

            return (
              <path
                key={item.category}
                d={arcPath(cx, cy, outerR, innerR, start, end)}
                fill={color}
                transform={`translate(${tx}, ${ty})`}
                style={{
                  transition: "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                  cursor: "pointer",
                  opacity: !animDone ? 0 : activeIdx !== null && !isActive ? 0.4 : 1,
                }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
          <foreignObject x={cx - innerR * 0.7} y={cy - innerR * 0.5} width={innerR * 1.4} height={innerR} style={{ pointerEvents: "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <span className="num-display" style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
                {fmt(total)}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Total</span>
            </div>
          </foreignObject>
        </svg>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 140 }}>
        {data.slice(0, 5).map((item, i) => {
          const color = item.color || PIE_COLORS[i % PIE_COLORS.length];
          const isActive = activeIdx === i;
          return (
            <div
              key={item.category}
              onMouseEnter={() => setHoveredLegend(i)}
              onMouseLeave={() => setHoveredLegend(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: activeIdx !== null && !isActive ? 0.4 : 1,
                transition: "opacity 0.2s",
                cursor: "pointer",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: isActive ? 600 : 400, flex: 1 }}>
                {item.category}
              </span>
              <span className="num-display" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {fmt(item.amount)}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", minWidth: 40, textAlign: "right" }}>
                {item.percentage.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 4. Key Metric Card ─────────────────────────────────────────

function MetricCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 14,
        padding: "20px 22px",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500 }}>
          {label}
        </span>
      </div>
      <div className="num-display" style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────

export default function Analysis() {
  const { t } = useTranslation();
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchAnalysis()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>{t("analysis.loading")}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>{t("analysis.noData")}</p>
      </div>
    );
  }

  const incomeTotal = data.income_breakdown.reduce((s, i) => s + i.amount, 0);
  const expenseTotal = data.expense_breakdown.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>

      {/* Page title */}
      <div>
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          {t("analysis.title")}
        </h2>
      </div>

      {/* 1. Goal Progress */}
      <GoalProgressCard goal={data.goal} t={t} />

      {/* 2. Monthly Saving Trend */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 16, padding: "24px 28px", boxShadow: "var(--shadow-sm)" }}>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          {t("analysis.savingTrend")}
        </h4>
        <LineChart
          data={data.monthly_saving_trend as unknown as Record<string, string | number>[]}
          height={260}
          valueKey="saving"
          targetKey="target"
          lineColor={COLORS.teal}
          targetColor={COLORS.warning}
          label={t("analysis.actualSaving")}
          targetLabel={t("analysis.monthlyTarget")}
        />
      </div>

      {/* 3. Income & Expense Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20 }}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 16, padding: "24px 28px", boxShadow: "var(--shadow-sm)" }}>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            {t("analysis.incomeBreakdown")}
          </h4>
          <PieChart data={data.income_breakdown.map((d, i) => ({ ...d, color: COLORS.success }))} total={incomeTotal} />
        </div>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 16, padding: "24px 28px", boxShadow: "var(--shadow-sm)" }}>
          <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            {t("analysis.expenseBreakdown")}
          </h4>
          <PieChart data={data.expense_breakdown} total={expenseTotal} />
        </div>
      </div>

      {/* 4. Asset Growth */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: 16, padding: "24px 28px", boxShadow: "var(--shadow-sm)" }}>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          {t("analysis.assetGrowth")}
        </h4>
        <LineChart
          data={data.asset_growth as unknown as Record<string, string | number>[]}
          height={260}
          valueKey="asset"
          targetKey="target"
          lineColor={COLORS.primary}
          targetColor={COLORS.success}
          label={t("analysis.currentAssets")}
          targetLabel={t("analysis.targetAmount")}
        />
      </div>

      {/* 5. Key Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <MetricCard label={t("analysis.monthlyAvgSaving")} value={fmt(data.key_metrics.monthly_avg_saving)} color={COLORS.teal} icon="💰" />
        <MetricCard label={t("analysis.savingsRate")} value={`${data.key_metrics.savings_rate}%`} color={COLORS.success} icon="📊" />
        <MetricCard label={t("analysis.currentExpense")} value={fmt(data.key_metrics.current_month_expense)} color={COLORS.danger} icon="📉" />
        <MetricCard label={t("analysis.remaining")} value={fmt(data.key_metrics.remaining)} color={COLORS.warning} icon="🎯" />
      </div>
    </div>
  );
}
