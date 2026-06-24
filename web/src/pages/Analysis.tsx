/**
 * Analysis — FIRE (Financial Independence, Retire Early) Dashboard
 *
 * Modules:
 * 1. FIRE Core Dashboard — ring progress + key data + mini metrics
 * 2. Asset Growth & FIRE Path — dual-line chart with 3 scenario lines
 * 3. Income & Expense Breakdown — overview card + donut chart
 * 4. Investment Portfolio — asset allocation pie + holdings cards
 * 5. Monthly Saving Trend — bar chart with target line
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "../i18n";
import {
  fetchAnalysis,
  type AnalysisData,
} from "../lib/api";

// ── Theme Constants (CSS variable based) ──────────────────────

const PIE_COLORS = [
  "var(--color-primary)", "var(--color-danger)", "var(--color-success)",
  "var(--color-accent)", "#7c3aed",
  "#d946ef", "#0891b2", "#ea580c", "#16a34a", "#ca8a04",
];

const RAW_PIE_COLORS = [
  "#0891b2", "#dc2626", "#16a34a", "#d97706", "#7c3aed",
  "#d946ef", "#0891b2", "#ea580c", "#16a34a", "#ca8a04",
];

// ── Helpers ─────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  return `¥${n.toLocaleString()}`;
}

function fmtFull(n: number): string {
  return `¥${n.toLocaleString()}`;
}

// ── CountUp Hook ────────────────────────────────────────────────

function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return value;
}

// ── SVG Gradient Defs ───────────────────────────────────────────

function GradientDefs() {
  return (
    <defs>
      <linearGradient id="grad-blue-green" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="var(--color-primary)" />
        <stop offset="100%" stopColor="var(--color-success)" />
      </linearGradient>
      <linearGradient id="grad-blue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="grad-bar-pos" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.6} />
        <stop offset="100%" stopColor="var(--color-success)" />
      </linearGradient>
      <linearGradient id="grad-bar-neg" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="var(--color-danger)" stopOpacity={0.6} />
        <stop offset="100%" stopColor="var(--color-danger)" />
      </linearGradient>
    </defs>
  );
}

// ── Card Wrapper ────────────────────────────────────────────────

function Card({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={`elevated-card ${className || ""}`}
      style={{
        padding: "24px 28px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Module 1: FIRE Core Dashboard ───────────────────────────────

function FireCoreDashboard({
  fire,
  netWorth,
  t,
}: {
  fire: AnalysisData["fire"];
  netWorth?: AnalysisData["net_worth"];
  t: (k: string) => string;
}) {
  const animatedAssets = useCountUp(fire.current_assets, 1500);
  const animatedProgress = useCountUp(fire.progress_pct, 1500);

  // Ring chart params
  const ringSize = 220;
  const strokeWidth = 14;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(fire.progress_pct, 100);
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <Card style={{ padding: "32px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 40,
          alignItems: "center",
        }}
      >
        {/* Left: Ring Chart */}
        <div style={{ position: "relative", width: ringSize, height: ringSize }}>
          <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
            <GradientDefs />
            {/* Background ring */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth={strokeWidth}
            />
            {/* Tick marks */}
            {[0, 25, 50, 75, 100].map((tick) => {
              const angle = (tick / 100) * 360 - 90;
              const rad = (angle * Math.PI) / 180;
              const inner = radius - strokeWidth / 2 - 4;
              const outer = radius + strokeWidth / 2 + 4;
              return (
                <line
                  key={tick}
                  x1={ringSize / 2 + inner * Math.cos(rad)}
                  y1={ringSize / 2 + inner * Math.sin(rad)}
                  x2={ringSize / 2 + outer * Math.cos(rad)}
                  y2={ringSize / 2 + outer * Math.sin(rad)}
                  stroke={progress >= tick ? "var(--color-primary)" : "var(--border-subtle)"}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })}
            {/* Progress arc */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="url(#grad-blue-green)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
              style={{
                transition: "stroke-dashoffset 1.5s cubic-bezier(0.25, 1, 0.5, 1)",
              }}
            />
          </svg>
          {/* Center text */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: "var(--text-tertiary)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              FIRE Progress
            </span>
            <span
              style={{
                fontSize: 36,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                color: "var(--color-primary)",
                lineHeight: 1.1,
              }}
            >
              {animatedProgress.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Right: Key Data Panel */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px" }}>
            <DataBlock
              label={t("analysis.fireNumber")}
              value={fmtFull(fire.fire_number)}
              color="var(--color-primary)"
              large
            />
            <DataBlock
              label={t("analysis.currentAssets")}
              value={fmtFull(Math.round(animatedAssets))}
              color="var(--color-success)"
              large
            />
            <DataBlock
              label={t("analysis.remaining")}
              value={fmtFull(fire.remaining)}
              color="var(--color-warning)"
            />
            <DataBlock
              label={t("analysis.estimatedDate")}
              value={fire.estimated_date}
              color="#7c3aed"
            />
          </div>

          {/* Net Worth row (from assets/liabilities tables) */}
          {netWorth && netWorth.total_assets > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
                marginTop: 16,
                padding: "12px 16px",
                background: "var(--bg-page)",
                borderRadius: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("assets.totalAssets")}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-success)" }}>
                  {fmtFull(netWorth.total_assets)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("assets.totalLiabilities")}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-danger)" }}>
                  {fmtFull(netWorth.total_liabilities)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {t("analysis.netWorth")}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>
                  {fmtFull(netWorth.net_worth)}
                </div>
              </div>
            </div>
          )}

          {/* Bottom: Mini Metrics */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
              marginTop: 24,
              paddingTop: 20,
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            <MiniMetric
              label={t("analysis.savingsRate")}
              value={`${fire.savings_rate}%`}
              target="目标 ≥50%"
              color={fire.savings_rate >= 50 ? "var(--color-success)" : "var(--color-warning)"}
              progress={Math.min(fire.savings_rate / 50 * 100, 100)}
            />
            <MiniMetric
              label={t("analysis.savingsPerExpense")}
              value={fire.savings_per_expense.toFixed(2)}
              target="目标 ≥1"
              color={fire.savings_per_expense >= 1 ? "var(--color-success)" : "var(--color-warning)"}
              progress={Math.min(fire.savings_per_expense * 100, 100)}
            />
            <MiniMetric
              label={t("analysis.emergencyFund")}
              value={`${fire.emergency_fund_months}月`}
              target="目标 6-12月"
              color={
                fire.emergency_fund_months >= 6 && fire.emergency_fund_months <= 12
                  ? "var(--color-success)"
                  : fire.emergency_fund_months >= 3
                  ? "var(--color-warning)"
                  : "var(--color-danger)"
              }
              progress={Math.min((fire.emergency_fund_months / 12) * 100, 100)}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function DataBlock({
  label,
  value,
  color,
  large,
}: {
  label: string;
  value: string;
  color: string;
  large?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: large ? 22 : 17,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          color,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  target,
  color,
  progress,
}: {
  label: string;
  value: string;
  target: string;
  color: string;
  progress: number;
}) {
  const [animWidth, setAnimWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimWidth(progress), 100);
    return () => clearTimeout(t);
  }, [progress]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{label}</span>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{target}</span>
      </div>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          color,
        }}
      >
        {value}
      </span>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: "var(--border-subtle)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${animWidth}%`,
            borderRadius: 2,
            background: color,
            transition: "width 1s cubic-bezier(0.25, 1, 0.5, 1)",
          }}
        />
      </div>
    </div>
  );
}

