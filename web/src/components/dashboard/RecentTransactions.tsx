/**
 * RecentTransactions — exactly matches Transactions page style.
 * Draggable headers, category color tags, vertical dividers, card-style rows.
 */

import { useState } from "react";
import type { Transaction } from "../../lib/types";
import { useTranslation } from "../../i18n";
import { DraggableHeader, DraggableHeaderProvider, useDraggableColumns } from "../transactions/DraggableHeader";

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

interface RecentTransactionsProps {
  transactions: Transaction[];
}

function Row({ txn }: { txn: Transaction }) {
  const [hovered, setHovered] = useState(false);
  const { columns } = useDraggableColumns();
  const sign = txn.is_income ? "+" : "-";
  const color = CATEGORY_COLORS[txn.category] || CATEGORY_COLORS["其他"];

  const getColWidth = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (!col) return 100;
    return col.flex ? undefined : col.width || 100;
  };

  return (
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

      {/* Spacer for delete column */}
      <div style={{ width: 40, flexShrink: 0, padding: "0 8px" }} />
    </div>
  );
}

export function RecentTransactions({ transactions }: RecentTransactionsProps) {
  const { t } = useTranslation();

  if (transactions.length === 0) {
    return (
      <div>
        <h4 style={{ marginBottom: 12 }}>{t("dashboard.recent")}</h4>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          {t("common.noTransactions")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 16,
        }}
      >
        <h4>{t("dashboard.recent")}</h4>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {transactions.length} {t("nav.transactions").toLowerCase()}
        </span>
      </div>

      <DraggableHeaderProvider
        initialColumns={[
          { key: "date", label: t("txn.date"), initialWidth: 110, minWidth: 80 },
          { key: "category", label: t("txn.category"), initialWidth: 90, minWidth: 60 },
          { key: "description", label: t("txn.desc"), flex: true },
          { key: "amount", label: t("txn.amount"), initialWidth: 130, minWidth: 80 },
        ]}
      >
        <div
          style={{
            background: "var(--bg-surface)",
            borderRadius: 12,
            border: "1px solid var(--border-subtle)",
            overflow: "hidden",
          }}
        >
          <DraggableHeader />
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            {transactions.slice(0, 10).map((txn) => (
              <Row key={txn.id} txn={txn} />
            ))}
          </div>
        </div>
      </DraggableHeaderProvider>
    </div>
  );
}
