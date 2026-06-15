/**
 * TransactionForm — Premium form template for adding transactions.
 * Fields: date, time, category, subcategory, description, amount, currency, type.
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslation } from "../../i18n";

interface TransactionFormProps {
  onSubmit: (rawInput: string, date?: string, time?: string) => Promise<void>;
  loading?: boolean;
}

const DEFAULT_CATEGORIES = [
  "餐饮", "交通", "购物", "娱乐", "住房", "医疗",
  "教育", "通讯", "服饰", "礼物", "其他"
];

const CURRENCIES = ["CNY", "USD", "EUR", "GBP", "JPY"];

export function TransactionForm({ onSubmit, loading }: TransactionFormProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem("smart_ledger_custom_categories");
    return saved ? [...DEFAULT_CATEGORIES, ...JSON.parse(saved)] : [...DEFAULT_CATEGORIES];
  });
  const [customCategory, setCustomCategory] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Get current local date/time
  const getCurrentDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };
  const getCurrentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };

  const [formData, setFormData] = useState({
    date: getCurrentDate(),
    time: getCurrentTime(),
    category: "餐饮",
    subcategory: "",
    description: "",
    amount: "",
    currency: "CNY",
    type: "expense" as "expense" | "income",
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddCustomCategory = () => {
    if (!customCategory.trim()) return;
    if (categories.includes(customCategory.trim())) return;
    
    const newCategories = [...categories, customCategory.trim()];
    setCategories(newCategories);
    
    // Save custom categories to localStorage
    const customOnly = newCategories.filter((c) => !DEFAULT_CATEGORIES.includes(c));
    localStorage.setItem("smart_ledger_custom_categories", JSON.stringify(customOnly));
    
    setFormData((prev) => ({ ...prev, category: customCategory.trim() }));
    setCustomCategory("");
    setShowCustomInput(false);
  };

  const handleCategoryChange = (value: string) => {
    if (value === "__custom__") {
      setShowCustomInput(true);
      setFormData((prev) => ({ ...prev, category: "" }));
    } else {
      setShowCustomInput(false);
      handleChange("category", value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || parseFloat(formData.amount) === 0) return;

    const amount = parseFloat(formData.amount);
    const signedAmount = formData.type === "expense" ? -Math.abs(amount) : Math.abs(amount);

    // Build raw input string for the parser
    const parts = [
      formData.category,
      formData.subcategory,
      Math.abs(amount).toString(),
      formData.description || undefined,
    ].filter(Boolean);

    await onSubmit(parts.join(" "), formData.date, formData.time);
    setFormData((prev) => ({
      ...prev,
      date: getCurrentDate(),
      time: getCurrentTime(),
      subcategory: "",
      description: "",
      amount: "",
    }));
  };

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: 12,
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
      }}
    >
      {/* Collapsed view — quick input */}
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "16px 20px" }}>
          {/* Type toggle */}
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
            <button
              type="button"
              onClick={() => handleChange("type", "expense")}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s",
                background: formData.type === "expense" ? "var(--color-danger)" : "transparent",
                color: formData.type === "expense" ? "white" : "var(--text-secondary)",
              }}
            >
              支出
            </button>
            <button
              type="button"
              onClick={() => handleChange("type", "income")}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s",
                background: formData.type === "income" ? "var(--color-success)" : "transparent",
                color: formData.type === "income" ? "white" : "var(--text-secondary)",
              }}
            >
              收入
            </button>
          </div>

          {/* Category */}
          <div style={{ position: "relative" }}>
            <select
              value={showCustomInput ? "__custom__" : formData.category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-page)",
                color: "var(--text-primary)",
                cursor: "pointer",
                minWidth: 80,
              }}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value="__custom__">+ 自定义</option>
            </select>
          </div>

          {/* Amount */}
          <div style={{ position: "relative", flex: 1, maxWidth: 160 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-tertiary)" }}>
              ¥
            </span>
            <input
              type="number"
              value={formData.amount}
              onChange={(e) => handleChange("amount", e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              style={{
                width: "100%",
                padding: "8px 12px 8px 28px",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-page)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          {/* Custom category input */}
          {showCustomInput && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddCustomCategory();
                  if (e.key === "Escape") setShowCustomInput(false);
                }}
                placeholder="输入分类名"
                autoFocus
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid var(--color-primary)",
                  background: "var(--bg-page)",
                  color: "var(--text-primary)",
                  width: 100,
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={handleAddCustomCategory}
                style={{
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "none",
                  background: "var(--color-primary)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                添加
              </button>
            </div>
          )}

          {/* Expand button */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-page)",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
            }}
          >
            {expanded ? <X size={16} /> : <Plus size={16} />}
          </button>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !formData.amount}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: formData.amount ? "var(--color-primary)" : "var(--neutral-200)",
              color: formData.amount ? "white" : "var(--text-tertiary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: formData.amount ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
          >
            {loading ? "..." : "记账"}
          </button>
        </div>

        {/* Expanded view — additional fields */}
        {expanded && (
          <div
            style={{
              padding: "0 20px 16px",
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: 16,
            }}
          >
            {/* Date */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                日期
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => handleChange("date", e.target.value)}
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-page)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {/* Time */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                时间
              </label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => handleChange("time", e.target.value)}
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-page)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {/* Subcategory */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                子分类
              </label>
              <input
                type="text"
                value={formData.subcategory}
                onChange={(e) => handleChange("subcategory", e.target.value)}
                placeholder="可选"
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-page)",
                  color: "var(--text-primary)",
                  width: 100,
                }}
              />
            </div>

            {/* Description */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 150 }}>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                备注
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="可选"
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-page)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {/* Currency */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                币种
              </label>
              <select
                value={formData.currency}
                onChange={(e) => handleChange("currency", e.target.value)}
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 6,
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-page)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
