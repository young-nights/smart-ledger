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

// ── Theme Constants ─────────────────────────────────────────────

const THEME = {
  bgMain: "#0a0a0f",
  bgCard: "#12121a",
  bgSecondary: "#1a1a2e",
  primary: "#00d4ff",
  positive: "#00ff88",
  negative: "#ff4757",
  warning: "#ffa502",
  textPrimary: "#ffffff",
  textSecondary: "#8892b0",
  textMuted: "#4a5568",
  gradientMain: "linear-gradient(135deg, #00d4ff, #00ff88)",
  cardBorder: "rgba(0,212,255,0.1)",
  cardBg: "rgba(18,18,26,0.8)",
};

const PIE_COLORS = [
  "#00d4ff", "#ff4757", "#00ff88", "#ffa502", "#7c3aed",
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

// ── SVG Glow Filter Defs ────────────────────────────────────────

function GlowDefs() {
  return (
    <defs>
      <filter id="glow">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-strong">
        <feGaussianBlur stdDeviation="5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <linearGradient id="grad-blue-green" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#00d4ff" />
        <stop offset="100%" stopColor="#00ff88" />
      </linearGradient>
      <linearGradient id="grad-blue" x1="0%" y1="0%" x2="0%" y2="1%">
        <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.3} />
        <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="grad-green" x1="0%" y1="0%" x2="0%" y2="1%">
        <stop offset="0%" stopColor="#00ff88" stopOpacity={0.3} />
        <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="grad-bar-pos" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#00ff88" stopOpacity={0.6} />
        <stop offset="100%" stopColor="#00ff88" />
      </linearGradient>
      <linearGradient id="grad-bar-neg" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#ff4757" stopOpacity={0.6} />
        <stop offset="100%" stopColor="#ff4757" />
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
      className={className}
      style={{
        background: THEME.cardBg,
        border: `1px solid ${THEME.cardBorder}`,
        borderRadius: 16,
        padding: "24px 28px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.3), 0 0 1px rgba(0,212,255,0.1)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Module 1: FIRE Core Dashboard ───────────────────────────────

function FireCoreDashboard({ fire, t }: { fire: AnalysisData["fire"]; t: (k: string) => string }) {
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
            <GlowDefs />
            {/* Background ring */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
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
                  stroke={progress >= tick ? THEME.primary : "rgba(255,255,255,0.15)"}
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
              filter="url(#glow)"
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
                color: THEME.textMuted,
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
                fontFamily: "'JetBrains Mono', monospace",
                color: THEME.primary,
                lineHeight: 1.1,
                filter: "url(#glow)",
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
              color={THEME.primary}
              large
            />
            <DataBlock
              label={t("analysis.currentAssets")}
              value={fmtFull(Math.round(animatedAssets))}
              color={THEME.positive}
              large
            />
            <DataBlock
              label={t("analysis.remaining")}
              value={fmtFull(fire.remaining)}
              color={THEME.warning}
            />
            <DataBlock
              label={t("analysis.estimatedDate")}
              value={fire.estimated_date}
              color="#7c3aed"
            />
          </div>

          {/* Bottom: Mini Metrics */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
              marginTop: 24,
              paddingTop: 20,
              borderTop: `1px solid rgba(255,255,255,0.06)`,
            }}
          >
            <MiniMetric
              label={t("analysis.savingsRate")}
              value={`${fire.savings_rate}%`}
              target="目标 ≥50%"
              color={fire.savings_rate >= 50 ? THEME.positive : THEME.warning}
              progress={Math.min(fire.savings_rate / 50 * 100, 100)}
            />
            <MiniMetric
              label={t("analysis.savingsPerExpense")}
              value={fire.savings_per_expense.toFixed(2)}
              target="目标 ≥1"
              color={fire.savings_per_expense >= 1 ? THEME.positive : THEME.warning}
              progress={Math.min(fire.savings_per_expense * 100, 100)}
            />
            <MiniMetric
              label={t("analysis.emergencyFund")}
              value={`${fire.emergency_fund_months}月`}
              target="目标 6-12月"
              color={
                fire.emergency_fund_months >= 6 && fire.emergency_fund_months <= 12
                  ? THEME.positive
                  : fire.emergency_fund_months >= 3
                  ? THEME.warning
                  : THEME.negative
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
          color: THEME.textMuted,
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
          fontFamily: "'JetBrains Mono', monospace",
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
        <span style={{ fontSize: 11, color: THEME.textMuted }}>{label}</span>
        <span style={{ fontSize: 10, color: THEME.textMuted }}>{target}</span>
      </div>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          color,
        }}
      >
        {value}
      </span>
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: "rgba(255,255,255,0.06)",
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
            boxShadow: `0 0 8px ${color}66`,
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
        <p style={{ fontSize: 13, color: THEME.textMuted }}>No data available</p>
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
      <h4
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: THEME.textPrimary,
          marginBottom: 16,
        }}
      >
        {t("analysis.assetGrowth")}
      </h4>

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap" }}>
        <LegendItem color={THEME.primary} label={t("analysis.actualAssets")} />
        <LegendItem color={THEME.positive} label={t("analysis.optimistic")} dashed />
        <LegendItem color={THEME.primary} label={t("analysis.baseline")} dashed />
        <LegendItem color={THEME.negative} label={t("analysis.conservative")} dashed />
      </div>

      <div ref={containerRef} style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="xMidYMid meet">
          <GlowDefs />

          {/* Grid lines */}
          {yTickVals.map((v, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={toY(v)}
                x2={W - padR}
                y2={toY(v)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={padL - 8}
                y={toY(v) + 4}
                textAnchor="end"
                fontSize={11}
                fill={THEME.textSecondary}
                fontFamily="'JetBrains Mono', monospace"
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
                  key={i}
                  x={toX(i)}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill={THEME.textSecondary}
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {d.month.split("-")[1]}月
                </text>
              )
          )}

          {/* Scenario lines (dashed) */}
          <polyline
            points={optLine}
            fill="none"
            stroke={THEME.positive}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            opacity={visible ? 0.5 : 0}
            style={{ transition: "opacity 0.6s ease 0.3s" }}
          />
          <polyline
            points={baseLine}
            fill="none"
            stroke={THEME.primary}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            opacity={visible ? 0.4 : 0}
            style={{ transition: "opacity 0.6s ease 0.2s" }}
          />
          <polyline
            points={consLine}
            fill="none"
            stroke={THEME.negative}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            opacity={visible ? 0.4 : 0}
            style={{ transition: "opacity 0.6s ease 0.3s" }}
          />

          {/* Area fill */}
          <polygon
            points={actualArea}
            fill="url(#grad-blue)"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 0.6s ease 0.1s" }}
          />

          {/* Main line */}
          <polyline
            points={actualLine}
            fill="none"
            stroke={THEME.primary}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            filter="url(#glow)"
            style={{
              opacity: visible ? 1 : 0,
              transition: "opacity 0.5s ease",
            }}
          />

          {/* Hover crosshair */}
          {hoverIdx !== null && (
            <line
              x1={toX(hoverIdx)}
              y1={padT}
              x2={toX(hoverIdx)}
              y2={padT + chartH}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )}

          {/* Dots */}
          {actualPts.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={20}
                fill="transparent"
                style={{ cursor: "default" }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={hoverIdx === i ? 6 : 3}
                fill={THEME.primary}
                stroke={THEME.bgCard}
                strokeWidth={2}
                style={{ pointerEvents: "none", transition: "r 0.2s" }}
              />
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
                <div
                  style={{
                    background: "rgba(18,18,26,0.95)",
                    border: `1px solid ${THEME.cardBorder}`,
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 12,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontSize: 10, color: THEME.textMuted, marginBottom: 4 }}>{item.month}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, fontFamily: "'JetBrains Mono', monospace", color: THEME.primary }}>
                    {fmt(item.actual)}
                  </div>
                  <div style={{ fontSize: 10, color: THEME.textMuted, marginTop: 2 }}>
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

function LegendItem({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <svg width={14} height={3}>
        <line
          x1={0}
          y1={1.5}
          x2={14}
          y2={1.5}
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? "4 3" : "none"}
        />
      </svg>
      <span style={{ fontSize: 12, color: THEME.textSecondary }}>{label}</span>
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 20,
      }}
    >
      {/* Left: Current Month Overview */}
      <Card>
        <h4
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: THEME.textPrimary,
            marginBottom: 20,
          }}
        >
          {t("analysis.currentMonthOverview")}
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <OverviewRow
            label={t("analysis.income")}
            value={currentMonth.income}
            color={THEME.positive}
            icon="↑"
          />
          <OverviewRow
            label={t("analysis.expense")}
            value={currentMonth.expense}
            color={THEME.negative}
            icon="↓"
          />
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
          <OverviewRow
            label={t("analysis.netSaving")}
            value={currentMonth.net_saving}
            color={THEME.primary}
            icon="→"
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: THEME.textSecondary }}>
              {t("analysis.savingsRate")}
            </span>
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: currentMonth.savings_rate >= 50 ? THEME.positive : THEME.warning,
              }}
            >
              {currentMonth.savings_rate}%
            </span>
          </div>
        </div>
      </Card>

      {/* Right: Expense Donut Chart */}
      <Card>
        <h4
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: THEME.textPrimary,
            marginBottom: 16,
          }}
        >
          {t("analysis.expenseBreakdown")}
        </h4>
        <DonutChart data={expenseBreakdown} total={expenseTotal} />
      </Card>
    </div>
  );
}

