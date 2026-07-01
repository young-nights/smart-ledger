/**
 * Savings Goals — editorial layout with progress rings and multi-currency support.
 * No card wrappers. Flat list with section dividers.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Target, Minus, Check, X, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { useTranslation } from "../i18n";
import {
  fetchSavingsGoals,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
  fetchSavingsHistory,
  fetchExchangeRates,
  syncStockPnl,
  fetchPositionSummary,
} from "../lib/api";
import type { SavingsGoal, SavingsHistoryItem, SavingsGoalCurrency } from "../lib/types";
import {
  getGoalNetSaving,
  getGoalNetSavingRate,
  getGoalPrincipal,
  splitPrincipalFromGross,
  notifySavingsGoalsUpdated,
} from "../lib/savingsMetrics";

// Supported currencies with symbols
const SUPPORTED_CURRENCIES = [
  { code: "CNY", symbol: "¥", label: "CNY ¥" },
  { code: "USD", symbol: "$", label: "USD $" },
  { code: "EUR", symbol: "€", label: "EUR €" },
  { code: "GBP", symbol: "£", label: "GBP £" },
  { code: "JPY", symbol: "¥", label: "JPY ¥" },
  { code: "HKD", symbol: "HK$", label: "HKD HK$" },
];

const CURRENCY_MAP = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c])
);

function formatAmount(amount: number, currency: string): string {
  const c = CURRENCY_MAP[currency];
  if (currency === "JPY") {
    return `${c?.symbol || ""}${Math.round(amount).toLocaleString()}`;
  }
  return `${c?.symbol || ""}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function ProgressRing({
  progress,
  size = 56,
  stroke = 4,
  color = "var(--color-primary)",
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset =
    circumference - (Math.min(progress, 100) / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        className="progress-ring__circle-bg"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        stroke="var(--border-light)"
      />
      <circle
        className="progress-ring__circle"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        stroke={color}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

function monthsUntil(dateStr: string): number {
  if (!dateStr) return 0;
  const target = new Date(dateStr);
  const now = new Date();
  const diff =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth());
  return Math.max(diff, 1);
}

function GoalCard({
  goal,
  index,
  isLast,
  totalPositionAmount,
  currentValue,
  cashBalance,
  positionCurrencies,
  onEdit,
  onDelete,
  onUpdate,
}: {
  goal: SavingsGoal;
  index: number;
  isLast: boolean;
  totalPositionAmount: number;
  currentValue: number;
  cashBalance: number;
  positionCurrencies: Array<{ currency: string; amount: number }>;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}) {
  const [editingAmount, setEditingAmount] = useState(false);
  const [editCurrencyRows, setEditCurrencyRows] = useState<Array<{currency: string; amount: number}>>([]);
  const [localAmount, setLocalAmount] = useState(goal.current_amount);
  const [localCurrencies, setLocalCurrencies] = useState(goal.currencies || []);
  const stockPnl = goal.stock_pnl ?? 0;
  const netSavingAmount = getGoalNetSaving({
    current_amount: localAmount,
    stock_pnl: stockPnl,
  });

  useEffect(() => {
    setLocalAmount(goal.current_amount);
    setLocalCurrencies(goal.currencies || []);
  }, [goal.current_amount, goal.currencies, goal.id]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(false);
  const [historyData, setHistoryData] = useState<SavingsHistoryItem[]>([]);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredDot, setHoveredDot] = useState<number | null>(null);

  useEffect(() => {
    fetchExchangeRates()
      .then(setRates)
      .catch(() => {
        setRates({ CNY: 1, USD: 7.25, EUR: 7.87, GBP: 9.18, JPY: 0.049, HKD: 0.93 });
      });
  }, []);

  const months = monthsUntil(goal.deadline);
  // Use total position amount (market value + cash) for progress tracking
  const progress = goal.target_amount > 0
    ? (totalPositionAmount / goal.target_amount) * 100
    : 0;
  const remaining = Math.max(goal.target_amount - totalPositionAmount, 0);
  const monthlyRequired = months > 0 ? remaining / months : remaining;

  // Measure container width for chart
  useEffect(() => {
    if (!expanded || !chartContainerRef.current) return;
    const el = chartContainerRef.current;
    const obs = new ResizeObserver(([entry]) =>
      setContainerWidth(entry.contentRect.width)
    );
    obs.observe(el);
    setContainerWidth(el.clientWidth);
    return () => obs.disconnect();
  }, [expanded]);

  // Fetch history when expanded
  const toggleExpand = async () => {
    if (!expanded) {
      try {
        const data = await fetchSavingsHistory(goal.id);
        setHistoryData(data);
      } catch {
        // silent
      }
    }
    setExpanded(!expanded);
  };

  async function handleSaveEditAmount() {
    // Calculate total CNY from edit rows
    // rates contain foreign->CNY multipliers (1 USD = 7.25 CNY)
    const grossTotalCNY = editCurrencyRows.reduce((sum, row) => {
      if (row.currency === "CNY") return sum + row.amount;
      const rate = rates[row.currency] || 0;
      return sum + row.amount * rate;
    }, 0);
    const principalCNY = splitPrincipalFromGross(grossTotalCNY, stockPnl);
    const scale = grossTotalCNY > 0 ? principalCNY / grossTotalCNY : 1;

    // Build currencies payload (principal per currency)
    const currenciesPayload = editCurrencyRows
      .filter(r => r.amount > 0)
      .map(r => ({ currency: r.currency, amount: Math.round(r.amount * scale * 100) / 100 }));

    // Optimistic update
    setLocalAmount(principalCNY);
    setLocalCurrencies(currenciesPayload.map((c, i) => ({ id: -i, goal_id: goal.id, ...c })));
    setEditingAmount(false);

    // Build update payload — store principal; gross = principal + stock_pnl
    const payload: any = { current_amount: principalCNY, gross_total: grossTotalCNY };
    if (currenciesPayload.length > 0) {
      payload.currencies = currenciesPayload;
    }

    try {
      await updateSavingsGoal(goal.id, payload);
      onUpdate();
    } catch {
      // Revert on error
      setLocalAmount(goal.current_amount);
    }
  }

  // Chart uses gross saved total (principal + investment gains) per history point
  const chartData = (() => {
    const today = new Date().toISOString().split("T")[0];
    const points =
      historyData.length > 0
        ? historyData.map((h) => ({
            date: h.recorded_at.split("T")[0].split(" ")[0],
            amount: h.amount,
          }))
        : [
            {
              date: goal.created_at?.split("T")[0] || today,
              amount: totalPositionAmount,
            },
          ];
    const last = points[points.length - 1];
    if (Math.abs(last.amount - totalPositionAmount) >= 0.01) {
      if (last.date === today) {
        points[points.length - 1] = { date: today, amount: totalPositionAmount };
      } else {
        points.push({ date: today, amount: totalPositionAmount });
      }
    }
    return points;
  })();

  return (
    <div
      className="animate-in"
      style={{
        animationDelay: `${index * 0.05}s`,
        animationFillMode: "both",
        padding: "20px 0",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        cursor: "pointer",
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLButtonElement ||
          target.closest("button") ||
          target.closest("input")
        ) {
          return;
        }
        toggleExpand();
      }}
    >
      {/* Top row: ring + name + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 12,
        }}
      >
        {/* Progress ring */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <ProgressRing
            progress={progress}
            size={48}
            stroke={4}
            color={goal.color}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 48,
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="num-display"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
              }}
            >
              {progress.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Name + amount */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: 2,
            }}
          >
            {goal.name}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span
              className="num-display"
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              ¥{totalPositionAmount.toLocaleString()}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              / ¥{goal.target_amount.toLocaleString()}
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              marginTop: 2,
              fontFamily: "var(--font-mono)",
            }}
          >
            总市值 ¥{currentValue.toLocaleString()}
            {" · "}闲置资金 ¥{cashBalance.toLocaleString()}
          </div>
          {/* Currency breakdown from position data */}
          {positionCurrencies.length > 1 && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginTop: 2,
              }}
            >
              {positionCurrencies
                .map((c) => `${c.amount.toLocaleString()} ${c.currency}`)
                .join(" + ")}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            onClick={onEdit}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-surface)",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-surface)",
              color: "var(--color-danger)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar" style={{ height: 4, marginBottom: 12 }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${Math.min(progress, 100)}%`,
            background: goal.color,
          }}
        />
      </div>

      {/* Quick actions row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Current amount editor — multi-currency */}
        {editingAmount ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 300 }}
               onClick={(e) => e.stopPropagation()}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
              当前已存:
            </span>
            {editCurrencyRows.map((row, idx) => (
              <CurrencyRow
                key={idx}
                index={idx}
                currency={row.currency}
                amount={row.amount}
                onChange={(cur, amt) => {
                  const updated = [...editCurrencyRows];
                  updated[idx] = { currency: cur, amount: amt };
                  setEditCurrencyRows(updated);
                }}
                onRemove={() => {
                  if (editCurrencyRows.length <= 1) return;
                  setEditCurrencyRows(editCurrencyRows.filter((_, i) => i !== idx));
                }}
                disabledCurrencies={editCurrencyRows.map(r => r.currency)}
                rates={rates}
              />
            ))}
            {editCurrencyRows.length < SUPPORTED_CURRENCIES.length && (
              <button
                onClick={() => {
                  const used = new Set(editCurrencyRows.map(r => r.currency));
                  const next = SUPPORTED_CURRENCIES.find(c => !used.has(c.code));
                  if (next) setEditCurrencyRows([...editCurrencyRows, { currency: next.code, amount: 0 }]);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", fontSize: 12, borderRadius: 6,
                  border: "1px dashed var(--border-subtle)", background: "transparent",
                  color: "var(--text-tertiary)", cursor: "pointer", marginBottom: 4,
                }}
              >
                <Plus size={12} /> 添加币种
              </button>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
              <button onClick={handleSaveEditAmount}
                style={{
                  width: 32, height: 32, borderRadius: 6, border: "none",
                  background: "var(--color-primary)", color: "white", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                <Check size={14} />
              </button>
              <button onClick={() => setEditingAmount(false)}
                style={{
                  width: 32, height: 32, borderRadius: 6, border: "1px solid var(--border-subtle)",
                  background: "var(--bg-surface)", color: "var(--text-tertiary)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Initialize edit rows from goal's existing currencies
              if (goal.currencies && goal.currencies.length > 0) {
                const principalSum = goal.currencies.reduce((sum, c) => sum + c.amount, 0);
                const grossScale = principalSum > 0
                  ? getGoalNetSaving(goal) / principalSum
                  : 1;
                setEditCurrencyRows(
                  goal.currencies.map(c => ({
                    currency: c.currency,
                    amount: Math.round(c.amount * grossScale * 100) / 100,
                  })),
                );
              } else {
                setEditCurrencyRows([{ currency: "CNY", amount: getGoalNetSaving(goal) }]);
              }
              setEditingAmount(true);
            }}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Pencil size={12} />
            修改已存金额
          </button>
        )}

        {/* Info */}
        <div
          style={{
            marginLeft: "auto",
            fontSize: 13,
            color: "var(--text-tertiary)",
            display: "flex",
            gap: 16,
          }}
        >
          {goal.deadline && <span>截止: {goal.deadline}</span>}
          {monthlyRequired > 0 && (
            <span className="num-display">
              还需 ¥{monthlyRequired.toFixed(0)}/月
            </span>
          )}
        </div>
      </div>

      {/* Expanded chart */}
      {expanded &&
        chartData.length > 0 &&
        (() => {
          const baseH = 220;
          const padT = 10;
          const padB = 40;
          const chartH = baseH - padT - padB;
          const maxVal = Math.max(
            goal.target_amount,
            ...chartData.map((d) => d.amount)
          );
          const aspect =
            containerWidth > 0 ? containerWidth / baseH : 2.5;
          const dynW = Math.round(baseH * aspect);
          const dynPadL = Math.round(60 * (dynW / 500));
          const dynPadR = Math.round(20 * (dynW / 500));
          const dynChartW = dynW - dynPadL - dynPadR;
          const gridCount = 5;
          const gridLines = Array.from({ length: gridCount }, (_, i) => {
            const ratio = i / (gridCount - 1);
            return {
              y: padT + (1 - ratio) * chartH,
              val: maxVal * ratio,
            };
          });
          const pathPoints = chartData.map((d, i) => ({
            x:
              dynPadL +
              (i / Math.max(chartData.length - 1, 1)) * dynChartW,
            y: padT + chartH - (d.amount / maxVal) * chartH,
          }));
          const areaPath =
            `M ${pathPoints[0].x},${padT + chartH} ` +
            pathPoints.map((p) => `L ${p.x},${p.y}`).join(" ") +
            ` L ${pathPoints[pathPoints.length - 1].x},${
              padT + chartH
            } Z`;
          const curvePath = pathPoints.reduce((acc, p, i) => {
            if (i === 0) return `M ${p.x},${p.y}`;
            const prev = pathPoints[i - 1];
            const cpx1 = prev.x + (p.x - prev.x) * 0.4;
            const cpx2 = prev.x + (p.x - prev.x) * 0.6;
            return `${acc} C ${cpx1},${prev.y} ${cpx2},${p.y} ${p.x},${p.y}`;
          }, "");
          const xLabels =
            chartData.length <= 6
              ? chartData
              : chartData.filter((_, i) => {
                  const step = Math.ceil(chartData.length / 5);
                  return (
                    i % step === 0 || i === chartData.length - 1
                  );
                });

          return (
            <div
              ref={chartContainerRef}
              style={{
                marginTop: 16,
                padding: "16px 16px 12px",
                background: "var(--bg-page)",
                borderRadius: 12,
                border: "1px solid var(--border-subtle)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                  }}
                >
                  储蓄变动记录
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 2,
                        background: goal.color,
                        borderRadius: 1,
                      }}
                    />
                    <span style={{ color: "var(--text-tertiary)" }}>
                      已储蓄总额（含投资收益）
                    </span>
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 2,
                        background: "var(--color-danger)",
                        borderRadius: 1,
                        opacity: 0.5,
                      }}
                    />
                    <span style={{ color: "var(--text-tertiary)" }}>
                      目标
                    </span>
                  </span>
                </div>
              </div>
              <svg
                width="100%"
                height={baseH}
                viewBox={`0 0 ${dynW} ${baseH}`}
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <linearGradient
                    id={`goalGrad-${goal.id}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={goal.color}
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="100%"
                      stopColor={goal.color}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                {gridLines.map((g, i) => (
                  <g key={i}>
                    <line
                      x1={dynPadL}
                      y1={g.y}
                      x2={dynPadL + dynChartW}
                      y2={g.y}
                      stroke="var(--border-subtle)"
                      strokeWidth={1}
                      opacity={0.6}
                    />
                    <text
                      x={dynPadL - 8}
                      y={g.y + 4}
                      textAnchor="end"
                      fontSize={11}
                      fill="var(--text-tertiary)"
                      fontFamily="var(--font-mono)"
                    >
                      {g.val >= 10000
                        ? `${(g.val / 10000).toFixed(0)}万`
                        : `¥${g.val.toLocaleString()}`}
                    </text>
                  </g>
                ))}
                <path
                  d={areaPath}
                  fill={`url(#goalGrad-${goal.id})`}
                />
                <line
                  x1={dynPadL}
                  y1={
                    padT +
                    chartH -
                    (goal.target_amount / maxVal) * chartH
                  }
                  x2={dynPadL + dynChartW}
                  y2={
                    padT +
                    chartH -
                    (goal.target_amount / maxVal) * chartH
                  }
                  stroke="var(--color-danger)"
                  strokeWidth={1}
                  strokeDasharray="6 4"
                  opacity={0.4}
                />
                <text
                  x={dynPadL + dynChartW + 4}
                  y={
                    padT +
                    chartH -
                    (goal.target_amount / maxVal) * chartH +
                    4
                  }
                  fontSize={10}
                  fill="var(--color-danger)"
                  opacity={0.6}
                >
                  目标
                </text>
                <path
                  d={curvePath}
                  fill="none"
                  stroke={goal.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
                {pathPoints.map((p, i) => (
                  <g
                    key={i}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredDot(i)}
                    onMouseLeave={() => setHoveredDot(null)}
                  >
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={hoveredDot === i ? 6 : 4}
                      fill="white"
                      stroke={goal.color}
                      strokeWidth={2}
                      style={{ transition: "r 0.15s" }}
                    />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={hoveredDot === i ? 2.5 : 1.5}
                      fill={goal.color}
                      style={{ transition: "r 0.15s" }}
                    />
                  </g>
                ))}
                {hoveredDot !== null &&
                  pathPoints[hoveredDot] &&
                  (() => {
                    const d = chartData[hoveredDot];
                    const p = pathPoints[hoveredDot];
                    const tooltipW = 130;
                    const tooltipH = 48;
                    let tx = p.x - tooltipW / 2;
                    let ty = p.y - tooltipH - 12;
                    if (tx < 0) tx = 4;
                    if (tx + tooltipW > dynW)
                      tx = dynW - tooltipW - 4;
                    if (ty < 0) ty = p.y + 16;
                    return (
                      <g>
                        <rect
                          x={tx}
                          y={ty}
                          width={tooltipW}
                          height={tooltipH}
                          rx={6}
                          fill="var(--bg-surface)"
                          stroke="var(--border-subtle)"
                          strokeWidth={1}
                          filter="drop-shadow(0 2px 6px rgba(0,0,0,0.1))"
                        />
                        <text
                          x={tx + 10}
                          y={ty + 18}
                          fontSize={10}
                          fill="var(--text-tertiary)"
                          fontFamily="var(--font-mono)"
                        >
                          {d.date}
                        </text>
                        <text
                          x={tx + 10}
                          y={ty + 36}
                          fontSize={13}
                          fontWeight={600}
                          fill="var(--text-primary)"
                          fontFamily="var(--font-mono)"
                        >
                          ¥{d.amount.toLocaleString()}
                        </text>
                      </g>
                    );
                  })()}
                {xLabels.map((d, i) => {
                  const idx = chartData.indexOf(d);
                  const x =
                    dynPadL +
                    (idx / Math.max(chartData.length - 1, 1)) *
                      dynChartW;
                  const shortDate = d.date.slice(5);
                  return (
                    <text
                      key={i}
                      x={x}
                      y={baseH - 4}
                      textAnchor="middle"
                      fontSize={10}
                      fill="var(--text-tertiary)"
                      fontFamily="var(--font-mono)"
                    >
                      {shortDate}
                    </text>
                  );
                })}
              </svg>
            </div>
          );
        })()}
    </div>
  );
}

