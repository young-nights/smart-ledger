/**
 * Dashboard — Premium editorial finance layout.
 *
 * Design:
 *   - Animated gradient hero with glass morphism
 *   - Metric blocks with counter animation
 *   - Card-wrapped sections with clear hierarchy
 *   - Chart cards with hover interactions
 *   - Visual rhythm through consistent spacing
 *
 * Date Filtering:
 *   Cascading year/month/day selectors (same UX as Transactions page).
 *   "All" → API summary; specific date → local computation from transactions.
 */

import { useMemo, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { LineChart } from "../components/dashboard/LineChart";
import type { LineChartItem } from "../components/dashboard/LineChart";
import { BarChart } from "../components/dashboard/BarChart";
import type { BarChartItem } from "../components/dashboard/BarChart";
import { PieChart } from "../components/dashboard/PieChart";
import type { PieChartItem } from "../components/dashboard/PieChart";
import { RecentTransactions } from "../components/dashboard/RecentTransactions";
import { CHART_COLORS } from "../lib/categoryStore";
import { Calendar } from "../components/ui/Calendar";
import { useTranslation } from "../i18n";
import {
  useSummary,
  useTransactions,
} from "../hooks/useLedger";
import { fetchSavingsGoals, fetchAllTimeSummary } from "../lib/api";
import type { SavingsGoal, TransactionSummary } from "../lib/types";
import { SavingsLeverageTooltip } from "../components/dashboard/SavingsLeverageTooltip";

/* ── Premium Metric Block ───────────────────────────────────── */

function MetricBlock({
  label,
  value,
  trend,
  delay = 0,
  tooltip,
}: {
  label: string;
  value: string;
  trend?: number;
  delay?: number;
  tooltip?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        padding: "24px 20px",
        background: hovered ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.06)",
        borderRadius: 16,
        border: "1px solid rgba(255, 255, 255, 0.08)",
        transition: `all 0.4s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms`,
        cursor: "default",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        boxShadow: hovered
          ? "0 12px 32px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1)"
          : "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "rgba(255, 255, 255, 0.5)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginBottom: 10,
          fontWeight: 500,
        }}
      >
        {label}
        {tooltip && <span style={{ marginLeft: 4, verticalAlign: "middle" }}>{tooltip}</span>}
      </div>
      <div
        style={{
          fontSize: 32,
          fontWeight: 700,
          color: "#ffffff",
          fontFamily: "var(--font-mono)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          transition: "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
          transform: hovered ? "scale(1.02)" : "scale(1)",
        }}
      >
        {value}
      </div>
      {trend !== undefined && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: trend >= 0 ? "#7ce0a0" : "#ff8a80",
            opacity: hovered ? 1 : 0.8,
            transition: "opacity 0.3s",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              borderRadius: 5,
              background: trend >= 0 ? "rgba(124, 224, 160, 0.15)" : "rgba(255, 138, 128, 0.15)",
              fontSize: 10,
            }}
          >
            {trend >= 0 ? "↑" : "↓"}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
            {Math.abs(trend).toFixed(1)}%
          </span>
          <span style={{ color: "rgba(255, 255, 255, 0.35)", fontSize: 11 }}>
            vs 上月
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Chart Transition — crossfade wrapper ─────────────────── */

function ChartTransition({
  children,
  loading,
  periodKey,
}: {
  children: React.ReactNode;
  loading: boolean;
  periodKey: string;
}) {
  const [visible, setVisible] = useState(false);
  const [displayChildren, setDisplayChildren] = useState(children);
  const prevKeyRef = useRef(periodKey);

  useEffect(() => {
    if (periodKey !== prevKeyRef.current) {
      // Fade out
      setVisible(false);
      const timer = setTimeout(() => {
        prevKeyRef.current = periodKey;
        setDisplayChildren(children);
        // Fade in
        requestAnimationFrame(() => setVisible(true));
      }, 180);
      return () => clearTimeout(timer);
    } else {
      setDisplayChildren(children);
      setVisible(true);
    }
  }, [periodKey, children]);

  return (
    <div
      style={{
        opacity: loading ? 0.4 : visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 0.25s cubic-bezier(0.25, 1, 0.5, 1), transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
      }}
    >
      {displayChildren}
    </div>
  );
}

/* ── Leverage Grade Helper ────────────────────────────────────── */

