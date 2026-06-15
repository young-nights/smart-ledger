interface BudgetProgressProps {
  usagePct: number;
  status: "normal" | "warning" | "overspent";
}

export function BudgetProgress({ usagePct, status }: BudgetProgressProps) {
  const pct = Math.min(usagePct, 100);
  const fillClass =
    status === "overspent"
      ? "progress-bar-fill progress-bar-fill--danger"
      : status === "warning"
      ? "progress-bar-fill progress-bar-fill--warning"
      : "progress-bar-fill progress-bar-fill--normal";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div className="progress-bar" style={{ flex: 1 }}>
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>
      <span
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          minWidth: 36,
          textAlign: "right",
        }}
      >
        {usagePct.toFixed(0)}%
      </span>
    </div>
  );
}
