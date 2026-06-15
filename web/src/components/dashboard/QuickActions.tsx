/**
 * Quick Actions — floating action button in bottom-right corner.
 * Clean expanded items without heavy card wrappers.
 */

import { useState } from "react";
import { Plus, Receipt, Download, X } from "lucide-react";
import { ThemeToggle } from "../ui/ThemeToggle";
import { exportToCSV, downloadFile } from "../../lib/export";
import { fetchTransactions, getExportCSVUrl } from "../../lib/api";

export function QuickActions() {
  const [open, setOpen] = useState(false);

  const handleExport = async () => {
    try {
      const txns = await fetchTransactions();
      const csv = exportToCSV(txns);
      downloadFile(csv, "transactions.csv", "text/csv;charset=utf-8");
    } catch {
      window.open(getExportCSVUrl(), "_blank");
    }
    setOpen(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 10,
      }}
    >
      {open && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            animation: "fadeIn 0.2s var(--ease-out-quart)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-surface)",
              padding: "6px 12px",
              borderRadius: 8,
              boxShadow: "var(--shadow-md)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Theme
            </span>
            <ThemeToggle />
          </div>

          <button
            onClick={handleExport}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-surface)",
              padding: "8px 14px",
              borderRadius: 8,
              boxShadow: "var(--shadow-md)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              transition: "background 0.15s",
            }}
          >
            <Download size={14} />
            Export CSV
          </button>

          <button
            onClick={() => {
              window.location.href = "/transactions";
              setOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg-surface)",
              padding: "8px 14px",
              borderRadius: 8,
              boxShadow: "var(--shadow-md)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              transition: "background 0.15s",
            }}
          >
            <Receipt size={14} />
            Quick Record
          </button>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "var(--color-primary)",
          color: "white",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--shadow-lg)",
          transition:
            "transform 0.2s var(--ease-out-quart), background 0.15s",
          transform: open ? "rotate(45deg)" : "rotate(0deg)",
        }}
        aria-label="Quick actions"
      >
        {open ? <X size={20} /> : <Plus size={20} />}
      </button>
    </div>
  );
}