// ── Module 2: Asset Growth & FIRE Path ──────────────────────────

function AssetGrowthChart({
  data,
  t,
}: {
  data: AnalysisData["asset_growth"];
  t: (k: string) => string;
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
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No data available</p>
      </div>
    );
  }

  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 36;
  const W = containerW;
  const H = 280;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const allVals: number[] = [];
  data.forEach((d) => {
    allVals.push(d.actual, d.target_optimistic, d.target_baseline, d.target_conservative);
  });
  const maxV = Math.max(...allVals, 1);
  const minV = Math.min(0, Math.min(...allVals));
  const range = maxV - minV || 1;

  const toX = (i: number) => padL + (i / (data.length - 1 || 1)) * chartW;
  const toY = (v: number) => padT + chartH - ((v - minV) / range) * chartH;

  const actualPts = data.map((d, i) => ({ x: toX(i), y: toY(d.actual) }));
  const actualLine = actualPts.map((p) => `${p.x},${p.y}`).join(" ");
  const actualArea = `${padL},${padT + chartH} ${actualLine} ${W - padR},${padT + chartH}`;

  const optLine = data.map((d, i) => `${toX(i)},${toY(d.target_optimistic)}`).join(" ");
  const baseLine = data.map((d, i) => `${toX(i)},${toY(d.target_baseline)}`).join(" ");
  const consLine = data.map((d, i) => `${toX(i)},${toY(d.target_conservative)}`).join(" ");

  // Y-axis ticks
  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minV + (range * i) / yTicks);

  return (
    <Card>
      <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
        {t("analysis.assetGrowth")}
      </h4>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap" }}>
        <LegendItem color="var(--color-primary)" label={t("analysis.actualAssets")} />
        <LegendItem color="var(--color-success)" label={t("analysis.optimistic")} dashed />
        <LegendItem color="var(--color-primary)" label={t("analysis.baseline")} dashed />
        <LegendItem color="var(--color-danger)" label={t("analysis.conservative")} dashed />
      </div>

      <div ref={containerRef} style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="xMidYMid meet">
          <GradientDefs />

          {/* Grid lines */}
          {yTickVals.map((v, i) => (
            <g key={i}>
              <line
                x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)}
                stroke="var(--border-subtle)" strokeWidth={1}
              />
              <text
                x={padL - 8} y={toY(v) + 4} textAnchor="end"
                fontSize={11} fill="var(--text-secondary)"
                fontFamily="var(--font-mono)"
              >
                {v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
              </text>
            </g>
          ))}

          {/* X labels */}
          {data.map(
            (d, i) =>
              i % 3 === 0 && (
                <text
                  key={i} x={toX(i)} y={H - 8} textAnchor="middle"
                  fontSize={11} fill="var(--text-secondary)" fontFamily="var(--font-mono)"
                >
                  {d.month.split("-")[1]}月
                </text>
              )
          )}

          {/* Scenario lines (dashed) */}
          <polyline points={optLine} fill="none" stroke="var(--color-success)" strokeWidth={1.5} strokeDasharray="6 4" opacity={visible ? 0.5 : 0} style={{ transition: "opacity 0.6s ease 0.3s" }} />
          <polyline points={baseLine} fill="none" stroke="var(--color-primary)" strokeWidth={1.5} strokeDasharray="6 4" opacity={visible ? 0.4 : 0} style={{ transition: "opacity 0.6s ease 0.2s" }} />
          <polyline points={consLine} fill="none" stroke="var(--color-danger)" strokeWidth={1.5} strokeDasharray="6 4" opacity={visible ? 0.4 : 0} style={{ transition: "opacity 0.6s ease 0.3s" }} />

          {/* Area fill */}
          <polygon points={actualArea} fill="url(#grad-blue)" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.6s ease 0.1s" }} />

          {/* Main line */}
          <polyline
            points={actualLine} fill="none" stroke="var(--color-primary)"
            strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 0.5s ease" }}
          />

          {/* Hover crosshair */}
          {hoverIdx !== null && (
            <line
              x1={toX(hoverIdx)} y1={padT} x2={toX(hoverIdx)} y2={padT + chartH}
              stroke="var(--border-default)" strokeWidth={1} strokeDasharray="4 3"
            />
          )}

          {/* Dots */}
          {actualPts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={20} fill="transparent" style={{ cursor: "default" }} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} />
              <circle cx={p.x} cy={p.y} r={hoverIdx === i ? 6 : 3} fill="var(--color-primary)" stroke="var(--bg-surface)" strokeWidth={2} style={{ pointerEvents: "none", transition: "r 0.2s" }} />
            </g>
          ))}

          {/* Tooltip */}
          {hoverIdx !== null && (() => {
            const item = data[hoverIdx];
            const tipW = 150;
            const tipH = 80;
            let tx = toX(hoverIdx) - tipW / 2;
            let ty = actualPts[hoverIdx].y - tipH - 12;
            if (tx < 4) tx = 4;
            if (tx + tipW > W - 4) tx = W - tipW - 4;
            if (ty < 4) ty = actualPts[hoverIdx].y + 12;

            return (
              <foreignObject x={tx} y={ty} width={tipW} height={tipH} style={{ overflow: "visible" }}>
                <div style={{
                  background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                  padding: "10px 14px", borderRadius: 10, fontSize: 12,
                  boxShadow: "var(--shadow-lg)", lineHeight: 1.5,
                }}>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4 }}>{item.month}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>
                    {fmt(item.actual)}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
                    乐观: {fmt(item.target_optimistic)}
                  </div>
                </div>
              </foreignObject>
            );
          })()}
        </svg>
      </div>
    </Card>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <svg width={14} height={3}>
        <line x1={0} y1={1.5} x2={14} y2={1.5} stroke={color} strokeWidth={2} strokeDasharray={dashed ? "4 3" : "none"} />
      </svg>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
    </div>
  );
}

