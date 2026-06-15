/**
 * Dashboard — Premium editorial finance layout.
 *
 * Design:
 *   - Animated gradient hero with glass morphism
 *   - Metric blocks with counter animation
 *   - Card-wrapped sections with clear hierarchy
 *   - Chart cards with hover interactions
 *   - Visual rhythm through consistent spacing
 */

import { useMemo, useEffect, useState, useRef } from "react";
import { LineChart } from "../components/dashboard/LineChart";
import type { LineChartItem } from "../components/dashboard/LineChart";
import { BarChart } from "../components/dashboard/BarChart";
import type { BarChartItem } from "../components/dashboard/BarChart";
import { PieChart } from "../components/dashboard/PieChart";
import type { PieChartItem } from "../components/dashboard/PieChart";
import { RecentTransactions } from "../components/dashboard/RecentTransactions";
import { CHART_COLORS } from "../lib/categoryStore";
import { useTranslation } from "../i18n";
import {
  useSummary,
  useTransactions,
  useMonthlyTrend,
} from "../hooks/useLedger";
import { fetchSavingsGoals, fetchAllTimeSummary } from "../lib/api";
import type { SavingsGoal, TransactionSummary } from "../lib/types";

/* ── Premium Metric Block ───────────────────────────────────── */

function MetricBlock({
  label,
  value,
  trend,
  delay = 0,
}: {
  label: string;
  value: string;
  trend?: number;
  delay?: number;
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

/* ── Dashboard ──────────────────────────────────────────────── */

export default function Dashboard() {
  const { t } = useTranslation();
  const [categoryPeriod, setCategoryPeriod] = useState<"day" | "month" | "year">("month");
  const now = new Date();
  const categoryDateStr = categoryPeriod === "day"
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    : categoryPeriod === "year"
      ? String(now.getFullYear())
      : undefined;
  const { data: summary, loading: summaryLoading } = useSummary(undefined, categoryPeriod, categoryDateStr);
  const { data: transactions } = useTransactions();
  const [trendPeriod, setTrendPeriod] = useState<"day" | "month" | "year">("day");
  const [trendCount, setTrendCount] = useState(14);
  const [trendChartType, setTrendChartType] = useState<"line" | "bar">("line");
  const { data: trendData, loading: trendLoading } = useMonthlyTrend(trendCount, trendPeriod);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [allTimeSummary, setAllTimeSummary] = useState<TransactionSummary | null>(null);

  useEffect(() => {
    fetchSavingsGoals().then(setSavingsGoals).catch(() => {});
    fetchAllTimeSummary().then(setAllTimeSummary).catch(() => {});
  }, []);

  const income = allTimeSummary?.total_income ?? summary?.total_income ?? 0;
  const expense = allTimeSummary?.total_expense ?? summary?.total_expense ?? 0;
  const saving = useMemo(
    () => savingsGoals.reduce((sum, g) => sum + g.current_amount, 0),
    [savingsGoals]
  );
  const savingT = summary?.net_saving ?? 0;
  const totalSaving = savingT + saving;
  const savingRate = income > 0 ? ((totalSaving / income) * 100).toFixed(1) : "0.0";

  // Category pie data
  const categoryData = useMemo(() => {
    const cats = summary?.categories ?? [];
    return cats
      .filter((c) => c.total_expense > 0)
      .sort((a, b) => b.total_expense - a.total_expense)
      .slice(0, 8)
      .map((c, i) => ({
        label: c.category,
        value: c.total_expense,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [summary]);

  // Line chart data
  const lineData = useMemo(
    () =>
      trendData.map((t) => ({
        label: t.label || t.month?.slice(5) || "",
        value: t.expense,
        income: t.income,
      })),
    [trendData],
  );

  // Month-over-month trends
  const incomeTrend = useMemo(() => {
    if (trendData.length < 2) return undefined;
    const prev = trendData[trendData.length - 2]?.income ?? 0;
    const curr = trendData[trendData.length - 1]?.income ?? 0;
    return prev === 0 ? undefined : ((curr - prev) / prev) * 100;
  }, [trendData]);

  const expenseTrend = useMemo(() => {
    if (trendData.length < 2) return undefined;
    const prev = trendData[trendData.length - 2]?.expense ?? 0;
    const curr = trendData[trendData.length - 1]?.expense ?? 0;
    return prev === 0 ? undefined : ((curr - prev) / prev) * 100;
  }, [trendData]);

  const savingTrend = useMemo(() => {
    if (trendData.length < 2) return undefined;
    const prevSaving = (trendData[trendData.length - 2]?.income ?? 0) - (trendData[trendData.length - 2]?.expense ?? 0);
    const currSaving = (trendData[trendData.length - 1]?.income ?? 0) - (trendData[trendData.length - 1]?.expense ?? 0);
    return prevSaving === 0 ? undefined : ((currSaving - prevSaving) / Math.abs(prevSaving)) * 100;
  }, [trendData]);

  // Saving rate grade
  const rate = parseFloat(savingRate);
  let grade = "需提升";
  let gradeColor = "var(--color-danger)";
  if (rate < 0) {
    grade = "超支";
    gradeColor = "var(--color-danger)";
  } else if (rate >= 40) {
    grade = "优秀";
    gradeColor = "var(--color-success)";
  } else if (rate >= 20) {
    grade = "良好";
    gradeColor = "var(--color-primary)";
  } else if (rate >= 10) {
    grade = "一般";
    gradeColor = "var(--color-warning)";
  }

  const handleLineDotClick = (index: number, item: LineChartItem) => {
    console.log(`[Dashboard] LineChart dot clicked: ${item.label} = ¥${item.value}`);
  };

  const totalCategoryExpense = categoryData.reduce((s, d) => s + d.value, 0);

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* ═══ Hero: Key Metrics ═══ */}
      <section className="hero-card">
        <div style={{ display: "flex", gap: 12 }}>
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
            label={t("dashboard.savingRate")}
            value={`${savingRate}%`}
            delay={120}
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
              {trendPeriod === "day" ? "每日" : trendPeriod === "month" ? "每月" : "每年"}收支走势
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* Period segmented control */}
            <div
              style={{
                display: "flex",
                padding: 3,
                borderRadius: 10,
                background: "var(--border-subtle)",
                gap: 2,
              }}>
              {(["day", "month", "year"] as const).map((p) => {
                const active = trendPeriod === p;
                return (
                  <button
                    key={p}
                    onClick={() => {
                      setTrendPeriod(p);
                      setTrendCount(p === "day" ? 14 : p === "month" ? 12 : 5);
                    }}
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
                    }}
                  >
                    {p === "day" ? "日" : p === "month" ? "月" : "年"}
                  </button>
                );
              })}
            </div>
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
                    {/* Icon */}
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
        <ChartTransition loading={trendLoading} periodKey={`${trendPeriod}-${trendChartType}`}>
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
                {/* Period segmented control */}
                <div
                  style={{
                    display: "flex",
                    padding: 2,
                    borderRadius: 8,
                    background: "var(--border-subtle)",
                    gap: 1,
                  }}>
                  {(["day", "month", "year"] as const).map((p) => {
                    const active = categoryPeriod === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setCategoryPeriod(p)}
                        style={{
                          padding: "3px 10px",
                          fontSize: 11,
                          fontWeight: 500,
                          borderRadius: 6,
                          border: "none",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          background: active ? "var(--bg-surface)" : "transparent",
                          color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                          boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                        }}
                      >
                        {p === "day" ? "日" : p === "month" ? "月" : "年"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
                {categoryPeriod === "day" ? "今日" : categoryPeriod === "month" ? "本月" : "本年"}消费结构
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
            <ChartTransition loading={summaryLoading} periodKey={categoryPeriod}>
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
            {t("dashboard.savingRate")}
          </h3>
          {/* Circular progress */}
          {(() => {
            const displayLen = savingRate.length;
            const numFontSize = displayLen <= 4 ? 28 : displayLen <= 6 ? 24 : displayLen <= 8 ? 20 : 16;
            const pctFontSize = Math.round(numFontSize * 0.55);
            return (
              <div
                style={{
                  width: 150,
                  height: 150,
                  borderRadius: "50%",
                  background: `conic-gradient(${gradeColor} ${Math.min(Math.max(rate, 0), 100) * 3.6}deg, var(--border-subtle) 0deg)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 0 28px ${gradeColor}15`,
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
                  <span className="num-display" style={{ fontSize: numFontSize, fontWeight: 700, color: gradeColor, lineHeight: 1, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                    {savingRate}
                    <span style={{ fontSize: pctFontSize, fontWeight: 500, marginLeft: 1 }}>%</span>
                  </span>
                </div>
              </div>
            );
          })()}
          {/* Grade badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 14px",
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 600,
              color: gradeColor,
              background: `${gradeColor}10`,
              marginBottom: 16,
              letterSpacing: "0.02em",
            }}
          >
            {grade}
          </div>
          {/* Legend */}
          <div style={{ width: "100%", borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
            {[
              { label: "≥ 40%", desc: "优秀", color: "var(--color-success)" },
              { label: "20–40%", desc: "良好", color: "var(--color-primary)" },
              { label: "10–20%", desc: "一般", color: "var(--color-warning)" },
              { label: "< 10%", desc: "需提升", color: "var(--color-danger)" },
              { label: "< 0%", desc: "超支", color: "var(--color-danger)" },
            ].map((item) => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0", fontSize: 11, color: "var(--text-tertiary)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text-secondary)", minWidth: 44 }}>{item.label}</span>
                <span>{item.desc}</span>
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