function getLeverageGrade(r: number) {
  if (r < 0) return { label: "严重超支", color: "#ff4757" };
  if (r < 0.5) return { label: "需提升", color: "#ffa502" };
  if (r < 1.0) return { label: "良好", color: "#2ed573" };
  if (r < 2.0) return { label: "优秀", color: "#00d4ff" };
  return { label: "极佳", color: "#a855f7" };
}

/* ── Dashboard ──────────────────────────────────────────────── */

export default function Dashboard() {
  const { t } = useTranslation();

  // ── Cascading date filters (same UX as Transactions page) ──
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [showDayCalendar, setShowDayCalendar] = useState(false);
  const dayButtonRef = useRef<HTMLButtonElement>(null);

  const isFilterAll = yearFilter === "all";

  // ── API data (used when no date filter) ──
  const now = new Date();
  const { data: summary, loading: summaryLoading } = useSummary();
  const { data: transactions } = useTransactions();
  const [trendChartType, setTrendChartType] = useState<"line" | "bar">("line");
  // Trend data is computed locally based on date filters (no API call needed)
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [allTimeSummary, setAllTimeSummary] = useState<TransactionSummary | null>(null);

  useEffect(() => {
    fetchSavingsGoals().then(setSavingsGoals).catch(() => {});
    fetchAllTimeSummary().then(setAllTimeSummary).catch(() => {});
  }, []);

  // ── Extract unique years, months, days from transactions ──
  const { years, months, days } = useMemo(() => {
    const yearSet = new Set<string>();
    const monthSet = new Set<string>();
    const daySet = new Set<string>();
    transactions.forEach((t) => {
      const parts = t.date.split("-");
      if (parts.length >= 3) {
        yearSet.add(parts[0]);
        monthSet.add(parts[1]);
        daySet.add(parts[2]);
      }
    });
    return {
      years: Array.from(yearSet).sort().reverse(),
      months: Array.from(monthSet).sort(),
      days: Array.from(daySet).sort(),
    };
  }, [transactions]);

  // ── Filter transactions by date (when filter is active) ──
  const filteredTxns = useMemo(() => {
    return transactions.filter((t) => {
      const parts = t.date.split("-");
      if (yearFilter !== "all" && parts[0] !== yearFilter) return false;
      if (monthFilter !== "all" && parts[1] !== monthFilter) return false;
      if (dayFilter !== "all" && parts[2] !== dayFilter) return false;
      return true;
    });
  }, [transactions, yearFilter, monthFilter, dayFilter]);

  // ── Compute metrics from filtered transactions ──
  const localSummary = useMemo(() => {
    if (isFilterAll) return null;
    const filtered = filteredTxns;
    const totalIncome = filtered
      .filter((t) => t.is_income)
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = filtered
      .filter((t) => !t.is_income)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    // Build category breakdown
    const catMap = new Map<string, number>();
    filtered
      .filter((t) => !t.is_income)
      .forEach((t) => {
        catMap.set(t.category, (catMap.get(t.category) || 0) + Math.abs(t.amount));
      });
    const categories = Array.from(catMap.entries()).map(([category, total_expense]) => ({
      category,
      total_expense,
    }));
    return {
      total_income: totalIncome,
      total_expense: totalExpense,
      net_saving: totalIncome - totalExpense,
      categories,
    };
  }, [filteredTxns, isFilterAll]);

  // ── Aggregate trend data based on filter granularity ──
  const computedTrendData = useMemo(() => {
    // Determine aggregation granularity based on active filters
    const srcTxns = isFilterAll ? transactions : filteredTxns;

    if (monthFilter === "all" && dayFilter === "all") {
      // Aggregate by month: all months from earliest record to now
      const monthMap = new Map<string, { income: number; expense: number }>();
      srcTxns.forEach((t) => {
        const monthKey = t.date.slice(0, 7);
        const entry = monthMap.get(monthKey) || { income: 0, expense: 0 };
        if (t.is_income) entry.income += t.amount;
        else entry.expense += Math.abs(t.amount);
        monthMap.set(monthKey, entry);
      });
      // Generate all months from earliest transaction to current month
      if (monthMap.size === 0) return [];
      const sortedKeys = Array.from(monthMap.keys()).sort();
      const earliest = sortedKeys[0];
      const nowDate = new Date();
      const latest = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`;
      const allMonths: string[] = [];
      let [y, m] = earliest.split("-").map(Number);
      const [ey, em] = latest.split("-").map(Number);
      while (y < ey || (y === ey && m <= em)) {
        allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
        m++;
        if (m > 12) { m = 1; y++; }
      }
      return allMonths.map((month) => {
        const data = monthMap.get(month) || { income: 0, expense: 0 };
        return {
          month,
          label: `${month.slice(0, 4)}-${parseInt(month.slice(5))}月`,
          income: data.income,
          expense: data.expense,
        };
      });
    } else if (dayFilter === "all") {
      // Aggregate by day: all days in the selected month
      const dayMap = new Map<string, { income: number; expense: number }>();
      srcTxns.forEach((t) => {
        const parts = t.date.split("-");
        if (parts[0] === yearFilter && parts[1] === monthFilter) {
          const dayKey = parts[2];
          const entry = dayMap.get(dayKey) || { income: 0, expense: 0 };
          if (t.is_income) entry.income += t.amount;
          else entry.expense += Math.abs(t.amount);
          dayMap.set(dayKey, entry);
        }
      });
      // Generate all days in the selected month
      const daysInMonth = new Date(parseInt(yearFilter), parseInt(monthFilter), 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        const data = dayMap.get(day) || { income: 0, expense: 0 };
        return {
          month: `${yearFilter}-${monthFilter}-${day}`,
          label: `${i + 1}日`,
          income: data.income,
          expense: data.expense,
        };
      });
    } else {
      // Aggregate by hour: all 24 hours of the selected day
      const hourMap = new Map<number, { income: number; expense: number }>();
      srcTxns.forEach((t) => {
        const parts = t.date.split("-");
        if (parts[0] === yearFilter && parts[1] === monthFilter && parts[2] === dayFilter) {
          const hour = t.created_at ? new Date(t.created_at).getHours() : 0;
          const entry = hourMap.get(hour) || { income: 0, expense: 0 };
          if (t.is_income) entry.income += t.amount;
          else entry.expense += Math.abs(t.amount);
          hourMap.set(hour, entry);
        }
      });
      return Array.from({ length: 24 }, (_, i) => {
        const data = hourMap.get(i) || { income: 0, expense: 0 };
        return {
          month: `${yearFilter}-${monthFilter}-${dayFilter}T${String(i).padStart(2, "0")}`,
          label: `${i}时`,
          income: data.income,
          expense: data.expense,
        };
      });
    }
  }, [transactions, filteredTxns, isFilterAll, yearFilter, monthFilter, dayFilter]);

  // ── Active data sources ──
  const activeSummary = isFilterAll ? summary : localSummary;
  const activeTrendData = computedTrendData;

  const income = isFilterAll
    ? (allTimeSummary?.total_income ?? activeSummary?.total_income ?? 0)
    : (activeSummary?.total_income ?? 0);
  const expense = isFilterAll
    ? (allTimeSummary?.total_expense ?? activeSummary?.total_expense ?? 0)
    : (activeSummary?.total_expense ?? 0);
  const saving = useMemo(
    () => savingsGoals.reduce((sum, g) => sum + g.current_amount, 0),
    [savingsGoals]
  );
  const savingT = activeSummary?.net_saving ?? 0;
  const totalSaving = savingT + saving;
  const savingsLeverage = expense > 0 ? ((totalSaving / expense) * 100).toFixed(1) : "0.0";

  // Category pie data
  const categoryData = useMemo(() => {
    const cats = activeSummary?.categories ?? [];
    return cats
      .filter((c) => c.total_expense > 0)
      .sort((a, b) => b.total_expense - a.total_expense)
      .map((c, i) => ({
        label: c.category,
        value: c.total_expense,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [activeSummary]);

  // Line chart data
  const lineData = useMemo(
    () =>
      activeTrendData.map((t: any) => ({
        label: t.label || t.month?.slice(5) || "",
        value: t.expense,
        income: t.income,
      })),
    [activeTrendData],
  );

  // Month-over-month trends
  const incomeTrend = useMemo(() => {
    if (activeTrendData.length < 2) return undefined;
    const prev = activeTrendData[activeTrendData.length - 2]?.income ?? 0;
    const curr = activeTrendData[activeTrendData.length - 1]?.income ?? 0;
    return prev === 0 ? undefined : ((curr - prev) / prev) * 100;
  }, [activeTrendData]);

  const expenseTrend = useMemo(() => {
    if (activeTrendData.length < 2) return undefined;
    const prev = activeTrendData[activeTrendData.length - 2]?.expense ?? 0;
    const curr = activeTrendData[activeTrendData.length - 1]?.expense ?? 0;
    return prev === 0 ? undefined : ((curr - prev) / prev) * 100;
  }, [activeTrendData]);

  const savingTrend = useMemo(() => {
    if (activeTrendData.length < 2) return undefined;
    const prevSaving = (activeTrendData[activeTrendData.length - 2]?.income ?? 0) - (activeTrendData[activeTrendData.length - 2]?.expense ?? 0);
    const currSaving = (activeTrendData[activeTrendData.length - 1]?.income ?? 0) - (activeTrendData[activeTrendData.length - 1]?.expense ?? 0);
    return prevSaving === 0 ? undefined : ((currSaving - prevSaving) / Math.abs(prevSaving)) * 100;
  }, [activeTrendData]);

  // Leverage ratio (as ratio, not percentage)
  const rate = parseFloat(savingsLeverage) / 100;
  const leverageGrade = getLeverageGrade(rate);

  const handleLineDotClick = (index: number, item: LineChartItem) => {
    console.log(`[Dashboard] LineChart dot clicked: ${item.label} = ¥${item.value}`);
  };

  const totalCategoryExpense = categoryData.reduce((s, d) => s + d.value, 0);

  // ── Date filter description label ──
  const dateLabel = useMemo(() => {
    if (dayFilter !== "all") return "当日";
    if (monthFilter !== "all") return "本月";
    if (yearFilter !== "all") return "本年";
    return "";
  }, [yearFilter, monthFilter, dayFilter]);

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ═══ Date Filter Bar ═══ */}
      <section className="elevated-card" style={{ padding: "12px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>筛选</span>

          {/* Year */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 24 }}>年</span>
            <select
              value={yearFilter}
              onChange={(e) => {
                const val = e.target.value;
                setYearFilter(val);
                if (val === "all") {
                  setMonthFilter("all");
                  setDayFilter("all");
                } else {
                  setDayFilter("all");
                }
              }}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                cursor: "pointer",
              }}
            >
              <option value="all">全部</option>
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Month */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: yearFilter === "all" ? "var(--neutral-300)" : "var(--text-tertiary)", minWidth: 24 }}>月</span>
            <select
              value={monthFilter}
              onChange={(e) => {
                const val = e.target.value;
                setMonthFilter(val);
                setDayFilter("all");
              }}
              disabled={yearFilter === "all"}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                cursor: yearFilter === "all" ? "not-allowed" : "pointer",
                opacity: yearFilter === "all" ? 0.5 : 1,
              }}
            >
              <option value="all">全部</option>
              {months.map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>

          {/* Day — calendar popup */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
            <span style={{ fontSize: 11, color: yearFilter === "all" || monthFilter === "all" ? "var(--neutral-300)" : "var(--text-tertiary)", minWidth: 24 }}>日</span>
            <button
              ref={dayButtonRef}
              onClick={() => {
                if (yearFilter !== "all" && monthFilter !== "all") {
                  setShowDayCalendar(!showDayCalendar);
                }
              }}
              disabled={yearFilter === "all" || monthFilter === "all"}
              style={{
                padding: "4px 12px",
                fontSize: 12,
                borderRadius: 6,
                border: "1px solid var(--border-subtle)",
                background: dayFilter !== "all" ? "var(--color-primary-light)" : "var(--bg-surface)",
                color: dayFilter !== "all" ? "var(--color-primary)" : "var(--text-primary)",
                cursor: yearFilter === "all" || monthFilter === "all" ? "not-allowed" : "pointer",
                opacity: yearFilter === "all" || monthFilter === "all" ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: "all 0.15s",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {dayFilter !== "all" ? `${dayFilter}日` : "选择日期"}
            </button>

            {dayFilter !== "all" && (
              <button
                onClick={() => setDayFilter("all")}
                style={{
                  padding: "2px 6px",
                  fontSize: 10,
                  borderRadius: 4,
                  border: "none",
                  background: "var(--neutral-100)",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            )}

            {showDayCalendar && createPortal(
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 99 }}
                  onClick={() => setShowDayCalendar(false)}
                />
                <div
                  ref={(el) => {
                    if (el && dayButtonRef.current) {
                      const rect = dayButtonRef.current.getBoundingClientRect();
                      el.style.position = "fixed";
                      el.style.top = `${rect.bottom + 8}px`;
                      el.style.left = `${rect.left}px`;
                      el.style.zIndex = "100";
                    }
                  }}
                >
                  <Calendar
                    selected={dayFilter !== "all" ? new Date(parseInt(yearFilter), parseInt(monthFilter) - 1, parseInt(dayFilter)) : null}
                    onSelect={(date) => {
                      if (date) {
                        setYearFilter(String(date.getFullYear()));
                        setMonthFilter(String(date.getMonth() + 1).padStart(2, "0"));
                        setDayFilter(String(date.getDate()).padStart(2, "0"));
                      } else {
                        setDayFilter("all");
                      }
                      setShowDayCalendar(false);
                    }}
                    onToday={() => {
                      const today = new Date();
                      setYearFilter(String(today.getFullYear()));
                      setMonthFilter(String(today.getMonth() + 1).padStart(2, "0"));
                      setDayFilter(String(today.getDate()).padStart(2, "0"));
                      setShowDayCalendar(false);
                    }}
                  />
                </div>
              </>,
              document.body
            )}
          </div>

          {/* Active filter indicator */}
          {!isFilterAll && (
            <span style={{ fontSize: 11, color: "var(--color-primary)", fontWeight: 500 }}>
              {yearFilter}{monthFilter !== "all" ? `/${monthFilter}` : ""}{dayFilter !== "all" ? `/${dayFilter}` : ""}
            </span>
          )}
        </div>
      </section>

      {/* ═══ Hero: Key Metrics ═══ */}
      <section className="hero-card">
        <div style={{ display: "flex", gap: 12, position: "relative" }}>
          <MetricBlock
            label={t("dashboard.income")}
            value={`¥${income.toLocaleString()}`}
            trend={incomeTrend}
            delay={0}
          />
          <MetricBlock
            label={t("dashboard.expense")}
            value={`¥${expense.toLocaleString()}`}
            trend={expenseTrend}
            delay={40}
          />
          <MetricBlock
            label={t("dashboard.saving")}
            value={`¥${saving.toLocaleString()}`}
            trend={savingTrend}
            delay={80}
          />
          <MetricBlock
            label={t("dashboard.savingsLeverage")}
            value={`${savingsLeverage}%`}
            delay={120}
            tooltip={<SavingsLeverageTooltip />}
          />
        </div>
      </section>

      {/* ═══ Trend Chart — Full-width card ═══ */}
      <section className="elevated-card" style={{ padding: "20px 24px 16px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              {t("dashboard.trend")}
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
              {dateLabel ? `${dateLabel}收支走势` : "每月收支走势"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* Chart type segmented control */}
            <div
              style={{
                display: "flex",
                padding: 3,
                borderRadius: 10,
                background: "var(--border-subtle)",
                gap: 2,
              }}>
              {["line", "bar"].map((type) => {
                const active = trendChartType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setTrendChartType(type as "line" | "bar")}
                    style={{
                      padding: "5px 14px",
                      fontSize: 12,
                      fontWeight: 500,
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.2s cubic-bezier(0.25, 1, 0.5, 1)",
                      background: active ? "var(--bg-surface)" : "transparent",
                      color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                      boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: active ? 0.8 : 0.4 }}>
                      {type === "line" ? (
                        <path d="M2 12L6 8L9 10L14 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      ) : (
                        <>
                          <rect x="2" y="9" width="3" height="5" rx="0.8" fill="currentColor" opacity="0.7"/>
                          <rect x="6.5" y="5" width="3" height="9" rx="0.8" fill="currentColor" opacity="0.85"/>
                          <rect x="11" y="3" width="3" height="11" rx="0.8" fill="currentColor" opacity="1"/>
                        </>
                      )}
                    </svg>
                    {type === "line" ? "折线" : "柱状"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {/* Chart with crossfade */}
        <ChartTransition loading={false} periodKey={`${trendChartType}-${yearFilter}-${monthFilter}-${dayFilter}`}>
          {lineData.length > 0 ? (
            trendChartType === "line" ? (
              <LineChart
                data={lineData}
                height={220}
                color="#0d7377"
                showCrosshair
                onDotClick={handleLineDotClick}
              />
            ) : (
              <BarChart
                data={lineData.map((d) => ({
                  label: d.label,
                  value: d.value,
                  secondary: d.income,
                  color: CHART_COLORS[0],
                }))}
                height={220}
                showValues={false}
                sortBy="none"
              />
            )
          ) : (
            <div className="chart-placeholder">{t("common.empty")}</div>
          )}
        </ChartTransition>
      </section>

      {/* ═══ Category + Saving Rate — Two-column ═══ */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
        {/* Left: Pie chart */}
        <div className="elevated-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                  {t("dashboard.byCategory")}
                </h3>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
                {dateLabel ? `${dateLabel}消费结构` : "本月消费结构"}
              </p>
            </div>
            <span
              className="num-display"
              style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}
            >
              ¥{totalCategoryExpense.toLocaleString()}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChartTransition loading={summaryLoading} periodKey={`category-${yearFilter}-${monthFilter}-${dayFilter}`}>
              {categoryData.length > 0 ? (
                <PieChart
                  data={categoryData as PieChartItem[]}
                  size={200}
                  variant="pie"
                />
              ) : (
                <div className="chart-placeholder">{t("common.empty")}</div>
              )}
            </ChartTransition>
          </div>
        </div>

        {/* Right: Saving rate */}
        <div className="elevated-card" style={{ padding: 24, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 16px", textAlign: "center", letterSpacing: "0.02em" }}>
            {t("dashboard.savingsLeverage")}
            <span style={{ marginLeft: 6 }}>
              <SavingsLeverageTooltip />
            </span>
          </h3>
          {/* Circular progress */}
          {(() => {
            const displayLen = savingsLeverage.length;
            const numFontSize = displayLen <= 4 ? 28 : displayLen <= 6 ? 24 : displayLen <= 8 ? 20 : 16;
            const pctFontSize = Math.round(numFontSize * 0.55);
            return (
              <div
                style={{
                  width: 150,
                  height: 150,
                  borderRadius: "50%",
                  background: `conic-gradient(${leverageGrade.color} ${Math.min(Math.max(rate * 100, 0), 100) * 3.6}deg, var(--border-subtle) 0deg)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 0 28px ${leverageGrade.color}15`,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: "50%",
                    background: "var(--bg-surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span className="num-display" style={{ fontSize: numFontSize, fontWeight: 700, color: leverageGrade.color, lineHeight: 1, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                    {savingsLeverage}
                    <span style={{ fontSize: pctFontSize, fontWeight: 500, marginLeft: 1 }}>%</span>
                  </span>
                </div>
              </div>
            );
          })()}
          {/* Leverage grade badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 12px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              color: leverageGrade.color,
              background: `${leverageGrade.color}26`,
              marginBottom: 16,
            }}
          >
            {leverageGrade.label}
          </div>
          {/* Legend — leverage ratio grade scale */}
          <div style={{ width: "100%", borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
            {[
              { label: "≥ 200%", desc: "极佳", color: "#a855f7" },
              { label: "100–200%", desc: "优秀", color: "#00d4ff" },
              { label: "50–100%", desc: "良好", color: "#2ed573" },
              { label: "0–50%", desc: "需提升", color: "#ffa502" },
              { label: "< 0%", desc: "严重超支", color: "#ff4757" },
            ].map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0", fontSize: 11, color: "var(--text-tertiary)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text-secondary)", minWidth: 68 }}>{item.label}</span>
                <span style={{ color: item.color, fontWeight: 500 }}>{item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Savings Goals ═══ */}
      {savingsGoals.length > 0 && (
        <section>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>储蓄目标</h3>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>储蓄进度追踪</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {savingsGoals.map((goal) => {
              const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
              return (
                <div key={goal.id} className="elevated-card" style={{ padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{goal.name}</span>
                    <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{progress.toFixed(0)}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 12 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                      ¥{goal.current_amount.toLocaleString()}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                      / ¥{goal.target_amount.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ height: 5, background: "var(--border-light)", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(progress, 100)}%`,
                        height: "100%",
                        background: goal.color || "var(--color-primary)",
                        borderRadius: 3,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  {goal.deadline && (
                    <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
                      截止: {goal.deadline}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ Recent Transactions ═══ */}
      <section>
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            {t("dashboard.recent")}
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>最近 10 笔交易</p>
        </div>
        <div className="elevated-card">
          <RecentTransactions transactions={transactions} />
        </div>
      </section>
    </div>
  );
}