// ── Module 3: Income & Expense Breakdown ────────────────────────

function IncomeExpenseBreakdown({
  currentMonth,
  expenseBreakdown,
  incomeBreakdown,
  t,
}: {
  currentMonth: AnalysisData["current_month"];
  expenseBreakdown: AnalysisData["expense_breakdown"];
  incomeBreakdown: AnalysisData["income_breakdown"];
  t: (k: string) => string;
}) {
  const expenseTotal = expenseBreakdown.reduce((s, i) => s + i.amount, 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {/* Left: Current Month Overview */}
      <Card>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          {t("analysis.currentMonthOverview")}
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <OverviewRow label={t("analysis.income")} value={currentMonth.income} color="var(--color-success)" icon="↑" />
          <OverviewRow label={t("analysis.expense")} value={currentMonth.expense} color="var(--color-danger)" icon="↓" />
          <div style={{ height: 1, background: "var(--border-subtle)" }} />
          <OverviewRow label={t("analysis.netSaving")} value={currentMonth.net_saving} color="var(--color-primary)" icon="→" />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {t("analysis.savingsRate")}
            </span>
            <span style={{
              fontSize: 20, fontWeight: 700, fontFamily: "var(--font-mono)",
              color: currentMonth.savings_rate >= 50 ? "var(--color-success)" : "var(--color-warning)",
            }}>
              {currentMonth.savings_rate}%
            </span>
          </div>
        </div>
      </Card>

      {/* Right: Expense Donut Chart */}
      <Card>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          {t("analysis.expenseBreakdown")}
        </h4>
        <DonutChart data={expenseBreakdown} total={expenseTotal} />
      </Card>
    </div>
  );
}