// ── Multi-currency input row ────────────────────────────────────

function CurrencyRow({
  currency,
  amount,
  onChange,
  onRemove,
  disabledCurrencies,
  rates,
  index,
}: {
  currency: string;
  amount: number;
  onChange: (currency: string, amount: number) => void;
  onRemove: () => void;
  disabledCurrencies: string[];
  rates: Record<string, number>;
  index: number;
}) {
  // Calculate CNY equivalent
  // rates now contain foreign->CNY multipliers (1 USD = 7.25 CNY)
  let cnyEquivalent = amount;
  if (currency !== "CNY" && rates[currency]) {
    cnyEquivalent = amount * rates[currency];
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          width: 16,
          textAlign: "center",
        }}
      >
        {index + 1}
      </span>
      <select
        value={currency}
        onChange={(e) => onChange(e.target.value, amount)}
        style={{
          width: 110,
          padding: "8px 10px",
          fontSize: 13,
          borderRadius: 6,
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          outline: "none",
          fontFamily: "var(--font-mono)",
        }}
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option
            key={c.code}
            value={c.code}
            disabled={
              disabledCurrencies.includes(c.code) && c.code !== currency
            }
          >
            {c.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={amount || ""}
        onChange={(e) =>
          onChange(currency, parseFloat(e.target.value) || 0)
        }
        placeholder="0"
        style={{
          flex: 1,
          minWidth: 80,
          padding: "8px 10px",
          fontSize: 13,
          fontFamily: "var(--font-mono)",
          borderRadius: 6,
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          outline: "none",
        }}
      />
      {/* CNY equivalent display */}
      {currency !== "CNY" && amount > 0 && (
        <span
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-mono)",
            whiteSpace: "nowrap",
          }}
        >
          ≈ ¥{cnyEquivalent.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      )}
      {/* Remove button */}
      <button
        onClick={onRemove}
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-surface)",
          color: "var(--color-danger)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────