function OverviewRow({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
}) {
  const animated = useCountUp(value, 1200);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `${color}15`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 13, color: THEME.textSecondary }}>{label}</span>
      </div>
      <span
        style={{
          fontSize: 17,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          color,
        }}
      >
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

function arcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  start: number,
  end: number
): string {
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
        <span style={{ fontSize: 13, color: THEME.textMuted }}>No data</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <GlowDefs />
          {data.map((item, i) => {
            const { start, end, mid } = sectors[i];
            const color = item.color || PIE_COLORS[i % PIE_COLORS.length];
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
                filter={isActive ? "url(#glow)" : undefined}
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
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: THEME.textPrimary, lineHeight: 1.2 }}>
                {fmt(total)}
              </span>
              <span style={{ fontSize: 9, color: THEME.textMuted, marginTop: 2 }}>Total</span>
            </div>
          </foreignObject>
        </svg>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1, minWidth: 120 }}>
        {data.slice(0, 6).map((item, i) => {
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
                opacity: activeIdx !== null && !isActive ? 0.3 : 1,
                transition: "opacity 0.2s",
                cursor: "pointer",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: THEME.textPrimary, fontWeight: isActive ? 600 : 400, flex: 1 }}>
                {item.category}
              </span>
              <span style={{ fontSize: 12, color: THEME.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
                {fmt(item.amount)}
              </span>
              <span style={{ fontSize: 11, color: THEME.textMuted, fontFamily: "'JetBrains Mono', monospace", minWidth: 40, textAlign: "right" }}>
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

function InvestmentPortfolio({
  portfolio,
  t,
}: {
  portfolio: AnalysisData["investment_portfolio"];
  t: (k: string) => string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 20,
      }}
    >
      {/* Left: Allocation Pie */}
      <Card>
        <h4
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: THEME.textPrimary,
            marginBottom: 16,
          }}
        >
          {t("analysis.assetAllocation")}
        </h4>
        <AllocationChart data={portfolio.allocation} />
      </Card>

      {/* Right: Holdings Cards */}
      <Card>
        <h4
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: THEME.textPrimary,
            marginBottom: 20,
          }}
        >
          {t("analysis.holdingsOverview")}
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <HoldingCard
            label="A股"
            value={portfolio.a_shares.value}
            pnl={portfolio.a_shares.pnl}
            pnlPct={portfolio.a_shares.pnl_pct}
            color="#ff4757"
          />
          <HoldingCard
            label="美股"
            value={portfolio.us_stocks.value}
            pnl={portfolio.us_stocks.pnl}
            pnlPct={portfolio.us_stocks.pnl_pct}
            color="#00d4ff"
          />
          <HoldingCard
            label="现金/存款"
            value={portfolio.cash}
            color="#ffa502"
          />
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: THEME.textSecondary }}>{t("analysis.totalReturn")}</span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: portfolio.total_return_pct >= 0 ? THEME.positive : THEME.negative,
              }}
            >
              {portfolio.total_return_pct >= 0 ? "+" : ""}
              {portfolio.total_return_pct}%
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
          <GlowDefs />
          {data.map((item, i) => {
            const { start, end, mid } = sectors[i];
            const isActive = hoveredIdx === i;
            const offsetRad = ((mid - 90) * Math.PI) / 180;
            const tx = isActive ? Math.cos(offsetRad) * 4 : 0;
            const ty = isActive ? Math.sin(offsetRad) * 4 : 0;

            return (
              <path
                key={item.type}
                d={arcPath(cx, cy, outerR, innerR, start, end)}
                fill={item.color}
                transform={`translate(${tx}, ${ty})`}
                filter={isActive ? "url(#glow)" : undefined}
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
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.3 : 1,
              transition: "opacity 0.2s",
              cursor: "pointer",
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: THEME.textPrimary, flex: 1 }}>{item.type}</span>
            <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: THEME.textSecondary }}>
              {item.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HoldingCard({
  label,
  value,
  pnl,
  pnlPct,
  color,
}: {
  label: string;
  value: number;
  pnl?: number;
  pnlPct?: number;
  color: string;
}) {
  const animated = useCountUp(value, 1200);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 14px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${color}22`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${color}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 14, color, fontWeight: 700 }}>{label[0]}</span>
        </div>
        <div>
          <div style={{ fontSize: 13, color: THEME.textPrimary, fontWeight: 500 }}>{label}</div>
          {pnl !== undefined && (
            <div
              style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: pnl >= 0 ? THEME.positive : THEME.negative,
              }}
            >
              {pnl >= 0 ? "+" : ""}
              {fmt(pnl)} ({pnlPct}%)
            </div>
          )}
        </div>
      </div>
      <span
        style={{
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          color: THEME.textPrimary,
        }}
      >
        {fmt(Math.round(animated))}
      </span>
    </div>
  );
}

// ── Module 5: Monthly Saving Trend (Bar Chart) ──────────────────

function MonthlySavingChart({
  data,
  t,
}: {
  data: AnalysisData["monthly_saving_trend"];
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
        <p style={{ fontSize: 13, color: THEME.textMuted }}>No data available</p>
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
      <h4
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: THEME.textPrimary,
          marginBottom: 16,
        }}
      >
        {t("analysis.monthlySavingTrend")}
      </h4>

      <div ref={containerRef} style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="xMidYMid meet">
          <GlowDefs />

          {/* Grid lines */}
          {yTickVals.map((v, i) => (
            <g key={i}>
              <line
                x1={padL}
                y1={toY(v)}
                x2={W - padR}
                y2={toY(v)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={padL - 8}
                y={toY(v) + 4}
                textAnchor="end"
                fontSize={11}
                fill={THEME.textSecondary}
                fontFamily="'JetBrains Mono', monospace"
              >
                {v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
              </text>
            </g>
          ))}

          {/* Target line */}
          <line
            x1={padL}
            y1={targetY}
            x2={W - padR}
            y2={targetY}
            stroke={THEME.warning}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            opacity={0.6}
          />
          <text
            x={W - padR + 4}
            y={targetY + 4}
            fontSize={10}
            fill={THEME.warning}
            fontFamily="'JetBrains Mono', monospace"
          >
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
                {/* Bar */}
                <rect
                  x={x}
                  y={visible ? barY : toY(0)}
                  width={barWidth}
                  height={visible ? barH : 0}
                  rx={3}
                  fill={isAbove ? "url(#grad-bar-pos)" : "url(#grad-bar-neg)"}
                  filter={isActive ? "url(#glow)" : undefined}
                  style={{
                    transition: "y 0.8s cubic-bezier(0.25, 1, 0.5, 1), height 0.8s cubic-bezier(0.25, 1, 0.5, 1)",
                    transitionDelay: `${i * 30}ms`,
                    cursor: "pointer",
                    opacity: hoverIdx !== null && !isActive ? 0.4 : 1,
                  }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                />

                {/* Month label */}
                <text
                  x={x + barWidth / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill={THEME.textSecondary}
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {d.month.split("-")[1]}
                </text>

                {/* Tooltip */}
                {isActive && (
                  <foreignObject
                    x={x + barWidth / 2 - 55}
                    y={barY - 52}
                    width={110}
                    height={48}
                    style={{ overflow: "visible" }}
                  >
                    <div
                      style={{
                        background: "rgba(18,18,26,0.95)",
                        border: `1px solid ${THEME.cardBorder}`,
                        padding: "8px 12px",
                        borderRadius: 8,
                        fontSize: 12,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                      }}
                    >
                      <div style={{ fontSize: 10, color: THEME.textMuted }}>{d.month}</div>
                      <div style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: isAbove ? THEME.positive : THEME.negative }}>
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
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        className="page"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          background: THEME.bgMain,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: `3px solid ${THEME.primary}33`,
              borderTopColor: THEME.primary,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          <p style={{ fontSize: 13, color: THEME.textMuted }}>{t("analysis.loading")}</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="page"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          background: THEME.bgMain,
        }}
      >
        <p style={{ fontSize: 14, color: THEME.textMuted }}>{t("analysis.noData")}</p>
      </div>
    );
  }

  return (
    <div
      className="page"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        background: THEME.bgMain,
        minHeight: "100vh",
        padding: "28px 0",
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .fire-dashboard .page {
          background: ${THEME.bgMain};
        }
      `}</style>

      {/* Page title */}
      <div style={{ padding: "0 28px" }}>
        <h2
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            fontSize: 22,
            color: THEME.textPrimary,
            letterSpacing: "-0.01em",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ filter: "url(#glow-strong)" }}>🔥</span>
          <span style={{ background: THEME.gradientMain, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            FIRE Dashboard
          </span>
        </h2>
      </div>

      <div style={{ padding: "0 28px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* 1. FIRE Core Dashboard */}
        <FireCoreDashboard fire={data.fire} t={t} />

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
