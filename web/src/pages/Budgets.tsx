/**
 * Budgets - editorial layout. No nested cards.
 * Total budget as section header, category budgets as flat grid.
 */

import { useState, useCallback, useEffect } from "react";
import { Plus } from "lucide-react";
import { BudgetCard } from "../components/budget/BudgetCard";
import { BudgetProgress } from "../components/budget/BudgetProgress";
import { Button } from "../components/ui/Button";
import { useTranslation } from "../i18n";
import { useBudgets, useSetBudget, useDeleteBudget } from "../hooks/useLedger";
import { fetchCategories } from "../lib/api";
import type { BudgetStatus } from "../lib/types";

export default function Budgets() {
  const { t } = useTranslation();
  const { data: budgets, loading, error, reload } = useBudgets();
  const { save } = useSetBudget();
  const { remove } = useDeleteBudget();

  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState("month");
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [customCategory, setCustomCategory] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [localBudgets, setLocalBudgets] = useState<BudgetStatus[]>([]);
  // Edit state for total budget
  const [editingAll, setEditingAll] = useState(false);
  const [editAmount, setEditAmount] = useState("");

  // Fetch existing categories from transactions
  useEffect(() => {
    fetchCategories()
      .then((data) => {
        const cats = data.categories.map((c) => c.name);
        setExistingCategories(cats);
      })
      .catch(() => {});
  }, []);

  // Sync local state with fetched data
  useEffect(() => {
    setLocalBudgets(budgets);
  }, [budgets]);

  const catBudgets = localBudgets.filter((b) => b.category !== "ALL");
  const allBudget = localBudgets.find((b) => b.category === "ALL");

  const handleSave = useCallback(async () => {
    if (!category.trim() || !amount) return;
    await save(category.trim(), parseFloat(amount), "CNY", undefined, undefined, period);
    setCategory("");
    setAmount("");
    setPeriod("month");
    setShowForm(false);
    reload();
  }, [category, amount, period, save, reload]);

  const handleDelete = useCallback(
    async (id: number) => {
      let snapshot: BudgetStatus[] = [];
      setLocalBudgets((prev) => {
        snapshot = prev;
        return prev.filter((b) => b.id !== id);
      });
      try {
        await remove(id);
      } catch {
        setLocalBudgets(snapshot);
      }
    },
    [remove],
  );

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderRadius: 8,
            background: "rgba(220, 38, 38, 0.08)",
            border: "1px solid rgba(220, 38, 38, 0.2)",
            fontSize: 13,
            color: "var(--color-danger)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{error}</span>
          <button type="button" className="btn btn-secondary" onClick={reload}>
            {t("analysis.retry")}
          </button>
        </div>
      )}
      {/* ── Total budget section - elevated card ── */}
      {allBudget && (
        <section className="section-card" style={{ marginBottom: 32 }}>
          <div className="elevated-card">
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h4>{t("budget.monthly")}</h4>
            {editingAll ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>¥</span>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  autoFocus
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      const val = parseFloat(editAmount);
                      if (!isNaN(val) && val >= 0) {
                        await save("ALL", val, "CNY", undefined, undefined, "month");
                        setEditingAll(false);
                        reload();
                      }
                    }
                    if (e.key === "Escape") setEditingAll(false);
                  }}
                  onBlur={async () => {
                    const val = parseFloat(editAmount);
                    if (!isNaN(val) && val >= 0 && val !== allBudget.budget) {
                      await save("ALL", val, "CNY", undefined, undefined, "month");
                      reload();
                    }
                    setEditingAll(false);
                  }}
                  style={{
                    width: 100,
                    padding: "4px 8px",
                    fontSize: 13,
                    fontFamily: "var(--font-mono)",
                    borderRadius: 6,
                    border: "1px solid var(--color-primary)",
                    background: "white",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>/ ¥{allBudget.budget.toLocaleString()}</span>
              </div>
            ) : (
              <span
                className="num-display"
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: 4,
                  transition: "background 0.15s",
                }}
                title="Click to edit budget"
                onClick={() => {
                  setEditAmount(String(allBudget.budget));
                  setEditingAll(true);
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover, rgba(0,0,0,0.04))")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                ¥{allBudget.spent.toLocaleString()} / ¥{allBudget.budget.toLocaleString()}
              </span>
            )}
          </div>
          <BudgetProgress usagePct={allBudget.usage_pct} status={allBudget.status} />
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
            {t("budget.remaining")}: ¥{allBudget.remaining.toLocaleString()}
          </div>
          </div>
        </section>
      )}

      {/* ── Category budgets - no wrapper ── */}
      <section style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <h4>{t("budget.categoryBudgets")}</h4>
          <Button variant="secondary" onClick={() => setShowForm(!showForm)}>
            <Plus size={14} />
            {t("budget.add")}
          </Button>
        </div>

        {/* Add form */}
        {showForm && (
          <div
            style={{
              padding: 20,
              marginBottom: 20,
              background: "var(--bg-page)",
              borderRadius: 8,
              border: "1px dashed var(--border-default)",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              {/* Category selector */}
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
                  {t("budget.category")}
                </label>
                {showCustomInput ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setCategory(customCategory);
                          setShowCustomInput(false);
                        }
                        if (e.key === "Escape") setShowCustomInput(false);
                      }}
                      placeholder="输入分类名"
                      autoFocus
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        fontSize: 14,
                        borderRadius: 8,
                        border: "1px solid var(--color-primary)",
                        background: "white",
                        color: "var(--text-primary)",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={() => {
                        setCategory(customCategory);
                        setShowCustomInput(false);
                      }}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 8,
                        border: "none",
                        background: "var(--color-primary)",
                        color: "white",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      确定
                    </button>
                  </div>
                ) : (
                  <select
                    value={category}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setShowCustomInput(true);
                      } else {
                        setCategory(e.target.value);
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      fontSize: 14,
                      borderRadius: 8,
                      border: "1px solid var(--border-subtle)",
                      background: "white",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">请选择分类</option>
                    {existingCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__custom__">+ 自定义分类</option>
                  </select>
                )}
              </div>

              {/* Period */}
              <div style={{ width: 120 }}>
                <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
                  周期
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: 14,
                    borderRadius: 8,
                    border: "1px solid var(--border-subtle)",
                    background: "white",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <option value="day">每天</option>
                  <option value="month">每月</option>
                  <option value="year">每年</option>
                  <option value="all">全部</option>
                </select>
              </div>

              {/* Amount */}
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "block" }}>
                  {t("budget.amount")}
                </label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--text-tertiary)" }}>
                    ¥
                  </span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    style={{
                      width: "100%",
                      padding: "10px 14px 10px 30px",
                      fontSize: 14,
                      fontFamily: "var(--font-mono)",
                      borderRadius: 8,
                      border: "1px solid var(--border-subtle)",
                      background: "white",
                      color: "var(--text-primary)",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={!category.trim() || !amount}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: category.trim() && amount ? "var(--color-primary)" : "var(--neutral-200)",
                  color: category.trim() && amount ? "white" : "var(--text-tertiary)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: category.trim() && amount ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                }}
              >
                {t("budget.save")}
              </button>
            </div>


          </div>
        )}

        {/* Budget cards - full width, no grid */}
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            {t("common.loading")}
          </p>
        ) : catBudgets.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            {t("budget.empty")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {catBudgets.map((b, i) => (
              <BudgetCard
                key={b.id || b.category}
                budget={b}
                delay={i * 0.05}
                onDelete={() => { if (b.id != null) handleDelete(b.id); }}
                onEdit={async (newAmount) => {
                  await save(b.category, newAmount, "CNY", undefined, undefined, b.period);
                  reload();
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
