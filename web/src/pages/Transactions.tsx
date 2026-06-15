/**
 * Transactions — Clean editorial layout with proper scrolling.
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "../components/ui/Calendar";
import { TransactionForm } from "../components/transactions/TransactionForm";
import { TransactionRow } from "../components/transactions/TransactionRow";
import { DraggableHeader, DraggableHeaderProvider } from "../components/transactions/DraggableHeader";
import { useTranslation } from "../i18n";
import {
  useTransactions,
  useAddTransaction,
  useDeleteTransaction,
} from "../hooks/useLedger";

export default function Transactions() {
  const { t } = useTranslation();
  const { data: transactions, loading, reload, optimisticRemove } = useTransactions();
  const { add, loading: adding } = useAddTransaction();
  const { remove } = useDeleteTransaction();
  const [alerts, setAlerts] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [showDayCalendar, setShowDayCalendar] = useState(false);
  const dayButtonRef = useRef<HTMLButtonElement>(null);

  const handleAdd = useCallback(
    async (rawInput: string, date?: string, time?: string, type?: "expense" | "income", category?: string) => {
      const result = await add(rawInput, date, time, type, category);
      if (result) {
        setAlerts(result.alerts);
        reload();
      }
    },
    [add, reload]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      optimisticRemove(id);
      try {
        await remove(id);
      } catch {
        reload();
      }
    },
    [remove, reload, optimisticRemove]
  );

  const handleUpdate = useCallback(
    (id: number) => {
      reload();
    },
    [reload]
  );

  const categories = useMemo(() => {
    const cats = new Set(transactions.map((t) => t.category));
    return ["all", ...Array.from(cats)];
  }, [transactions]);

  // Get unique years, months, days from transactions
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

  // Apply all filters
  const filteredTxns = useMemo(() => {
    return transactions.filter((t) => {
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      const parts = t.date.split("-");
      if (yearFilter !== "all" && parts[0] !== yearFilter) return false;
      if (monthFilter !== "all" && parts[1] !== monthFilter) return false;
      if (dayFilter !== "all" && parts[2] !== dayFilter) return false;
      return true;
    });
  }, [transactions, categoryFilter, yearFilter, monthFilter, dayFilter]);

  // Stats based on filtered transactions
  const stats = useMemo(() => {
    const totalExpense = filteredTxns
      .filter((t) => !t.is_income)
      .reduce((sum, t) => sum + t.amount, 0);
    const totalIncome = filteredTxns
      .filter((t) => t.is_income)
      .reduce((sum, t) => sum + t.amount, 0);
    return { totalExpense, totalIncome, count: filteredTxns.length };
  }, [filteredTxns]);

  return (
    <div style={{ width: "100%" }}>
      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        {[
          { label: "总支出", value: `¥${Math.abs(stats.totalExpense).toLocaleString()}`, color: "var(--text-primary)" },
          { label: "总收入", value: `¥${stats.totalIncome.toLocaleString()}`, color: "var(--color-success)" },
          { label: "交易笔数", value: stats.count.toString(), color: "var(--text-primary)" },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              flex: 1,
              padding: "20px 24px",
              background: "var(--bg-surface)",
              borderRadius: 12,
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8, fontWeight: 500 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)", letterSpacing: "-0.02em" }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
          {t("txn.add")}
        </div>
        <TransactionForm onSubmit={handleAdd} loading={adding} />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div
          style={{
            padding: "14px 18px",
            borderLeft: "3px solid var(--color-warning)",
            background: "rgba(234, 179, 8, 0.06)",
            borderRadius: "0 8px 8px 0",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--color-warning)", fontWeight: 600, marginBottom: 8 }}>
            {t("txn.budgetAlerts")}
          </div>
          {alerts.map((a, i) => (
            <div key={i} style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {a}
            </div>
          ))}
        </div>
      )}

      {/* Transaction list */}
      <div
        style={{
          background: "var(--bg-surface)",
          borderRadius: 12,
          border: "1px solid var(--border-subtle)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
              {dayFilter !== "all" ? "当日交易" : monthFilter !== "all" ? "本月交易" : yearFilter !== "all" ? "本年交易" : t("txn.all")}
            </div>
            
            {/* Category filter */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", minWidth: 40, lineHeight: "26px" }}>分类</span>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    background: categoryFilter === cat ? "var(--color-primary)" : "var(--neutral-100)",
                    color: categoryFilter === cat ? "white" : "var(--text-secondary)",
                  }}
                >
                  {cat === "all" ? "全部" : cat}
                </button>
              ))}
            </div>

            {/* Date filters */}
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ maxHeight: "calc(100vh - 400px)", overflowY: "auto" }}>
          <DraggableHeaderProvider
            initialColumns={[
              { key: "date", label: t("txn.date"), initialWidth: 110, minWidth: 80 },
              { key: "category", label: t("txn.category"), initialWidth: 90, minWidth: 60 },
              { key: "description", label: t("txn.desc"), flex: true },
              { key: "amount", label: t("txn.amount"), initialWidth: 130, minWidth: 80 },
            ]}
          >
            <DraggableHeader />
            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>
                {t("common.loading")}
              </div>
            ) : filteredTxns.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>
                {t("txn.empty")}
              </div>
            ) : (
              filteredTxns.map((txn) => (
                <TransactionRow key={txn.id} txn={txn} onDelete={handleDelete} onUpdate={handleUpdate} />
              ))
            )}
          </DraggableHeaderProvider>
        </div>
      </div>
    </div>
  );
}
