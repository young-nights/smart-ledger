/**
 * StockPortfolio — manage and track stock holdings.
 * Displays a list of holdings with buy/current prices, P&L, and a summary bar.
 */

import { useState, useEffect, useCallback } from "react";
import {
  fetchStockHoldings,
  addStockHolding,
  deleteStockHolding,
  refreshStockPrices,
} from "../lib/api";
import type { StockHolding } from "../lib/types";
import { StockCard } from "../components/stock/StockCard";
import { useTranslation } from "../i18n";
import { Plus, RefreshCw, TrendingUp } from "lucide-react";

export default function StockPortfolio() {
  const { t } = useTranslation();
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [buyDate, setBuyDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHoldings(await fetchStockHoldings());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const updated = await refreshStockPrices();
      setHoldings(updated);
    } catch {
      // silently fail
    } finally {
      setRefreshing(false);
    }
  };

  const handleAdd = async () => {
    if (!ticker.trim() || !buyPrice || !quantity) return;
    try {
      const newHolding = await addStockHolding(
        ticker.trim(),
        name.trim(),
        parseFloat(buyPrice),
        parseFloat(quantity),
        buyDate
      );
      setHoldings((prev) => [newHolding, ...prev]);
      setShowForm(false);
      setTicker("");
      setName("");
      setBuyPrice("");
      setQuantity("");
      setBuyDate(new Date().toISOString().split("T")[0]);
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t("stocks.confirmDelete"))) return;
    try {
      await deleteStockHolding(id);
      setHoldings((prev) => prev.filter((h) => h.id !== id));
    } catch {
      // silently fail
    }
  };

  // Summary calculations
  const totalCost = holdings.reduce((sum, h) => sum + h.cost, 0);
  const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const isPositive = totalPnl >= 0;
  const pnlColor = isPositive
    ? "var(--color-success, #22c55e)"
    : "var(--color-danger, #ef4444)";

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TrendingUp size={20} color="#0d7377" />
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              fontFamily: "var(--font-display)",
            }}
          >
            {t("stocks.title")}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing || holdings.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: refreshing || holdings.length === 0 ? "not-allowed" : "pointer",
              opacity: refreshing || holdings.length === 0 ? 0.5 : 1,
              transition: "all 0.2s",
            }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: refreshing ? "spin 1s linear infinite" : "none",
              }}
            />
            {refreshing ? t("stocks.refreshing") : t("stocks.refresh")}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg, #2cb5ac 0%, #0d7377 100%)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(13, 115, 119, 0.3)",
              transition: "all 0.2s",
            }}
          >
            <Plus size={14} />
            {t("stocks.add")}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {holdings.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 32,
            padding: "16px 20px",
            background: "var(--bg-card, rgba(255,255,255,0.03))",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: 12,
            marginBottom: 20,
          }}
        >
          <SummaryItem
            label={t("stocks.totalAssets")}
            value={`¥${totalValue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
          />
          <SummaryItem
            label={t("stocks.cost")}
            value={`¥${totalCost.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
          />
          <SummaryItem
            label={t("stocks.totalPnl")}
            value={`${isPositive ? "+" : ""}¥${totalPnl.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
            color={pnlColor}
          />
          <SummaryItem
            label={t("stocks.pnlPct")}
            value={`${isPositive ? "+" : ""}${totalPnlPct.toFixed(2)}%`}
            color={pnlColor}
          />
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div
          style={{
            background: "var(--bg-card, rgba(255,255,255,0.03))",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <FormField
              label={t("stocks.ticker")}
              value={ticker}
              onChange={setTicker}
              placeholder={t("stocks.tickerPlaceholder")}
            />
            <FormField
              label={t("stocks.name")}
              value={name}
              onChange={setName}
              placeholder={t("stocks.namePlaceholder")}
            />
            <FormField
              label={t("stocks.buyPrice")}
              value={buyPrice}
              onChange={setBuyPrice}
              type="number"
            />
            <FormField
              label={t("stocks.quantity")}
              value={quantity}
              onChange={setQuantity}
              type="number"
            />
            <FormField
              label={t("stocks.buyDate")}
              value={buyDate}
              onChange={setBuyDate}
              type="date"
            />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleAdd}
              disabled={!ticker.trim() || !buyPrice || !quantity}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "linear-gradient(135deg, #2cb5ac 0%, #0d7377 100%)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  !ticker.trim() || !buyPrice || !quantity
                    ? "not-allowed"
                    : "pointer",
                opacity: !ticker.trim() || !buyPrice || !quantity ? 0.5 : 1,
              }}
            >
              {t("common.confirm")}
            </button>
          </div>
        </div>
      )}

      {/* Holdings list */}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          {t("common.loading")}
        </p>
      ) : holdings.length === 0 ? (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-tertiary)",
            textAlign: "center",
            padding: "40px 0",
          }}
        >
          {t("stocks.empty")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {holdings.map((h) => (
            <StockCard key={h.id} holding={h} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Spin animation for refresh icon */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Helper sub-components ─────────────────────────────────────

function SummaryItem({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
          color: color || "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 11,
          color: "var(--text-tertiary)",
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.03)",
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: type === "number" ? "var(--font-mono)" : "inherit",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
