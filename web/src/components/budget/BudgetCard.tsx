/**
 * BudgetCard — Clean pixel-style budget display with smooth delete animation.
 * 100-block progress bar, minimal design, hover delete.
 */

import { useState, useRef } from "react";
import { Trash2 } from "lucide-react";
import type { BudgetStatus } from "../../lib/types";
import { useTranslation } from "../../i18n";

interface BudgetCardProps {
  budget: BudgetStatus;
  delay?: number;
  onDelete?: () => void;
}

export function BudgetCard({ budget, delay = 0, onDelete }: BudgetCardProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDelete = () => {
    setDeleting(true);
    // Wait for animation then call parent
    setTimeout(() => onDelete?.(), 280);
  };

  const statusColor =
    budget.status === "overspent"
      ? "#ef4444"
      : budget.status === "warning"
        ? "#eab308"
        : "#22c55e";

  const usagePct = Math.min(budget.usage_pct, 100);
  const totalBlocks = 100;
  const filledBlocks = Math.round((usagePct / 100) * totalBlocks);

  return (
    <div
      ref={cardRef}
      className="animate-in"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "20px 24px",
        animationDelay: `${delay}s`,
        animationFillMode: "both",
        background: "#ffffff",
        borderRadius: 8,
        border: "1px solid #e5e5e5",
        boxShadow: deleting
          ? "0 0 0 2px rgba(239, 68, 68, 0.2), 0 4px 12px rgba(239, 68, 68, 0.1)"
          : hovered
            ? "0 8px 24px rgba(0, 0, 0, 0.08)"
            : "0 1px 4px rgba(0, 0, 0, 0.04)",
        transition: "all 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: deleting
          ? "scale(0.95) translateX(20px)"
          : hovered
            ? "translateY(-2px)"
            : "translateY(0)",
        opacity: deleting ? 0 : 1,
        maxHeight: deleting ? "0" : "200px",
        marginBottom: deleting ? "0" : undefined,
        paddingBlock: deleting ? "0" : undefined,
        overflow: "hidden",
        position: "relative",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      {/* Header — category name + delete */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "#1a1a1a",
            letterSpacing: "0.01em",
          }}
        >
          {budget.category}
          <span style={{ fontSize: 11, color: "#999", marginLeft: 8, fontWeight: 400 }}>
            {budget.period === "day" ? "每天" : budget.period === "month" ? "每月" : budget.period === "year" ? "每年" : "全部"}
          </span>
        </span>

        {onDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              background: "none",
              border: "1px solid transparent",
              color: hovered ? "#ef4444" : "transparent",
              cursor: deleting ? "default" : "pointer",
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              gap: 4,
              borderRadius: 6,
              transition: "all 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
              opacity: hovered ? 1 : 0,
              transform: hovered ? "translateX(0)" : "translateX(8px)",
            }}
            title={t("common.delete")}
          >
            <Trash2 size={13} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>删除</span>
          </button>
        )}
      </div>

      {/* Amount row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 6,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "#999",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          ¥
        </span>
        <span
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "#1a1a1a",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {budget.spent.toLocaleString()}
        </span>
        <span
          style={{
            fontSize: 14,
            color: "#999",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          / ¥{budget.budget.toLocaleString()}
        </span>
      </div>

      {/* 100-block pixel progress bar — single row */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 16,
          padding: "8px 0",
        }}
      >
        {Array.from({ length: totalBlocks }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 20,
              background: i < filledBlocks ? statusColor : "#e5e5e5",
              transition: "background 0.3s",
            }}
          />
        ))}
      </div>

      {/* Footer — remaining + percentage */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 15,
            color: "#1a1a1a",
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 500,
          }}
        >
          {budget.status === "overspent" ? t("budget.overspent") : t("budget.remaining")}{": "}
          <span
            style={{
              color: budget.status === "overspent" ? "#ef4444" : "#1a1a1a",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            ¥{Math.abs(budget.remaining).toLocaleString()}
          </span>
        </span>
        <span
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: statusColor,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {usagePct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
