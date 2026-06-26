/**
 * DayTradePanel — expandable panel for managing T-trading records.
 * Shows a list of trades and a form to add new ones.
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import type { DayTrade } from "../../lib/types";
import { fetchDayTrades, addDayTrade, deleteDayTrade } from "../../lib/api";
import { useTranslation } from "../../i18n";

interface DayTradePanelProps {
  ticker: string;
  currencySymbol: string;
  onTradesUpdated: () => void;
}

export function DayTradePanel({ ticker, currencySymbol, onTradesUpdated }: DayTradePanelProps) {
  const { t } = useTranslation();
  const [trades, setTrades] = useState<DayTrade[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [tradeType, setTradeType] = useState<"sell" | "buy">("sell");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");

  const loadTrades = async () => {
    try {
      const data = await fetchDayTrades(ticker);
      setTrades(data);
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    loadTrades();
  }, [ticker]);

  // Calculate total day trade P&L (FIFO matching)
  const totalPnl = (() => {
    const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    let pnl = 0;
    const pendingSells: { price: number; qty: number }[] = [];

    for (const trade of sorted) {
      if (trade.trade_type === "sell") {
        pendingSells.push({ price: trade.price, qty: trade.quantity });
      } else if (trade.trade_type === "buy" && pendingSells.length > 0) {
        const sell = pendingSells[0];
        const matchQty = Math.min(sell.qty, trade.quantity);
        pnl += (trade.price - sell.price) * matchQty;
        if (matchQty >= sell.qty) {
          pendingSells.shift();
        } else {
          sell.qty -= matchQty;
        }
      }
    }
    return pnl;
  })();

  const handleSubmit = async () => {
    if (!price || !quantity) return;
    try {
      await addDayTrade({
        ticker,
        trade_type: tradeType,
        price: parseFloat(price),
        quantity: parseFloat(quantity),
        trade_date: tradeDate,
        notes,
      });
      setPrice("");
      setQuantity("");
      setNotes("");
      setShowForm(false);
      loadTrades();
      onTradesUpdated();
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t("stocks.dayTrade.confirmDelete"))) return;
    try {
      await deleteDayTrade(id);
      loadTrades();
      onTradesUpdated();
    } catch {
      // silently fail
    }
  };

  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 12px",
        background: "var(--bg-secondary, #f8fafc)",
        borderRadius: 8,
        border: "1px solid var(--border-light, #f1f5f9)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
            {t("stocks.dayTrade")}
          </span>
          {trades.length > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 4,
                background: totalPnl >= 0 ? "rgba(22, 163, 74, 0.1)" : "rgba(220, 38, 38, 0.1)",
                color: totalPnl >= 0 ? "var(--color-success, #16a34a)" : "var(--color-danger, #dc2626)",
              }}
            >
              {totalPnl >= 0 ? "+" : ""}{currencySymbol}{totalPnl.toFixed(2)}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            borderRadius: 6,
            border: "1px solid var(--border-default, #d6d3d1)",
            background: "var(--bg-surface, #ffffff)",
            color: "var(--text-secondary)",
            fontSize: 10,
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          <Plus size={10} />
          {t("stocks.dayTrade.add")}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 8,
            padding: 8,
            background: "var(--bg-surface, #ffffff)",
            borderRadius: 6,
            border: "1px solid var(--border-light, #e2e8f0)",
          }}
        >
          {/* Type toggle */}
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border-default, #d6d3d1)" }}>
            <button
              onClick={() => setTradeType("sell")}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
                background: tradeType === "sell" ? "var(--color-danger, #dc2626)" : "transparent",
                color: tradeType === "sell" ? "#fff" : "var(--text-secondary)",
                transition: "all 0.2s",
              }}
            >
              {t("stocks.dayTrade.sell")}
            </button>
            <button
              onClick={() => setTradeType("buy")}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 500,
                border: "none",
                borderLeft: "1px solid var(--border-default, #d6d3d1)",
                cursor: "pointer",
                background: tradeType === "buy" ? "var(--color-success, #16a34a)" : "transparent",
                color: tradeType === "buy" ? "#fff" : "var(--text-secondary)",
                transition: "all 0.2s",
              }}
            >
              {t("stocks.dayTrade.buy")}
            </button>
          </div>

          <input
            type="number"
            placeholder={t("stocks.dayTrade.price")}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={inputStyle}
          />
          <input
            type="number"
            placeholder={t("stocks.dayTrade.quantity")}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={inputStyle}
          />
          <input
            type="datetime-local"
            value={tradeDate}
            onChange={(e) => setTradeDate(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 140px" }}
          />
          <button
            onClick={handleSubmit}
            disabled={!price || !quantity}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: "none",
              background: "var(--color-primary, #0891b2)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 500,
              cursor: !price || !quantity ? "not-allowed" : "pointer",
              opacity: !price || !quantity ? 0.5 : 1,
              transition: "all 0.2s",
            }}
          >
            ✓
          </button>
        </div>
      )}

      {/* Trade list */}
      {trades.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {trades.map((trade) => (
            <div
              key={trade.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 8px",
                borderRadius: 4,
                background: "var(--bg-surface, #ffffff)",
                fontSize: 11,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {trade.trade_type === "sell" ? (
                  <TrendingUp size={11} color="var(--color-danger, #dc2626)" />
                ) : (
                  <TrendingDown size={11} color="var(--color-success, #16a34a)" />
                )}
                <span
                  style={{
                    fontWeight: 600,
                    color: trade.trade_type === "sell" ? "var(--color-danger, #dc2626)" : "var(--color-success, #16a34a)",
                  }}
                >
                  {trade.trade_type === "sell" ? t("stocks.dayTrade.sell") : t("stocks.dayTrade.buy")}
                </span>
                <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {currencySymbol}{trade.price} × {trade.quantity}
                </span>
                <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>
                  {trade.trade_date.slice(0, 10)}
                </span>
              </div>
              <button
                onClick={() => handleDelete(trade.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted, #a8a29e)",
                  cursor: "pointer",
                  padding: 2,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: "1 1 70px",
  padding: "4px 8px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  border: "1px solid var(--border-default, #d6d3d1)",
  borderRadius: 4,
  background: "var(--bg-surface, #ffffff)",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};