export default function SavingsGoals() {
  const { t } = useTranslation();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [formName, setFormName] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formColor, setFormColor] = useState("#0d7377");
  const [syncingPnl, setSyncingPnl] = useState(false);
  const [positionSummary, setPositionSummary] = useState<{
    total_position_amount: number;
    cash_balance: number;
    current_value: number;
    unrealized_pnl: number;
    total_pnl: number;
    invested_amount: number;
    transfer_in: number;
    transfer_out: number;
    loss_amount: number;
    total_return_rate: number;
    currencies: Array<{ currency: string; amount: number }>;
  } | null>(null);

  // Multi-currency state
  const [currencyRows, setCurrencyRows] = useState<
    Array<{ currency: string; amount: number }>
  >([{ currency: "CNY", amount: 0 }]);
  const [rates, setRates] = useState<Record<string, number>>({});

  // Fetch exchange rates on mount
  useEffect(() => {
    fetchExchangeRates()
      .then(setRates)
      .catch(() => {
        // Fallback rates if API unavailable
        setRates({
          CNY: 1,
          USD: 7.25,
          EUR: 7.87,
          GBP: 9.18,
          JPY: 0.049,
          HKD: 0.93,
        });
      });
  }, []);

  const load = useCallback(async () => {
    try {
      setGoals(await fetchSavingsGoals());
      notifySavingsGoalsUpdated();
    } catch {
      // silent
    }
  }, []);

  const handleSyncPnl = async () => {
    setSyncingPnl(true);
    let cancelled = false;
    try {
      await syncStockPnl();
      await load();
      // Refresh position summary after P&L sync
      fetchPositionSummary()
        .then((data) => { if (!cancelled) setPositionSummary(data); })
        .catch(() => {});
    } catch {
      // silent
    } finally {
      if (!cancelled) setSyncingPnl(false);
    }
    // Note: cancelled flag is local; if component unmounts during sync,
    // setSyncingPnl is a no-op (React ignores setState on unmounted).
  };

  useEffect(() => {
    let cancelled = false;
    load();
    fetchPositionSummary()
      .then((data) => { if (!cancelled) setPositionSummary(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [load]);

  function resetForm() {
    setFormName("");
    setFormTarget("");
    setFormDeadline("");
    setFormColor("#0d7377");
    setCurrencyRows([{ currency: "CNY", amount: 0 }]);
    setEditingId(null);
    setShowForm(false);
  }

  function handleEdit(goal: SavingsGoal) {
    setEditingId(goal.id);
    setFormName(goal.name);
    setFormTarget(String(goal.target_amount));
    setFormDeadline(goal.deadline);
    setFormColor(goal.color);
    // Form accepts gross saved total (incl. investment gains)
    if (goal.currencies && goal.currencies.length > 0) {
      const principalSum = goal.currencies.reduce((sum, c) => sum + c.amount, 0);
      const grossScale = principalSum > 0
        ? getGoalNetSaving(goal) / principalSum
        : 1;
      setCurrencyRows(
        goal.currencies.map((c) => ({
          currency: c.currency,
          amount: Math.round(c.amount * grossScale * 100) / 100,
        })),
      );
    } else {
      setCurrencyRows([
        { currency: "CNY", amount: getGoalNetSaving(goal) },
      ]);
    }
    setShowForm(false);
  }

  // Calculate total CNY from currency rows
  // rates contain foreign->CNY multipliers (1 USD = 7.25 CNY)
  const totalCNY = currencyRows.reduce((sum, row) => {
    if (row.currency === "CNY") return sum + row.amount;
    const rate = rates[row.currency] || 0;
    return sum + row.amount * rate;
  }, 0);

  // Get disabled currencies (already selected in other rows)
  const selectedCurrencies = currencyRows.map((r) => r.currency);

  function addCurrencyRow() {
    // Find first unused currency
    const used = new Set(currencyRows.map((r) => r.currency));
    const next = SUPPORTED_CURRENCIES.find((c) => !used.has(c.code));
    if (next) {
      setCurrencyRows([...currencyRows, { currency: next.code, amount: 0 }]);
    }
  }

  function removeCurrencyRow(index: number) {
    if (currencyRows.length <= 1) return;
    setCurrencyRows(currencyRows.filter((_, i) => i !== index));
  }

  function updateCurrencyRow(
    index: number,
    currency: string,
    amount: number
  ) {
    const updated = [...currencyRows];
    updated[index] = { currency, amount };
    setCurrencyRows(updated);
  }

  async function handleSave() {
    if (!formName.trim() || !formTarget) return;

    // Build currencies payload — filter out zero-amount rows
    const currenciesPayload = currencyRows
      .filter((r) => r.amount > 0)
      .map((r) => ({ currency: r.currency, amount: r.amount }));

    const payload: any = {
      name: formName.trim(),
      target_amount: parseFloat(formTarget) || 0,
      deadline: formDeadline,
      color: formColor,
    };

    if (currenciesPayload.length > 0) {
      payload.currencies = currenciesPayload;
      payload.gross_total = totalCNY;
    }

    try {
      if (editingId !== null) {
        await updateSavingsGoal(editingId, payload);
      } else {
        await createSavingsGoal(payload);
      }
      resetForm();
      load();
    } catch {
      // silent
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteSavingsGoal(id);
      load();
    } catch {
      // silent
    }
  }

  const colorOptions = [
    "#0d7377",
    "#c96b4f",
    "#3d7a4a",
    "#b8942d",
    "#a83634",
    "#6e72b8",
  ];

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      {/* Header */}
      <section
        className="section"
        style={{
          paddingTop: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Target size={18} style={{ color: "var(--color-primary)" }} />
          <h2>{t("savings.title")}</h2>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setFormName("");
            setFormTarget("");
            setFormDeadline("");
            setFormColor("#0d7377");
            setCurrencyRows([{ currency: "CNY", amount: 0 }]);
            setEditingId(null);
            setShowForm(true);
          }}
        >
          <Plus size={14} />
          {t("savings.add")}
        </button>
      </section>

      {/* Add/Edit form — elevated card */}
      {(showForm || editingId !== null) && (
        <section className="section-card" style={{ marginBottom: 24 }}>
          <div className="elevated-card">
            <h4 style={{ marginBottom: 16 }}>
              {editingId !== null
                ? t("savings.editGoal")
                : t("savings.newGoal")}
            </h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 16,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                    display: "block",
                  }}
                >
                  {t("savings.goalName")}
                </label>
                <input
                  className="input"
                  placeholder="e.g. Emergency Fund"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                    display: "block",
                  }}
                >
                  {t("savings.target")}
                </label>
                <input
                  className="input"
                  type="number"
                  placeholder="10000"
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  style={{ fontFamily: "var(--font-mono)" }}
                />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                    display: "block",
                  }}
                >
                  已储蓄总额（含投资收益，非实际本金）
                </label>
                <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "0 0 8px" }}>
                  填写资产总额（如 ¥139,136.08）；同步持仓盈亏后会自动拆出实际本金
                </p>
                {/* Currency input rows */}
                {currencyRows.map((row, idx) => (
                  <CurrencyRow
                    key={idx}
                    index={idx}
                    currency={row.currency}
                    amount={row.amount}
                    onChange={(cur, amt) =>
                      updateCurrencyRow(idx, cur, amt)
                    }
                    onRemove={() => removeCurrencyRow(idx)}
                    disabledCurrencies={selectedCurrencies}
                    rates={rates}
                  />
                ))}
                {/* Add row button */}
                {currencyRows.length <
                  SUPPORTED_CURRENCIES.length && (
                  <button
                    onClick={addCurrencyRow}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 12px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px dashed var(--border-subtle)",
                      background: "transparent",
                      color: "var(--text-tertiary)",
                      cursor: "pointer",
                      marginBottom: 8,
                    }}
                  >
                    <Plus size={12} />
                    添加币种
                  </button>
                )}
                {/* Total CNY display */}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-mono)",
                    padding: "8px 0",
                    borderTop: "1px solid var(--border-subtle)",
                  }}
                >
                  ≈ ¥
                  {totalCNY.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: "var(--text-tertiary)",
                      marginLeft: 8,
                    }}
                  >
                    CNY 总计
                  </span>
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                    display: "block",
                  }}
                >
                  {t("savings.deadline")}
                </label>
                <input
                  className="input"
                  type="date"
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                />
              </div>
            </div>

            {/* Color picker */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {t("savings.color")}:
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                {colorOptions.map((c) => (
                  <div
                    key={c}
                    onClick={() => setFormColor(c)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      background: c,
                      cursor: "pointer",
                      border:
                        formColor === c
                          ? "2px solid var(--text-primary)"
                          : "2px solid transparent",
                      transition: "border-color 0.1s",
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSave}>
                {editingId !== null
                  ? t("savings.update")
                  : t("savings.create")}
              </button>
              <button className="btn btn-ghost" onClick={resetForm}>
                {t("savings.cancel")}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Position summary card — shows total position, market value, cash */}
      {positionSummary && (
        <section style={{ marginBottom: 20 }}>
          <div
            className="elevated-card"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 0,
              padding: 0,
              overflow: "hidden",
            }}
          >
            {/* Total Position */}
            <div
              style={{
                padding: "14px 20px",
                borderRight: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 4,
                  fontWeight: 600,
                }}
              >
                总仓位金额
              </div>
              <div
                className="num-display"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                ¥{positionSummary.total_position_amount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            {/* Market Value */}
            <div
              style={{
                padding: "14px 20px",
                borderRight: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 4,
                  fontWeight: 600,
                }}
              >
                总市值
              </div>
              <div
                className="num-display"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                ¥{positionSummary.current_value.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
            {/* Cash Balance */}
            <div style={{ padding: "14px 20px" }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 4,
                  fontWeight: 600,
                }}
              >
                闲置资金
              </div>
              <div
                className="num-display"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: positionSummary.cash_balance >= 0 ? "var(--color-success)" : "var(--color-danger)",
                }}
              >
                ¥{positionSummary.cash_balance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Stock P&L sync section */}
      <section style={{ marginBottom: 20 }}>
        <div
          className="elevated-card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <TrendingUp size={16} style={{ color: "var(--color-primary)" }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                持仓盈亏同步
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", margin: "4px 0 0 26px" }}>
              若误将含收益总额填成本金，请编辑目标填入正确的已储蓄总额后保存，再点此同步拆分
            </p>
          </div>
          <button
            onClick={handleSyncPnl}
            disabled={syncingPnl}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              cursor: syncingPnl ? "not-allowed" : "pointer",
              opacity: syncingPnl ? 0.5 : 1,
              transition: "all 0.2s",
            }}
          >
            <RefreshCw
              size={12}
              style={{ animation: syncingPnl ? "spin 1s linear infinite" : "none" }}
            />
            {syncingPnl ? "同步中..." : "同步持仓盈亏"}
          </button>
        </div>
      </section>

      {/* Goals list — elevated card */}
      <section className="section-card">
        <div className="elevated-card">
          {goals.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <Target
                size={32}
                style={{
                  color: "var(--text-tertiary)",
                  opacity: 0.4,
                  marginBottom: 12,
                }}
              />
              <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
                {t("savings.noGoals")}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {goals.map((goal, i) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  index={i}
                  isLast={i === goals.length - 1}
                  totalPositionAmount={positionSummary?.total_position_amount ?? 0}
                  currentValue={positionSummary?.current_value ?? 0}
                  cashBalance={positionSummary?.cash_balance ?? 0}
                  positionCurrencies={positionSummary?.currencies ?? []}
                  onEdit={() => handleEdit(goal)}
                  onDelete={() => handleDelete(goal.id)}
                  onUpdate={load}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
