/**
 * DayTradePanel — expandable panel for managing T-trading records.
 * Each T-trade is a paired sell+buy operation with P&L calculation.
 */

import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  const [sellPrice, setSellPrice] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10));
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
        pnl += (sell.price - trade.price) * matchQty;
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
    if (!sellPrice || !buyPrice || !quantity) return;
    try {
      // Record as two trades: sell first, then buy
      const tradeDateStr = tradeDate + " " + new Date().toTimeString().slice(0, 8);
      await addDayTrade({
        ticker,
        trade_type: "sell",
        price: parseFloat(sellPrice),
        quantity: parseFloat(quantity),
        trade_date: tradeDateStr,
        notes: notes || `T: ${currencySymbol}${sellPrice} → ${currencySymbol}${buyPrice}`,
      });
      await addDayTrade({
        ticker,
        trade_type: "buy",
        price: parseFloat(buyPrice),
        quantity: parseFloat(quantity),
        trade_date: tradeDateStr,
        notes: notes || `T: ${currencySymbol}${sellPrice} → ${currencySymbol}${buyPrice}`,
      });
      setSellPrice("");
      setBuyPrice("");
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

  // Group trades into pairs (sell + buy)
  const tradePairs = (() => {
    const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const pairs: { sell: DayTrade; buy: DayTrade | null; pnl: number }[] = [];
    const pendingSells: DayTrade[] = [];

    for (const trade of sorted) {
      if (trade.trade_type === "sell") {
        pendingSells.push(trade);
      } else if (trade.trade_type === "buy" && pendingSells.length > 0) {
        const sell = pendingSells.shift()!;
        const pnl = (sell.price - trade.price) * trade.quantity;
        pairs.push({ sell, buy: trade, pnl });
      }
    }
    // Unmatched sells
    for (const sell of pendingSells) {
      pairs.push({ sell, buy: null, pnl: 0 });
    }
    return pairs.reverse(); // Show newest first
  })();

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
          {tradePairs.length > 0 && (
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
          <div style={{ flex: "1 1 100%", fontSize: 10, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 2 }}>
            {t("stocks.dayTrade.sell")} → {t("stocks.dayTrade.buy")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "1 1 70px" }}>
            <span style={{ fontSize: 10, color: "var(--color-danger)", fontWeight: 600 }}>卖</span>
            <input
              type="number"
              placeholder={t("stocks.dayTrade.price")}
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              style={{ ...inputStyle, borderColor: sellPrice ? "var(--color-danger)" : undefined }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "1 1 70px" }}>
            <span style={{ fontSize: 10, color: "var(--color-success)", fontWeight: 600 }}>买</span>
            <input
              type="number"
              placeholder={t("stocks.dayTrade.price")}
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              style={{ ...inputStyle, borderColor: buyPrice ? "var(--color-success)" : undefined }}
            />
          </div>
          <input
            type="number"
            placeholder={t("stocks.dayTrade.quantity")}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={inputStyle}
          />
          <input
            type="date"
            value={tradeDate}
            onChange={(e) => setTradeDate(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 100px" }}
          />
          {sellPrice && buyPrice && quantity && (
            <div
              style={{
                flex: "1 1 100%",
                fontSize: 11,
                fontWeight: 600,
                color: (parseFloat(sellPrice) - parseFloat(buyPrice)) * parseFloat(quantity) >= 0
                  ? "var(--color-success)" : "var(--color-danger)",
                textAlign: "right",
              }}
            >
              预计盈亏: {currencySymbol}{((parseFloat(sellPrice) - parseFloat(buyPrice)) * parseFloat(quantity)).toFixed(2)}
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={!sellPrice || !buyPrice || !quantity}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              border: "none",
              background: "var(--color-primary, #0891b2)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 500,
              cursor: !sellPrice || !buyPrice || !quantity ? "not-allowed" : "pointer",
              opacity: !sellPrice || !buyPrice || !quantity ? 0.5 : 1,
              transition: "all 0.2s",
            }}
          >
            ✓
          </button>
        </div>
      )}

      {/* Trade pairs list */}
      {tradePairs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {tradePairs.map((pair, idx) => (
            <div
              key={idx}
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
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                <span style={{ color: "var(--color-danger)", fontWeight: 600, fontSize: 10 }}>卖</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  {currencySymbol}{pair.sell.price}
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>→</span>
                {pair.buy ? (
                  <>
                    <span style={{ color: "var(--color-success)", fontWeight: 600, fontSize: 10 }}>买</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                      {currencySymbol}{pair.buy.price}
                    </span>
                  </>
                ) : (
                  <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>待买回</span>
                )}
                <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>×{pair.sell.quantity}</span>
                <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>
                  {pair.sell.trade_date.slice(0, 10)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {pair.buy && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono)",
                      color: pair.pnl >= 0 ? "var(--color-success)" : "var(--color-danger)",
                    }}
                  >
                    {pair.pnl >= 0 ? "+" : ""}{currencySymbol}{pair.pnl.toFixed(2)}
                  </span>
                )}
                <button
                  onClick={() => {
                    handleDelete(pair.sell.id);
                    if (pair.buy) handleDelete(pair.buy.id);
                  }}
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
