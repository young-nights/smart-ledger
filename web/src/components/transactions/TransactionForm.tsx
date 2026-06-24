/**
 * TransactionForm — Premium form template for adding transactions.
 * Fields: date, time, category, subcategory, description, amount, currency, type.
 */

import { useState, useRef, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { useTranslation } from "../../i18n";

interface TransactionFormProps {
  onSubmit: (rawInput: string, date?: string, time?: string, type?: "expense" | "income", category?: string) => Promise<void>;
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
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    };
    if (categoryDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [categoryDropdownOpen]);

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
    setCategoryDropdownOpen(false);
  };

  const handleDeleteCategory = (cat: string) => {
    // Only custom categories can be deleted
    if (DEFAULT_CATEGORIES.includes(cat)) return;
    const newCategories = categories.filter((c) => c !== cat);
    setCategories(newCategories);
    // Update localStorage
    const customOnly = newCategories.filter((c) => !DEFAULT_CATEGORIES.includes(c));
    localStorage.setItem("smart_ledger_custom_categories", JSON.stringify(customOnly));
    // If deleted category was selected, switch to first category
    if (formData.category === cat) {
      handleChange("category", newCategories[0] || DEFAULT_CATEGORIES[0]);
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

    await onSubmit(parts.join(" "), formData.date, formData.time, formData.type, formData.category);
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
    <>
      {/* Inject styles for delete button hover visibility */}
      <style>{`
        .cat-delete-btn { opacity: 0 !important; }
        div:hover > .cat-delete-btn { opacity: 1 !important; }
      `}</style>
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
              onClick={() => {
                setFormData((prev) => ({
                  ...prev,
                  type: "expense",
                  category: prev.type !== "expense" ? "餐饮" : prev.category,
                }));
              }}
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
              onClick={() => {
                setFormData((prev) => ({
                  ...prev,
                  type: "income",
                  category: prev.type !== "income" ? "工资" : prev.category,
                }));
              }}
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
          <div style={{ position: "relative" }} ref={categoryRef}>
            {/* Trigger button */}
            <button
              type="button"
              onClick={() => setCategoryDropdownOpen((v) => !v)}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-page)",
                color: "var(--text-primary)",
                cursor: "pointer",
                minWidth: 80,
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {showCustomInput ? "" : formData.category || "选择分类"}
              </span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transform: categoryDropdownOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}>
                <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* Dropdown list */}
            {categoryDropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  minWidth: 140,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  zIndex: 50,
                  padding: 4,
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                {categories.map((cat) => {
                  const isCustom = !DEFAULT_CATEGORIES.includes(cat);
                  return (
                    <div
                      key={cat}
                      onClick={() => handleCategoryChange(cat)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 13,
                        color: "var(--text-primary)",
                        background: formData.category === cat ? "var(--bg-page)" : "transparent",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-page)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = formData.category === cat ? "var(--bg-page)" : "transparent")}
                    >
                      <span>{cat}</span>
                      {isCustom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCategory(cat);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-tertiary)",
                            padding: 2,
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: 0,
                            transition: "opacity 0.1s, color 0.1s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-danger)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
                          className="cat-delete-btn"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {/* Separator */}
                <div style={{ height: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
                {/* Custom category option */}
                <div
                  onClick={() => handleCategoryChange("__custom__")}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--color-primary)",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-page)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  + 自定义
                </div>
              </div>
            )}
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
    </>
  );
}
