/**
 * TransactionList — flat list with section header.
 * No card wrapper. Uses spacing and lines for hierarchy.
 */

import type { Transaction } from "../../lib/types";
import { TransactionRow } from "./TransactionRow";
import { useTranslation } from "../../i18n";

interface TransactionListProps {
  transactions: Transaction[];
  loading?: boolean;
  onDelete?: (id: number) => void;
  onUpdate?: (id: number) => void;
}

export function TransactionList({
  transactions,
  loading,
  onDelete,
  onUpdate,
}: TransactionListProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
        {t("common.loading")}
      </p>
    );
  }

  if (transactions.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
        {t("txn.empty")}
      </p>
    );
  }

  return (
    <div>
      {/* Section header — left-aligned */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
        }}
      >
        <h4>
          {t("txn.list")}
        </h4>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {transactions.length} {t("nav.transactions").toLowerCase()}
        </span>
      </div>

      {/* Table header */}
      <div className="table-header">
        <span style={{ width: 100 }}>{t("txn.date")}</span>
        <span style={{ width: 100 }}>{t("txn.category")}</span>
        <span style={{ flex: 1 }}>{t("txn.desc")}</span>
        <span style={{ width: 120, textAlign: "right" }}>{t("txn.amount")}</span>
        <span style={{ width: 72 }}></span>
      </div>

      {/* Rows */}
      {transactions.map((txn, i) => (
        <div
          key={txn.id}
          className="animate-in"
          style={{
            animationDelay: `${i * 0.03}s`,
            animationFillMode: "both",
          }}
        >
          <TransactionRow txn={txn} onDelete={onDelete} onUpdate={onUpdate} />
        </div>
      ))}
    </div>
  );
}
