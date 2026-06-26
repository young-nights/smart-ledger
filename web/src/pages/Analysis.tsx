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

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import {
  Flame,
  TrendingUp,
  Wallet,
  PieChart as PieChartIcon,
  BarChart3,
  ArrowRightLeft,
  Landmark,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "../i18n";
import {
  fetchAnalysis,
  type AnalysisData,
  type FlowMetrics,
  type StockMetrics,
  type AssetAllocationItem,
  type LiabilityBreakdownItem,
} from "../lib/api";

// ── Theme Constants (CSS variable based) ──────────────────────

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

// ── Shared UI Primitives ──────────────────────────────────────

const ANALYSIS_STYLES = `
  @keyframes analysisFadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes analysisShimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes analysisPulseRing {
    0%, 100% { opacity: 0.75; }
    50% { opacity: 1; }
  }

  /* Typography scale */
  .analysis-type-page-title { font-family: var(--font-display); font-size: 24px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.25; }
  .analysis-type-page-desc { font-size: 13px; line-height: 1.55; color: var(--text-secondary); }
  .analysis-type-section { font-family: var(--font-display); font-size: 16px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.3; }
  .analysis-type-label { font-size: 12px; font-weight: 500; color: var(--text-tertiary); letter-spacing: 0.04em; text-transform: uppercase; line-height: 1.4; }
  .analysis-type-caption { font-size: 12px; color: var(--text-muted); line-height: 1.4; }
  .analysis-type-body { font-size: 14px; color: var(--text-secondary); line-height: 1.5; }
  .analysis-type-list { font-size: 13px; color: var(--text-primary); line-height: 1.45; }
  .analysis-type-mono-sm { font-family: var(--font-mono); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .analysis-type-mono-md { font-family: var(--font-mono); font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .analysis-type-mono-lg { font-family: var(--font-mono); font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.15; }
  .analysis-type-mono-xl { font-family: var(--font-mono); font-size: 36px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .analysis-type-group-title { font-size: 13px; font-weight: 600; line-height: 1.4; }

  .analysis-card {
    padding: 24px 28px;
    border-radius: 14px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-sm);
    animation: analysisFadeIn 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
    transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1),
                box-shadow 0.3s cubic-bezier(0.25, 1, 0.5, 1),
                border-color 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  }
  .analysis-card:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
    border-color: var(--border-default);
  }
  .analysis-section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
  }
  .analysis-section-header__icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--section-accent, var(--color-primary)) 10%, var(--bg-page));
    color: var(--section-accent, var(--color-primary));
    flex-shrink: 0;
  }
  .analysis-section-header h4 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }
  .analysis-stat-tile {
    padding: 16px 18px;
    border-radius: 12px;
    background: var(--bg-page);
    border: 1px solid var(--border-subtle);
    transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1),
                box-shadow 0.25s cubic-bezier(0.25, 1, 0.5, 1),
                border-color 0.25s cubic-bezier(0.25, 1, 0.5, 1),
                background 0.25s cubic-bezier(0.25, 1, 0.5, 1);
    cursor: default;
  }
  .analysis-stat-tile:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
    border-color: color-mix(in srgb, var(--tile-accent, var(--color-primary)) 22%, var(--border-default));
    background: color-mix(in srgb, var(--tile-accent, var(--color-primary)) 3%, var(--bg-page));
  }
  .analysis-stat-tile__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
  }
  .analysis-stat-tile__label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .analysis-stat-tile__hint {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .analysis-stat-tile__value {
    font-family: var(--font-mono);
    font-size: 17px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .analysis-stat-tile--center {
    text-align: center;
  }
  .analysis-stat-tile--center .analysis-stat-tile__label {
    margin-bottom: 6px;
  }
  .analysis-inner-panel {
    padding: 18px 20px;
    border-radius: 12px;
    background: var(--bg-page);
    border: 1px solid var(--border-subtle);
  }
  .analysis-inner-metric__label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-tertiary);
    letter-spacing: 0.03em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .analysis-inner-metric__value {
    font-family: var(--font-mono);
    font-size: 16px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .analysis-holding-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--bg-page);
    border: 1px solid var(--border-subtle);
    transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1),
                box-shadow 0.25s cubic-bezier(0.25, 1, 0.5, 1),
                border-color 0.25s cubic-bezier(0.25, 1, 0.5, 1),
                background 0.25s cubic-bezier(0.25, 1, 0.5, 1);
    cursor: default;
  }
  .analysis-holding-row:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
    border-color: color-mix(in srgb, var(--holding-accent, var(--color-primary)) 20%, var(--border-default));
    background: color-mix(in srgb, var(--holding-accent, var(--color-primary)) 4%, var(--bg-page));
  }
  .analysis-holding-row__avatar {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--holding-accent, var(--color-primary));
    background: color-mix(in srgb, var(--holding-accent, var(--color-primary)) 12%, var(--bg-surface));
  }
  .analysis-holding-row__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
  }
  .analysis-holding-row__sub {
    font-size: 12px;
    font-family: var(--font-mono);
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
  }
  .analysis-holding-row__amount {
    font-family: var(--font-mono);
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .analysis-overview-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .analysis-overview-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 4px 0;
  }
  .analysis-legend-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--bg-page);
    border: 1px solid var(--border-subtle);
    font-size: 13px;
    color: var(--text-secondary);
    transition: background 0.2s, border-color 0.2s;
  }
  .analysis-legend-pill:hover {
    background: var(--bg-elevated);
    border-color: var(--border-default);
  }
  .analysis-data-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .analysis-data-block__value {
    font-family: var(--font-mono);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .analysis-data-block__value--lg { font-size: 22px; }
  .analysis-data-block__value--md { font-size: 17px; }
  .analysis-list-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    transition: background 0.15s;
  }
  .analysis-list-row:hover {
    background: var(--bg-page);
  }
  .analysis-list-row__swatch {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .analysis-progress-track {
    height: 4px;
    border-radius: 999px;
    background: var(--border-light);
    overflow: hidden;
    margin-top: 10px;
  }
  .analysis-progress-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 1s cubic-bezier(0.25, 1, 0.5, 1);
  }
  .analysis-skeleton {
    background: linear-gradient(90deg, var(--border-light) 25%, var(--border-subtle) 50%, var(--border-light) 75%);
    background-size: 200% 100%;
    animation: analysisShimmer 1.5s ease-in-out infinite, analysisFadeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
    border-radius: 14px;
    border: 1px solid var(--border-subtle);
  }
  .fire-ring-animated {
    animation: analysisPulseRing 3s ease-in-out infinite;
  }
  .analysis-page-header {
    padding: 0 32px;
  }
  .analysis-page-header h2 {
    margin: 0 0 8px;
    font-family: var(--font-display);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .analysis-page-header__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--color-primary) 12%, var(--bg-surface));
    color: var(--color-primary);
    box-shadow: var(--shadow-xs);
  }
  .analysis-ring-label {
    font-size: 12px;
    color: var(--text-tertiary);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .analysis-card-row {
    display: grid;
    gap: 24px;
    align-items: stretch;
  }
  .analysis-card-row--2 {
    grid-template-columns: 1fr 1fr;
  }
  .analysis-card-row--fire {
    grid-template-columns: minmax(280px, auto) 1fr;
  }
  .analysis-card-cell {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    height: 100%;
  }
  .analysis-card-row > .analysis-card,
  .analysis-card-cell > .analysis-card {
    flex: 1;
  }
  .analysis-card--fill {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .analysis-card__grow {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .analysis-card__grow--center {
    justify-content: center;
  }
`;

function Card({
  children,
  style,
  className,
  accent,
  fill,
}: {
  children: ReactNode;
  style?: React.CSSProperties;
  className?: string;
  accent?: string;
  fill?: boolean;
}) {
  return (
    <div
      className={`analysis-card${fill ? " analysis-card--fill" : ""} ${className || ""}`.trim()}
      style={{
        ...(accent ? { "--section-accent": accent } as React.CSSProperties : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardRow({
  children,
  variant = "2",
  style,
}: {
  children: ReactNode;
  variant?: "2" | "fire";
  style?: React.CSSProperties;
}) {
  return (
    <div className={`analysis-card-row analysis-card-row--${variant}`} style={style}>
      {children}
    </div>
  );
}

function CardCell({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div className="analysis-card-cell" style={style}>{children}</div>;
}

function SectionHeader({
  icon: Icon,
  title,
  accent = "var(--color-primary)",
}: {
  icon: LucideIcon;
  title: string;
  accent?: string;
}) {
  return (
    <div className="analysis-section-header" style={{ "--section-accent": accent } as React.CSSProperties}>
      <div className="analysis-section-header__icon">
        <Icon size={16} strokeWidth={2} />
      </div>
      <h4>{title}</h4>
    </div>
  );
}

// ── Module 1a: FIRE Progress Card (Left) ──────────────────────

function FireProgressCard({
  fire,
  t,
}: {
  fire: AnalysisData["fire"];
  t: (k: string) => string;
}) {
  const animatedProgress = useCountUp(fire.progress_pct, 1500);

  const ringSize = 220;
  const strokeWidth = 14;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(fire.progress_pct, 100);
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <Card
      fill
      accent="var(--color-primary)"
      style={{ alignItems: "center", justifyContent: "center", padding: "28px 24px" }}
    >
      <div style={{ position: "relative", width: ringSize, height: ringSize }}>
        <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
          <defs>
            <linearGradient id="fire-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="50%" stopColor="#16a34a" />
              <stop offset="100%" stopColor="#16a34a" />
            </linearGradient>
            <filter id="fire-ring-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Background ring */}
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth={strokeWidth}
            opacity={0.5}
          />
          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map((tick) => {
            const angle = (tick / 100) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const inner = radius - strokeWidth / 2 - 5;
            const outer = radius + strokeWidth / 2 + 5;
            return (
              <line
                key={tick}
                x1={ringSize / 2 + inner * Math.cos(rad)}
                y1={ringSize / 2 + inner * Math.sin(rad)}
                x2={ringSize / 2 + outer * Math.cos(rad)}
                y2={ringSize / 2 + outer * Math.sin(rad)}
                stroke={progress >= tick ? "#16a34a" : "var(--border-subtle)"}
                strokeWidth={2}
                strokeLinecap="round"
              />
            );
          })}
          {/* Progress arc with glow */}
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="url(#fire-ring-grad)"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
            filter="url(#fire-ring-glow)"
            className="fire-ring-animated"
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
          <span className="analysis-ring-label">FIRE Progress</span>
          <span
            className="analysis-type-mono-xl"
            style={{
              background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-success) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {animatedProgress.toFixed(1)}%
          </span>
        </div>
      </div>
      {/* Bottom mini metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginTop: 28,
          paddingTop: 24,
          borderTop: "1px solid var(--border-subtle)",
          width: "100%",
        }}
      >
        <MiniMetric
          label={t("analysis.savingsRate")}
          value={`${fire.savings_rate}%`}
          target="目标 ≥50%"
          color={fire.savings_rate >= 50 ? "#16a34a" : "#d97706"}
          progress={Math.min(fire.savings_rate / 50 * 100, 100)}
          hint="储蓄率 = 月储蓄额 / 月收入 × 100%，越高越快达成FIRE"
        />
        <MiniMetric
          label={t("analysis.savingsPerExpense")}
          value={fire.savings_per_expense.toFixed(2)}
          target="目标 ≥1"
          color={fire.savings_per_expense >= 1 ? "#16a34a" : "#d97706"}
          progress={Math.min(fire.savings_per_expense * 100, 100)}
          hint="储蓄杠杆 = 月储蓄额 / 月支出，≥1表示存的钱比花的多"
        />
        <MiniMetric
          label={t("analysis.emergencyFund")}
          value={`${fire.emergency_fund_months}月`}
          target="目标 6-12月"
          color={
            fire.emergency_fund_months >= 6 && fire.emergency_fund_months <= 12
              ? "#16a34a"
              : fire.emergency_fund_months >= 3
              ? "#d97706"
              : "#dc2626"
          }
          progress={Math.min((fire.emergency_fund_months / 12) * 100, 100)}
          hint="应急基金 = 流动资产 / 月支出，建议储备6-12个月生活费"
        />
      </div>
    </Card>
  );
}

// ── Module 1b: FIRE Metrics Card (Right) ───────────────────────

function FireMetricsCard({
  fire,
  stockMetrics,
  t,
}: {
  fire: AnalysisData["fire"];
  stockMetrics?: StockMetrics;
  t: (k: string) => string;
}) {
  const animatedAssets = useCountUp(fire.current_assets, 1500);

  return (
    <Card fill accent="var(--color-success)">
      <div className="analysis-card__grow">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 28px" }}>
        <DataBlock
          label={t("analysis.fireNumber")}
          value={fmtFull(fire.fire_number)}
          color="#2563eb"
          large
          hint="FIRE目标 = 年支出 × 25（基于4%法则，即每年提取4%可永续使用）"
        />
        <DataBlock
          label={t("analysis.currentAssets")}
          value={fmtFull(Math.round(animatedAssets))}
          color="#16a34a"
          large
          hint="当前总资产 = 储蓄余额 + 股票投资市值"
        />
        <DataBlock
          label={t("analysis.remaining")}
          value={fmtFull(fire.remaining)}
          color="#d97706"
          hint="距离FIRE目标还需积累的金额"
        />
        <DataBlock
          label={t("analysis.estimatedDate")}
          value={fire.estimated_date}
          color="#7c3aed"
          hint="基于当前储蓄速度和年化7%投资回报预估达成日期"
        />
      </div>

      {stockMetrics && stockMetrics.total_assets > 0 && (
        <div
          className="analysis-inner-panel"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginTop: "auto",
            paddingTop: 20,
          }}
        >
          <div>
            <div className="analysis-inner-metric__label">净资产</div>
            <div className="analysis-inner-metric__value" style={{ color: "var(--color-primary)" }}>
              {fmtFull(stockMetrics.net_worth)}
            </div>
          </div>
          <div>
            <div className="analysis-inner-metric__label">可投资资产</div>
            <div className="analysis-inner-metric__value" style={{ color: "var(--color-success)" }}>
              {fmtFull(stockMetrics.investable_assets)}
            </div>
          </div>
          <div>
            <div className="analysis-inner-metric__label">净金融资产</div>
            <div className="analysis-inner-metric__value" style={{ color: stockMetrics.net_financial_assets >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
              {fmtFull(stockMetrics.net_financial_assets)}
            </div>
          </div>
          <div>
            <div className="analysis-inner-metric__label">增长率</div>
            <div className="analysis-inner-metric__value" style={{ color: "var(--color-success)" }}>
              {stockMetrics.asset_growth_rate}%
            </div>
          </div>
        </div>
      )}
      </div>
    </Card>
  );
}

function DataBlock({
  label,
  value,
  color,
  large,
  hint,
}: {
  label: string;
  value: string;
  color: string;
  large?: boolean;
  hint?: string;
}) {
  return (
    <div className="analysis-data-block">
      <span className="analysis-type-label" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        {hint && (
          <span
            className="info-hint"
            title={hint}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "var(--border-subtle, #e5e5e5)",
              color: "var(--text-tertiary)",
              fontSize: 9,
              fontWeight: 700,
              cursor: "help",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            i
          </span>
        )}
      </span>
      <span
        className={`analysis-data-block__value ${large ? "analysis-data-block__value--lg" : "analysis-data-block__value--md"}`}
        style={{ color }}
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
  hint,
}: {
  label: string;
  value: string;
  target: string;
  color: string;
  progress: number;
  hint?: string;
}) {
  const [animWidth, setAnimWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setAnimWidth(progress), 100);
    return () => clearTimeout(t);
  }, [progress]);

  return (
    <div className="analysis-stat-tile" style={{ "--tile-accent": color } as React.CSSProperties}>
      <div className="analysis-stat-tile__head">
        <span className="analysis-stat-tile__label" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {label}
          {hint && (
            <span
              title={hint}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 13,
                height: 13,
                borderRadius: "50%",
                background: "var(--border-subtle, #e5e5e5)",
                color: "var(--text-tertiary)",
                fontSize: 8,
                fontWeight: 700,
                cursor: "help",
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              i
            </span>
          )}
        </span>
        <span className="analysis-stat-tile__hint">{target}</span>
      </div>
      <div className="analysis-stat-tile__value" style={{ color }}>{value}</div>
      <div className="analysis-progress-track">
        <div className="analysis-progress-fill" style={{ width: `${animWidth}%`, background: color }} />
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
    <Card accent="var(--color-primary)">
      <SectionHeader icon={TrendingUp} title={t("analysis.assetGrowth")} accent="var(--color-primary)" />

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
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
                  <div className="analysis-type-caption" style={{ marginBottom: 4 }}>{item.month}</div>
                  <div className="analysis-type-mono-sm" style={{ color: "var(--color-primary)" }}>
                    {fmt(item.actual)}
                  </div>
                  <div className="analysis-type-caption" style={{ marginTop: 2 }}>
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
    <div className="analysis-legend-pill">
      <svg width={14} height={3}>
        <line x1={0} y1={1.5} x2={14} y2={1.5} stroke={color} strokeWidth={2} strokeDasharray={dashed ? "4 3" : "none"} />
      </svg>
      <span>{label}</span>
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
    <CardRow>
      <Card fill accent="var(--color-success)">
        <SectionHeader icon={Wallet} title={t("analysis.currentMonthOverview")} accent="var(--color-success)" />
        <div className="analysis-card__grow" style={{ gap: 16 }}>
          <OverviewRow label={t("analysis.income")} value={currentMonth.income} color="var(--color-success)" icon="up" />
          <OverviewRow label={t("analysis.expense")} value={currentMonth.expense} color="var(--color-danger)" icon="down" />
          <div style={{ height: 1, background: "var(--border-subtle)" }} />
          <OverviewRow label={t("analysis.netSaving")} value={currentMonth.net_saving} color="var(--color-primary)" icon="neutral" />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
            <span className="analysis-type-body" style={{ fontWeight: 500 }}>{t("analysis.savingsRate")}</span>
            <span
              className="analysis-type-mono-lg"
              style={{ color: currentMonth.savings_rate >= 50 ? "var(--color-success)" : "var(--color-warning)" }}
            >
              {currentMonth.savings_rate}%
            </span>
          </div>
        </div>
      </Card>

      <Card fill accent="var(--color-danger)">
        <SectionHeader icon={PieChartIcon} title={t("analysis.expenseBreakdown")} accent="var(--color-danger)" />
        <div className="analysis-card__grow analysis-card__grow--center">
          <DonutChart data={expenseBreakdown} total={expenseTotal} />
        </div>
      </Card>
    </CardRow>
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
  icon: "up" | "down" | "neutral";
}) {
  const animated = useCountUp(value, 1200);
  const Icon = icon === "up" ? ArrowUpRight : icon === "down" ? ArrowDownRight : Minus;

  return (
    <div className="analysis-overview-row">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          className="analysis-overview-icon"
          style={{
            background: `color-mix(in srgb, ${color} 10%, var(--bg-page))`,
            color,
          }}
        >
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <span className="analysis-type-body" style={{ fontWeight: 500 }}>{label}</span>
      </div>
      <span className="analysis-type-mono-md" style={{ color }}>{fmt(Math.round(animated))}</span>
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
  const svgRef = useRef<SVGSVGElement>(null);

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

  const sectors = useMemo(() => {
    let cum = 0;
    return data.map((item) => {
      const start = (cum / (total || 1)) * 360;
      cum += item.amount;
      const end = (cum / (total || 1)) * 360;
      return { start, end, mid: (start + end) / 2 };
    });
  }, [data, total]);

  const findSectorByAngle = useCallback(
    (angleDeg: number): number | null => {
      for (let i = 0; i < sectors.length; i++) {
        if (angleDeg >= sectors[i].start && angleDeg < sectors[i].end) return i;
      }
      if (sectors.length > 0 && angleDeg >= sectors[sectors.length - 1].end - 0.01) {
        return sectors.length - 1;
      }
      return null;
    },
    [sectors],
  );

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
        <svg
          ref={svgRef}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          onMouseMove={(e) => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left - cx;
            const y = e.clientY - rect.top - cy;
            const dist = Math.sqrt(x * x + y * y);
            if (dist > outerR + 4 || dist < innerR - 2) {
              setHoveredIdx(null);
              return;
            }
            let angle = Math.atan2(x, -y) * (180 / Math.PI);
            if (angle < 0) angle += 360;
            setHoveredIdx(findSectorByAngle(angle));
          }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
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
                  transition: "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s, filter 0.2s",
                  cursor: "pointer",
                  opacity: !animDone ? 0 : activeIdx !== null && !isActive ? 0.3 : 1,
                  filter: isActive ? "brightness(1.15)" : "none",
                }}
              />
            );
          })}
          <foreignObject x={cx - innerR * 0.7} y={cy - innerR * 0.5} width={innerR * 1.4} height={innerR} style={{ pointerEvents: "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <span className="analysis-type-mono-md" style={{ color: "var(--text-primary)" }}>
                {fmt(total)}
              </span>
              <span className="analysis-type-caption" style={{ marginTop: 2 }}>Total</span>
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
              className="analysis-list-row"
              onMouseEnter={() => setHoveredLegend(i)}
              onMouseLeave={() => setHoveredLegend(null)}
              style={{
                opacity: activeIdx !== null && !isActive ? 0.35 : 1,
                transition: "opacity 0.2s",
                cursor: "pointer",
              }}
            >
              <div className="analysis-list-row__swatch" style={{ background: color }} />
              <span className="analysis-type-list" style={{ fontWeight: isActive ? 600 : 400, flex: 1 }}>
                {item.category}
              </span>
              <span className="analysis-type-mono-sm" style={{ color: "var(--text-secondary)" }}>
                {fmt(item.amount)}
              </span>
              <span className="analysis-type-mono-sm" style={{ color: "var(--text-tertiary)", minWidth: 42, textAlign: "right" }}>
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
    <CardRow>
      <Card fill accent="var(--color-accent)">
        <SectionHeader icon={Landmark} title={t("analysis.assetAllocation")} accent="var(--color-accent)" />
        <div className="analysis-card__grow analysis-card__grow--center">
          <AllocationChart data={portfolio.allocation} />
        </div>
      </Card>

      <Card fill accent="var(--color-primary)">
        <SectionHeader icon={BarChart3} title={t("analysis.holdingsOverview")} accent="var(--color-primary)" />
        <div className="analysis-card__grow" style={{ gap: 14 }}>
          <HoldingCard label="A股" value={portfolio.a_shares.value} pnl={portfolio.a_shares.pnl} pnlPct={portfolio.a_shares.pnl_pct} color="#dc2626" />
          <HoldingCard label="美股" value={portfolio.us_stocks.value} pnl={portfolio.us_stocks.pnl} pnlPct={portfolio.us_stocks.pnl_pct} color="#0891b2" />
          <HoldingCard label="现金/存款" value={portfolio.cash} color="#d97706" />
          <div style={{ height: 1, background: "var(--border-subtle)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 2 }}>
            <span className="analysis-type-body" style={{ fontWeight: 500 }}>{t("analysis.totalReturn")}</span>
            <span
              className="analysis-type-mono-md"
              style={{ color: portfolio.total_return_pct >= 0 ? "var(--color-success)" : "var(--color-danger)" }}
            >
              {portfolio.total_return_pct >= 0 ? "+" : ""}{portfolio.total_return_pct}%
            </span>
          </div>
        </div>
      </Card>
    </CardRow>
  );
}

function AllocationChart({ data }: { data: { type: string; percentage: number; color: string }[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * 0.55;

  const ALLOC_COLORS = ["#dc2626", "#0891b2", "#d97706"];

  const sectors = useMemo(() => {
    let cum = 0;
    return data.map((item) => {
      const start = (cum / 100) * 360;
      cum += item.percentage;
      const end = (cum / 100) * 360;
      return { start, end, mid: (start + end) / 2 };
    });
  }, [data]);

  const findSectorByAngle = useCallback(
    (angleDeg: number): number | null => {
      for (let i = 0; i < sectors.length; i++) {
        if (angleDeg >= sectors[i].start && angleDeg < sectors[i].end) return i;
      }
      if (sectors.length > 0 && angleDeg >= sectors[sectors.length - 1].end - 0.01) {
        return sectors.length - 1;
      }
      return null;
    },
    [sectors],
  );

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <svg
          ref={svgRef}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          onMouseMove={(e) => {
            if (!svgRef.current) return;
            const rect = svgRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left - cx;
            const y = e.clientY - rect.top - cy;
            const dist = Math.sqrt(x * x + y * y);
            if (dist > outerR + 4 || dist < innerR - 2) {
              setHoveredIdx(null);
              return;
            }
            let angle = Math.atan2(x, -y) * (180 / Math.PI);
            if (angle < 0) angle += 360;
            setHoveredIdx(findSectorByAngle(angle));
          }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
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
                  transition: "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s, filter 0.2s",
                  cursor: "pointer",
                  opacity: hoveredIdx !== null && !isActive ? 0.3 : 1,
                  filter: isActive ? "brightness(1.15)" : "none",
                }}
              />
            );
          })}
        </svg>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.map((item, i) => (
          <div
            key={item.type}
            className="analysis-list-row"
            style={{
              opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.35 : 1,
              transition: "opacity 0.2s",
              cursor: "pointer",
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div className="analysis-list-row__swatch" style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
            <span className="analysis-type-list" style={{ flex: 1 }}>{item.type}</span>
            <span className="analysis-type-mono-sm" style={{ color: "var(--text-secondary)" }}>
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
    <div
      className="analysis-holding-row"
      style={{ "--holding-accent": color } as React.CSSProperties}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="analysis-holding-row__avatar">{label[0]}</div>
        <div>
          <div className="analysis-holding-row__title">{label}</div>
          {pnl !== undefined && (
            <div
              className="analysis-holding-row__sub"
              style={{ color: pnl >= 0 ? "var(--color-success)" : "var(--color-danger)" }}
            >
              {pnl >= 0 ? "+" : ""}{fmt(pnl)} ({pnlPct}%)
            </div>
          )}
        </div>
      </div>
      <span className="analysis-holding-row__amount">{fmt(Math.round(animated))}</span>
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
    <Card accent="var(--color-primary)">
      <SectionHeader icon={BarChart3} title={t("analysis.monthlySavingTrend")} accent="var(--color-primary)" />

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
                      <div className="analysis-type-caption">{d.month}</div>
                      <div className="analysis-type-mono-sm" style={{ color: isAbove ? "var(--color-success)" : "var(--color-danger)" }}>
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

// ── Module 6: Flow-Stock Connection ──────────────────────────────

function FlowStockPanel({
  flowMetrics,
  stockMetrics,
  t,
}: {
  flowMetrics: FlowMetrics;
  stockMetrics: StockMetrics;
  t: (k: string) => string;
}) {
  return (
    <Card accent="var(--color-primary)">
      <SectionHeader icon={ArrowRightLeft} title="流量 → 存量 联动" accent="var(--color-primary)" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
        <MetricMiniCard
          label="月收入"
          value={fmtFull(flowMetrics.monthly_income)}
          color="#16a34a"
        />
        <MetricMiniCard
          label="月支出"
          value={fmtFull(flowMetrics.monthly_expense)}
          color="#dc2626"
        />
        <MetricMiniCard
          label="月净储蓄"
          value={fmtFull(flowMetrics.monthly_net_saving)}
          color={flowMetrics.monthly_net_saving >= 0 ? "#16a34a" : "#dc2626"}
        />
        <MetricMiniCard
          label={t("analysis.savingsRate")}
          value={`${flowMetrics.savings_rate}%`}
          color={flowMetrics.savings_rate >= 50 ? "#16a34a" : "#d97706"}
        />
        <MetricMiniCard
          label="净资产增长率"
          value={`${stockMetrics.asset_growth_rate}%`}
          color="#16a34a"
        />
      </div>
    </Card>
  );
}

function MetricMiniCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="analysis-stat-tile analysis-stat-tile--center"
      style={{ "--tile-accent": color } as React.CSSProperties}
    >
      <div className="analysis-stat-tile__label">{label}</div>
      <div className="analysis-stat-tile__value" style={{ color }}>{value}</div>
    </div>
  );
}

// ── Module 7: Asset Allocation Chart ────────────────────────────

function AssetAllocationPanel({
  assetAllocation,
  t,
}: {
  assetAllocation: AssetAllocationItem[];
  t: (k: string) => string;
}) {
  const totalInvestable = assetAllocation
    .filter((a) => a.is_investable)
    .reduce((s, a) => s + a.amount, 0);
  const totalNonInvestable = assetAllocation
    .filter((a) => !a.is_investable)
    .reduce((s, a) => s + a.amount, 0);
  const total = totalInvestable + totalNonInvestable;

  const ALLOC_COLORS_INVEST = ["var(--color-primary)", "var(--color-success)", "var(--color-accent)", "#0891b2"];
  const ALLOC_COLORS_NON = ["#9ca3af", "#6b7280", "#d1d5db"];

  return (
    <Card fill accent="var(--color-accent)">
      <SectionHeader icon={Landmark} title="资产配置" accent="var(--color-accent)" />
      {assetAllocation.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>暂无资产数据</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Investable assets */}
          {totalInvestable > 0 && (
            <div>
              <div className="analysis-type-group-title" style={{ color: "var(--color-primary)", marginBottom: 10 }}>
                可投资资产 (FIRE 引擎) — {fmtFull(totalInvestable)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {assetAllocation
                  .filter((a) => a.is_investable)
                  .map((item, i) => (
                    <div key={item.category} className="analysis-list-row">
                      <div className="analysis-list-row__swatch" style={{ background: ALLOC_COLORS_INVEST[i % ALLOC_COLORS_INVEST.length] }} />
                      <span className="analysis-type-list" style={{ flex: 1 }}>{item.category}</span>
                      <span className="analysis-type-mono-sm" style={{ color: "var(--text-secondary)", minWidth: 88, textAlign: "right" }}>{fmtFull(item.amount)}</span>
                      <span className="analysis-type-mono-sm" style={{ color: "var(--text-tertiary)", minWidth: 44, textAlign: "right" }}>{item.percentage}%</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {/* Non-investable assets */}
          {totalNonInvestable > 0 && (
            <div>
              <div className="analysis-type-group-title" style={{ color: "var(--text-tertiary)", marginBottom: 10 }}>
                非投资资产 — {fmtFull(totalNonInvestable)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {assetAllocation
                  .filter((a) => !a.is_investable)
                  .map((item, i) => (
                    <div key={item.category} className="analysis-list-row">
                      <div className="analysis-list-row__swatch" style={{ background: ALLOC_COLORS_NON[i % ALLOC_COLORS_NON.length] }} />
                      <span className="analysis-type-list" style={{ color: "var(--text-secondary)", flex: 1 }}>{item.category}</span>
                      <span className="analysis-type-mono-sm" style={{ color: "var(--text-secondary)", minWidth: 88, textAlign: "right" }}>{fmtFull(item.amount)}</span>
                      <span className="analysis-type-mono-sm" style={{ color: "var(--text-tertiary)", minWidth: 44, textAlign: "right" }}>{item.percentage}%</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Module 8: Liability Breakdown ───────────────────────────────

function LiabilityBreakdownPanel({
  liabilityBreakdown,
  stockMetrics,
  t,
}: {
  liabilityBreakdown: LiabilityBreakdownItem[];
  stockMetrics: StockMetrics;
  t: (k: string) => string;
}) {
  return (
    <Card fill accent="var(--color-danger)">
      <SectionHeader icon={AlertTriangle} title="负债分析" accent="var(--color-danger)" />
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div className="analysis-stat-tile analysis-stat-tile--center" style={{ flex: 1, "--tile-accent": stockMetrics.debt_ratio > 50 ? "var(--color-danger)" : stockMetrics.debt_ratio > 30 ? "var(--color-warning)" : "var(--color-success)" } as React.CSSProperties}>
          <div className="analysis-stat-tile__label">债务比率</div>
          <div className="analysis-stat-tile__value" style={{ color: stockMetrics.debt_ratio > 50 ? "var(--color-danger)" : stockMetrics.debt_ratio > 30 ? "var(--color-warning)" : "var(--color-success)" }}>
            {stockMetrics.debt_ratio}%
          </div>
        </div>
        <div className="analysis-stat-tile analysis-stat-tile--center" style={{ flex: 1, "--tile-accent": "var(--color-danger)" } as React.CSSProperties}>
          <div className="analysis-stat-tile__label">总负债</div>
          <div className="analysis-stat-tile__value" style={{ color: "var(--color-danger)" }}>
            {fmtFull(stockMetrics.total_liabilities)}
          </div>
        </div>
      </div>
      {/* Liability list */}
      {liabilityBreakdown.length === 0 ? (
        <div style={{ padding: 16, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>暂无负债</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {liabilityBreakdown.map((item) => (
            <div
              key={item.category}
              className="analysis-list-row"
              style={{
                background: item.is_high_interest
                  ? "color-mix(in srgb, var(--color-danger) 5%, var(--bg-page))"
                  : undefined,
              }}
            >
              <span className="analysis-type-list" style={{ flex: 1 }}>
                {item.category}
                {item.is_high_interest && (
                  <span style={{ marginLeft: 6, fontSize: 12, color: "var(--color-danger)", fontWeight: 600 }}>
                    高息
                  </span>
                )}
              </span>
              <span className="analysis-type-mono-sm" style={{ color: "var(--color-danger)", minWidth: 88, textAlign: "right" }}>{fmtFull(item.amount)}</span>
              <span className="analysis-type-mono-sm" style={{ color: "var(--text-tertiary)", minWidth: 44, textAlign: "right" }}>{item.percentage}%</span>
            </div>
          ))}
        </div>
      )}
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
      <div className="page" style={{ padding: "32px 0" }}>
        <style>{ANALYSIS_STYLES}</style>
        <div style={{ padding: "0 32px", display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ padding: "0 0 16px 0" }}>
            <div className="analysis-skeleton" style={{ width: 260, height: 32, animationDelay: "0ms" }} />
            <div className="analysis-skeleton" style={{ width: 180, height: 14, marginTop: 10, animationDelay: "80ms" }} />
          </div>
          <div className="analysis-skeleton" style={{ height: 320, animationDelay: "160ms" }} />
          <div className="analysis-skeleton" style={{ height: 140, animationDelay: "240ms" }} />
          <div className="analysis-skeleton" style={{ height: 120, animationDelay: "320ms" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div className="analysis-skeleton" style={{ height: 220, animationDelay: "400ms" }} />
            <div className="analysis-skeleton" style={{ height: 220, animationDelay: "480ms" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div className="analysis-skeleton" style={{ height: 200, animationDelay: "560ms" }} />
            <div className="analysis-skeleton" style={{ height: 200, animationDelay: "640ms" }} />
          </div>
          <div className="analysis-skeleton" style={{ height: 200, animationDelay: "720ms" }} />
        </div>
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

  const cardDelays = [0, 80, 160, 240, 320, 400, 480, 560];

  return (
    <div className="page" style={{ display: "flex", flexDirection: "column", gap: 24, padding: "32px 0" }}>
      <style>{ANALYSIS_STYLES}</style>

      <div className="analysis-page-header">
        <h2>
          <span className="analysis-page-header__badge">
            <Flame size={18} strokeWidth={2.2} />
          </span>
          <span>{t("analysis.title")}</span>
        </h2>
        <p className="analysis-type-page-desc" style={{ margin: 0, maxWidth: 560 }}>
          Financial Independence, Retire Early — 追踪储蓄率、资产增长与财务自由路径
        </p>
      </div>

      <div style={{ padding: "0 32px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* 1. FIRE Core Dashboard — Split into two cards */}
        <CardRow variant="fire" style={{ animationDelay: `${cardDelays[0]}ms` }}>
          <FireProgressCard fire={data.fire} t={t} />
          <FireMetricsCard fire={data.fire} stockMetrics={data.stock_metrics} t={t} />
        </CardRow>

        {/* 6. Flow-Stock Connection */}
        {data.flow_metrics && data.stock_metrics && (
          <div style={{ animationDelay: `${cardDelays[1]}ms` }}>
            <FlowStockPanel flowMetrics={data.flow_metrics} stockMetrics={data.stock_metrics} t={t} />
          </div>
        )}

        {/* 2. Asset Growth & FIRE Path */}
        <div style={{ animationDelay: `${cardDelays[2]}ms` }}>
          <AssetGrowthChart data={data.asset_growth} t={t} />
        </div>

        {/* 7 & 8: Asset Allocation + Liability Breakdown (side by side) */}
        <CardRow>
          <CardCell>
            <AssetAllocationPanel assetAllocation={data.asset_allocation || []} t={t} />
          </CardCell>
          <CardCell>
            <LiabilityBreakdownPanel liabilityBreakdown={data.liability_breakdown || []} stockMetrics={data.stock_metrics} t={t} />
          </CardCell>
        </CardRow>

        {/* 3. Income & Expense Breakdown */}
        <div style={{ animationDelay: `${cardDelays[5]}ms` }}>
          <IncomeExpenseBreakdown
            currentMonth={data.current_month}
            expenseBreakdown={data.expense_breakdown}
            incomeBreakdown={data.income_breakdown}
            t={t}
          />
        </div>

        {/* 4. Investment Portfolio */}
        <div style={{ animationDelay: `${cardDelays[6]}ms` }}>
          <InvestmentPortfolio portfolio={data.investment_portfolio} t={t} />
        </div>

        {/* 5. Monthly Saving Trend */}
        <div style={{ animationDelay: `${cardDelays[7]}ms` }}>
          <MonthlySavingChart data={data.monthly_saving_trend} t={t} />
        </div>
      </div>
    </div>
  );
}