function OverviewRow({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  const animated = useCountUp(value, 1200);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 8, background: "var(--bg-page)",
          color, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700,
        }}>
          {icon}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
      </div>
      <span style={{ fontSize: 17, fontWeight: 700, fontFamily: "var(--font-mono)", color }}>
        {fmt(Math.round(animated))}
      </span>
    </div>
  );
}

// ── Donut Chart (SVG) ───────────────────────────────────────────

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

function DonutChart({
  data,
  total,
  size = 180,
}: {
  data: { category: string; amount: number; percentage: number; color: string }[];
  total: number;
  size?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredLegend, setHoveredLegend] = useState<number | null>(null);
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    setAnimDone(false);
    const t = setTimeout(() => setAnimDone(true), 500);
    return () => clearTimeout(t);
  }, [data]);

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
      <div style={{ height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No data</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {data.map((item, i) => {
            const { start, end, mid } = sectors[i];
            const color = RAW_PIE_COLORS[i % RAW_PIE_COLORS.length];
            const isActive = activeIdx === i;
            const offsetRad = ((mid - 90) * Math.PI) / 180;
            const tx = isActive ? Math.cos(offsetRad) * 5 : 0;
            const ty = isActive ? Math.sin(offsetRad) * 5 : 0;

            return (
              <path
                key={item.category}
                d={arcPath(cx, cy, outerR, innerR, start, end)}
                fill={color}
                transform={`translate(${tx}, ${ty})`}
                style={{
                  transition: "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                  cursor: "pointer",
                  opacity: !animDone ? 0 : activeIdx !== null && !isActive ? 0.3 : 1,
                }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
          <foreignObject x={cx - innerR * 0.7} y={cy - innerR * 0.5} width={innerR * 1.4} height={innerR} style={{ pointerEvents: "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)", lineHeight: 1.2 }}>
                {fmt(total)}
              </span>
              <span style={{ fontSize: 9, color: "var(--text-tertiary)", marginTop: 2 }}>Total</span>
            </div>
          </foreignObject>
        </svg>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 120 }}>
        {data.slice(0, 6).map((item, i) => {
          const color = RAW_PIE_COLORS[i % RAW_PIE_COLORS.length];
          const isActive = activeIdx === i;
          return (
            <div
              key={item.category}
              onMouseEnter={() => setHoveredLegend(i)}
              onMouseLeave={() => setHoveredLegend(null)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                opacity: activeIdx !== null && !isActive ? 0.3 : 1,
                transition: "opacity 0.2s", cursor: "pointer",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: isActive ? 600 : 400, flex: 1 }}>
                {item.category}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                {fmt(item.amount)}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", minWidth: 40, textAlign: "right" }}>
                {item.percentage.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Module 4: Investment Portfolio ───────────────────────────────

function InvestmentPortfolio({ portfolio, t }: { portfolio: AnalysisData["investment_portfolio"]; t: (k: string) => string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {/* Left: Allocation Pie */}
      <Card>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
          {t("analysis.assetAllocation")}
        </h4>
        <AllocationChart data={portfolio.allocation} />
      </Card>

      {/* Right: Holdings Cards */}
      <Card>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 20 }}>
          {t("analysis.holdingsOverview")}
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <HoldingCard label="A股" value={portfolio.a_shares.value} pnl={portfolio.a_shares.pnl} pnlPct={portfolio.a_shares.pnl_pct} color="#dc2626" />
          <HoldingCard label="美股" value={portfolio.us_stocks.value} pnl={portfolio.us_stocks.pnl} pnlPct={portfolio.us_stocks.pnl_pct} color="#0891b2" />
          <HoldingCard label="现金/存款" value={portfolio.cash} color="#d97706" />
          <div style={{ height: 1, background: "var(--border-subtle)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("analysis.totalReturn")}</span>
            <span style={{
              fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)",
              color: portfolio.total_return_pct >= 0 ? "var(--color-success)" : "var(--color-danger)",
            }}>
              {portfolio.total_return_pct >= 0 ? "+" : ""}{portfolio.total_return_pct}%
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AllocationChart({ data }: { data: { type: string; percentage: number; color: string }[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.55;

  const ALLOC_COLORS = ["#dc2626", "#0891b2", "#d97706"];

  const sectors = data.map((_, i) => {
    let cum = 0;
    for (let j = 0; j < i; j++) cum += data[j].percentage;
    const start = (cum / 100) * 360;
    cum += data[i].percentage;
    const end = (cum / 100) * 360;
    return { start, end, mid: (start + end) / 2 };
  });

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {data.map((item, i) => {
            const { start, end, mid } = sectors[i];
            const color = ALLOC_COLORS[i % ALLOC_COLORS.length];
            const isActive = hoveredIdx === i;
            const offsetRad = ((mid - 90) * Math.PI) / 180;
            const tx = isActive ? Math.cos(offsetRad) * 4 : 0;
            const ty = isActive ? Math.sin(offsetRad) * 4 : 0;

            return (
              <path
                key={item.type}
                d={arcPath(cx, cy, outerR, innerR, start, end)}
                fill={color}
                transform={`translate(${tx}, ${ty})`}
                style={{
                  transition: "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
                  cursor: "pointer",
                  opacity: hoveredIdx !== null && !isActive ? 0.3 : 1,
                }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
        </svg>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((item, i) => (
          <div
            key={item.type}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.3 : 1,
              transition: "opacity 0.2s", cursor: "pointer",
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div style={{ width: 8, height: 8, borderRadius: 2, background: ALLOC_COLORS[i % ALLOC_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1 }}>{item.type}</span>
            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
              {item.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldingCard({ label, value, pnl, pnlPct, color }: { label: string; value: number; pnl?: number; pnlPct?: number; color: string }) {
  const animated = useCountUp(value, 1200);
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 14px", borderRadius: 10, background: "var(--bg-page)", border: "1px solid var(--border-subtle)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: "var(--bg-surface)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 14, color, fontWeight: 700 }}>{label[0]}</span>
        </div>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{label}</div>
          {pnl !== undefined && (
            <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: pnl >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
              {pnl >= 0 ? "+" : ""}{fmt(pnl)} ({pnlPct}%)
            </div>
          )}
        </div>
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
        {fmt(Math.round(animated))}
      </span>
    </div>
  );
}

// ── Module 5: Monthly Saving Trend (Bar Chart) ──────────────────

function MonthlySavingChart({ data, t }: { data: AnalysisData["monthly_saving_trend"]; t: (k: string) => string }) {
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
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No data available</p>
      </div>
    );
  }

  const padL = 56;
  const padR = 20;
  const padT = 20;
  const padB = 36;
  const W = containerW;
  const H = 240;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const maxSaving = Math.max(...data.map((d) => Math.max(d.saving, d.target)), 1);
  const minSaving = Math.min(0, ...data.map((d) => d.saving));
  const range = maxSaving - minSaving || 1;

  const toY = (v: number) => padT + chartH - ((v - minSaving) / range) * chartH;
  const barWidth = Math.min(chartW / data.length * 0.6, 28);
  const barGap = chartW / data.length;

  // Target line
  const targetVal = data[0]?.target || 0;
  const targetY = toY(targetVal);

  // Y-axis ticks
  const yTicks = 4;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => minSaving + (range * i) / yTicks);

  return (
    <Card>
      <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
        {t("analysis.monthlySavingTrend")}
      </h4>

      <div ref={containerRef} style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="xMidYMid meet">
          <GradientDefs />

          {/* Grid lines */}
          {yTickVals.map((v, i) => (
            <g key={i}>
              <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)} stroke="var(--border-subtle)" strokeWidth={1} />
              <text x={padL - 8} y={toY(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-secondary)" fontFamily="var(--font-mono)">
                {v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Target line */}
          <line x1={padL} y1={targetY} x2={W - padR} y2={targetY} stroke="var(--color-warning)" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.6} />
          <text x={W - padR + 4} y={targetY + 4} fontSize={10} fill="var(--color-warning)" fontFamily="var(--font-mono)">
            目标
          </text>

          {/* Bars */}
          {data.map((d, i) => {
            const x = padL + i * barGap + (barGap - barWidth) / 2;
            const barH = Math.abs(toY(0) - toY(d.saving));
            const barY = d.saving >= 0 ? toY(d.saving) : toY(0);
            const isAbove = d.saving >= targetVal;
            const isActive = hoverIdx === i;

            return (
              <g key={i}>
                <rect
                  x={x} y={visible ? barY : toY(0)} width={barWidth} height={visible ? barH : 0} rx={3}
                  fill={isAbove ? "url(#grad-bar-pos)" : "url(#grad-bar-neg)"}
                  style={{
                    transition: "y 0.8s cubic-bezier(0.25, 1, 0.5, 1), height 0.8s cubic-bezier(0.25, 1, 0.5, 1)",
                    transitionDelay: `${i * 30}ms`, cursor: "pointer",
                    opacity: hoverIdx !== null && !isActive ? 0.4 : 1,
                  }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
                <text x={x + barWidth / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-secondary)" fontFamily="var(--font-mono)">
                  {d.month.split("-")[1]}
                </text>
                {isActive && (
                  <foreignObject x={x + barWidth / 2 - 55} y={barY - 52} width={110} height={48} style={{ overflow: "visible" }}>
                    <div style={{
                      background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                      padding: "8px 12px", borderRadius: 8, fontSize: 12, boxShadow: "var(--shadow-lg)",
                    }}>
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{d.month}</div>
                      <div style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: isAbove ? "var(--color-success)" : "var(--color-danger)" }}>
                        {fmt(d.saving)}
                      </div>
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
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
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 40, height: 40, border: "3px solid var(--border-subtle)",
            borderTopColor: "var(--color-primary)", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
          }} />
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{t("analysis.loading")}</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", gap: 24, padding: "28px 0" }}>
      {/* Page title */}
      <div style={{ padding: "0 28px" }}>
        <h2 style={{
          fontWeight: 700, fontSize: 22, color: "var(--text-primary)", letterSpacing: "-0.01em",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span>🔥</span>
          <span>FIRE Dashboard</span>
        </h2>
      </div>

      <div style={{ padding: "0 28px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* 1. FIRE Core Dashboard */}
        <FireCoreDashboard fire={data.fire} netWorth={data.net_worth} t={t} />

        {/* 2. Asset Growth & FIRE Path */}
        <AssetGrowthChart data={data.asset_growth} t={t} />

        {/* 3. Income & Expense Breakdown */}
        <IncomeExpenseBreakdown
          currentMonth={data.current_month}
          expenseBreakdown={data.expense_breakdown}
          incomeBreakdown={data.income_breakdown}
          t={t}
        />

        {/* 4. Investment Portfolio */}
        <InvestmentPortfolio portfolio={data.investment_portfolio} t={t} />

        {/* 5. Monthly Saving Trend */}
        <MonthlySavingChart data={data.monthly_saving_trend} t={t} />
      </div>
    </div>
  );
}
