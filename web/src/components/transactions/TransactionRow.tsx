/**
 * TransactionRow — Clean row with vertical dividers matching header.
 * Supports inline edit modal.
 */

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Trash2, AlertTriangle, Pencil, Check, X } from "lucide-react";
import type { Transaction } from "../../lib/types";
import { useDraggableColumns } from "./DraggableHeader";
import { updateTransaction } from "../../lib/api";

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
  "餐饮": "#ea580c",
  "交通": "#2563eb",
  "购物": "#7c3aed",
  "娱乐": "#d946ef",
  "住房": "#0891b2",
  "医疗": "#dc2626",
  "教育": "#16a34a",
  "通讯": "#0d9488",
  "服饰": "#ca8a04",
  "礼物": "#e11d48",
  "其他": "#6b7280",
};

const DEFAULT_CATEGORIES = [
  "餐饮", "交通", "购物", "娱乐", "住房", "医疗",
  "教育", "通讯", "服饰", "礼物", "其他",
];

interface TransactionRowProps {
  txn: Transaction;
  onDelete?: (id: number) => void;
  onUpdate?: (id: number) => void;
}

export function TransactionRow({ txn, onDelete, onUpdate }: TransactionRowProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [saving, setSaving] = useState(false);
  const { columns } = useDraggableColumns();
  const sign = txn.is_income ? "+" : "-";
  const color = CATEGORY_COLORS[txn.category] || CATEGORY_COLORS["其他"];

  // Edit form state
  const [editDate, setEditDate] = useState(txn.date);
  const [editCategory, setEditCategory] = useState(txn.category);
  const [editAmount, setEditAmount] = useState(String(Math.abs(txn.amount)));
  const [editDescription, setEditDescription] = useState(txn.description);
  const [editType, setEditType] = useState<"expense" | "income">(txn.is_income ? "income" : "expense");

  // Categories loaded from localStorage (same source as TransactionForm)
  const [categories, setCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem("smart_ledger_categories");
    return saved ? JSON.parse(saved) : [...DEFAULT_CATEGORIES];
  });
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setCatDropdownOpen(false);
      }
    };
    if (catDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [catDropdownOpen]);

  // Reset edit form when txn changes
  useEffect(() => {
    setEditDate(txn.date);
    setEditCategory(txn.category);
    setEditAmount(String(Math.abs(txn.amount)));
    setEditDescription(txn.description);
    setEditType(txn.is_income ? "income" : "expense");
  }, [txn]);

  const getColWidth = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (!col) return 100;
    return col.flex ? undefined : col.width || 100;
  };

  // Close on Escape
  useEffect(() => {
    if (!showConfirm && !showEdit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowConfirm(false);
        setShowEdit(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showConfirm, showEdit]);

  const handleDelete = () => {
    if (onDelete) onDelete(txn.id);
    setShowConfirm(false);
  };

  const handleSave = async () => {
    const amount = parseFloat(editAmount);
    if (isNaN(amount) || amount <= 0) return;

    setSaving(true);
    try {
      const signedAmount = editType === "expense" ? -Math.abs(amount) : Math.abs(amount);
      await updateTransaction(txn.id, {
        date: editDate,
        amount: signedAmount,
        currency: txn.currency,
        category: editCategory,
        description: editDescription,
        raw_input: `${editCategory} ${editDescription || ""}`.trim(),
      });
      setShowEdit(false);
      if (onUpdate) onUpdate(txn.id);
    } catch (e) {
      console.error("Failed to update transaction:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 0",
          borderBottom: "1px solid var(--border-subtle)",
          transition: "background 0.15s",
          background: hovered ? "var(--neutral-50)" : "transparent",
        }}
      >
        {/* Date */}
        <div style={{ width: getColWidth("date"), padding: "0 12px", fontSize: 13, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", borderRight: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          {txn.date}
        </div>

        {/* Category */}
        <div style={{ width: getColWidth("category"), padding: "0 12px", borderRight: "1px solid var(--border-subtle)", flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color, background: `${color}12`, padding: "2px 8px", borderRadius: 4 }}>
            {txn.category}
          </span>
        </div>

        {/* Description */}
        <div style={{ flex: 1, padding: "0 12px", fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, borderRight: "1px solid var(--border-subtle)" }}>
          {txn.description || txn.raw_input}
        </div>

        {/* Amount */}
        <div style={{ width: getColWidth("amount"), padding: "0 12px", fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono)", color: txn.is_income ? "var(--color-success)" : "var(--text-primary)", textAlign: "right", flexShrink: 0 }}>
          {sign}¥{txn.abs_amount.toLocaleString()}
        </div>

        {/* Actions */}
        <div style={{ width: 72, flexShrink: 0, padding: "0 8px", display: "flex", gap: 2, justifyContent: "center" }}>
          {onUpdate && (
            <button
              onClick={() => setShowEdit(true)}
              style={{
                width: 28,
                height: 28,
                background: "none",
                border: "none",
                color: hovered ? "var(--color-primary)" : "transparent",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                transition: "all 0.15s",
              }}
            >
              <Pencil size={13} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => setShowConfirm(true)}
              style={{
                width: 28,
                height: 28,
                background: "none",
                border: "none",
                color: hovered ? "var(--color-danger)" : "transparent",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                transition: "all 0.15s",
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showConfirm && onDelete && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999, animation: "modalBackdrop 0.15s ease" }} onClick={() => setShowConfirm(false)} />
          <div style={{ position: "fixed", left: "50%", top: "50%", width: 320, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", zIndex: 1000, animation: "modalPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(168, 54, 52, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle size={14} color="var(--color-danger)" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>删除这笔交易？</span>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <div style={{ padding: "12px 14px", background: "var(--bg-page)", borderRadius: 8, marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: "var(--text-primary)", margin: 0, fontWeight: 500 }}>{txn.description || txn.raw_input}</p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "6px 0 0", fontFamily: "var(--font-mono)" }}>{sign}¥{txn.abs_amount.toLocaleString()} · {txn.date}</p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: "10px 0", background: "var(--neutral-100)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>取消</button>
                <button onClick={handleDelete} style={{ flex: 1, padding: "10px 0", background: "var(--color-danger)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "white" }}>删除</button>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}

      {/* Edit modal */}
      {showEdit && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999, animation: "modalBackdrop 0.15s ease" }} onClick={() => setShowEdit(false)} />
          <div style={{ position: "fixed", left: "50%", top: "50%", width: 400, maxWidth: "90vw", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", zIndex: 1000, animation: "modalPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(13, 115, 119, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Pencil size={14} color="var(--color-primary)" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>编辑交易</span>
              </div>
              <button onClick={() => setShowEdit(false)} style={{ width: 28, height: 28, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, color: "var(--text-tertiary)" }}>
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Type toggle */}
              <div style={{ display: "flex", gap: 8 }}>
                {(["expense", "income"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setEditType(type)}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      fontSize: 13,
                      fontWeight: 500,
                      borderRadius: 8,
                      border: "1px solid",
                      borderColor: editType === type ? (type === "expense" ? "var(--color-danger)" : "var(--color-success)") : "var(--border-subtle)",
                      background: editType === type ? (type === "expense" ? "rgba(220, 38, 38, 0.08)" : "rgba(22, 163, 74, 0.08)") : "transparent",
                      color: editType === type ? (type === "expense" ? "var(--color-danger)" : "var(--color-success)") : "var(--text-tertiary)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {type === "expense" ? "支出" : "收入"}
                  </button>
                ))}
              </div>

              {/* Date */}
              <div>
                <label style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4, display: "block" }}>日期</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-primary)", outline: "none", fontFamily: "var(--font-mono)" }}
                />
              </div>

              {/* Amount */}
              <div>
                <label style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4, display: "block" }}>金额</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>¥</span>
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    min="0"
                    step="0.01"
                    style={{ width: "100%", padding: "8px 12px 8px 28px", fontSize: 14, fontWeight: 600, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-primary)", outline: "none", fontFamily: "var(--font-mono)" }}
                  />
                </div>
              </div>

              {/* Category dropdown */}
              <div>
                <label style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4, display: "block" }}>分类</label>
                <div style={{ position: "relative" }} ref={catRef}>
                  {/* Trigger */}
                  <button
                    type="button"
                    onClick={() => setCatDropdownOpen((v) => !v)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 13,
                      borderRadius: 8,
                      border: "1px solid var(--border-subtle)",
                      background: "var(--bg-page)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {editCategory || "选择分类"}
                    </span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transform: catDropdownOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}>
                      <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* Dropdown list */}
                  {catDropdownOpen && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        marginTop: 4,
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
                        const catColor = CATEGORY_COLORS[cat] || CATEGORY_COLORS["其他"];
                        return (
                          <div
                            key={cat}
                            onClick={() => {
                              setEditCategory(cat);
                              setCatDropdownOpen(false);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "6px 10px",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontSize: 13,
                              color: "var(--text-primary)",
                              background: editCategory === cat ? "var(--bg-page)" : "transparent",
                              transition: "background 0.1s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-page)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = editCategory === cat ? "var(--bg-page)" : "transparent")}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: catColor, flexShrink: 0 }} />
                            <span>{cat}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4, display: "block" }}>备注</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="可选"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-primary)", outline: "none" }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowEdit(false)} style={{ padding: "8px 16px", background: "var(--neutral-100)", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editAmount || parseFloat(editAmount) <= 0}
                style={{
                  padding: "8px 16px",
                  background: "var(--color-primary)",
                  border: "none",
                  borderRadius: 8,
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "white",
                  opacity: saving || !editAmount || parseFloat(editAmount) <= 0 ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Check size={14} />
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
