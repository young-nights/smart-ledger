/**
 * Savings Goals — editorial layout with progress rings and multi-currency support.
 * No card wrappers. Flat list with section dividers.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, Target, Minus, Check, X } from "lucide-react";
import { useTranslation } from "../i18n";
import {
  fetchSavingsGoals,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
  fetchSavingsHistory,
  fetchExchangeRates,
} from "../lib/api";
import type { SavingsGoal, SavingsHistoryItem, SavingsGoalCurrency } from "../lib/types";

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
  onEdit,
  onDelete,
  onUpdate,
}: {
  goal: SavingsGoal;
  index: number;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}) {
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountInput, setAmountInput] = useState(String(goal.current_amount));
  const [localAmount, setLocalAmount] = useState(goal.current_amount);
  const [expanded, setExpanded] = useState(false);
  const [historyData, setHistoryData] = useState<SavingsHistoryItem[]>([]);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hoveredDot, setHoveredDot] = useState<number | null>(null);

  const months = monthsUntil(goal.deadline);
  const progress =
    goal.target_amount > 0 ? (localAmount / goal.target_amount) * 100 : 0;
  const remaining = Math.max(goal.target_amount - localAmount, 0);
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

  async function handleSaveAmount() {
    const newAmount = parseFloat(amountInput) || 0;
    setLocalAmount(newAmount);
    setEditingAmount(false);
    updateSavingsGoal(goal.id, { current_amount: newAmount }).catch(() => {
      setLocalAmount(goal.current_amount);
      setAmountInput(String(goal.current_amount));
    });
  }

  // Build currency summary string
  const currencies = goal.currencies || [];
  const hasMultipleCurrencies = currencies.length > 1;
  const currencySummary = currencies.length > 0
    ? currencies
        .map((c) => `${c.amount.toLocaleString()} ${c.currency}`)
        .join(" + ")
    : null;

  // Build chart data from history
  const chartData =
    historyData.length > 0
      ? historyData.map((h) => ({
          date: h.recorded_at.split("T")[0],
          amount: h.amount,
        }))
      : [
          {
            date: goal.created_at?.split("T")[0] || "today",
            amount: localAmount,
          },
        ];

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
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLButtonElement ||
          e.target.closest("button") ||
          e.target.closest("input")
        )
          return;
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
              ¥{localAmount.toLocaleString()}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              / ¥{goal.target_amount.toLocaleString()}
            </span>
          </div>
          {/* Currency breakdown */}
          {hasMultipleCurrencies && currencySummary && (
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginTop: 2,
              }}
            >
              {currencySummary}
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
        {/* Current amount editor */}
        {editingAmount ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              当前已存:
            </span>
            <input
              type="number"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveAmount();
                if (e.key === "Escape") {
                  setEditingAmount(false);
                  setAmountInput(String(goal.current_amount));
                }
              }}
              autoFocus
              style={{
                width: 120,
                padding: "6px 10px",
                fontSize: 14,
                fontFamily: "var(--font-mono)",
                borderRadius: 6,
                border: "1px solid var(--color-primary)",
                background: "white",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
            <button
              onClick={handleSaveAmount}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: "none",
                background: "var(--color-primary)",
                color: "white",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setAmountInput(String(goal.current_amount));
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
                      金额
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
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    load();
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
    // Load currencies into form
    if (goal.currencies && goal.currencies.length > 0) {
      setCurrencyRows(
        goal.currencies.map((c) => ({
          currency: c.currency,
          amount: c.amount,
        }))
      );
    } else {
      setCurrencyRows([
        { currency: "CNY", amount: goal.current_amount },
      ]);
    }
    setShowForm(false);
  }

  // Calculate total CNY from currency rows
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

    // If we have currency data, send it; otherwise fallback to total
    if (currenciesPayload.length > 0) {
      payload.currencies = currenciesPayload;
    } else {
      payload.current_amount = 0;
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
                  当前金额（多币种）
                </label>
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
