/**
 * DayTradePanel — expandable panel for T-trading records.
 * Shows all trades in a flat list, grouped by date.
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import type { DayTrade } from "../../lib/types";
import { fetchDayTrades, addDayTrade, deleteDayTrade, estimateFees } from "../../lib/api";
import { useTranslation } from "../../i18n";

interface DayTradePanelProps {
  ticker: string;
  currencySymbol: string;
  market: string;
  onTradesUpdated: () => void;
}

export function DayTradePanel({ ticker, currencySymbol, market, onTradesUpdated }: DayTradePanelProps) {
  const { t } = useTranslation();
  const [trades, setTrades] = useState<DayTrade[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [sellQty, setSellQty] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [buyQty, setBuyQty] = useState("");
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10));
  const [fees, setFees] = useState<{ sell: number; buy: number }>({ sell: 0, buy: 0 });

  const loadTrades = async () => {
    try { setTrades(await fetchDayTrades(ticker)); } catch {}
  };
  useEffect(() => { loadTrades(); }, [ticker]);

  useEffect(() => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) { setFees({ sell: 0, buy: 0 }); return; }
    const sq = parseFloat(sellQty), bq = parseFloat(buyQty), sp = parseFloat(sellPrice), bp = parseFloat(buyPrice);
    if (sq <= 0 || bq <= 0 || sp <= 0 || bp <= 0) return;
    Promise.all([
      estimateFees({ trade_type: "sell", price: sp, quantity: sq, market }),
      estimateFees({ trade_type: "buy", price: bp, quantity: bq, market }),
    ]).then(([s, b]) => setFees({ sell: s.total_fee, buy: b.total_fee })).catch(() => {});
  }, [sellPrice, buyPrice, sellQty, buyQty, market]);

  // Calculate total P&L using FIFO matching
  const totalPnl = (() => {
    const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    let pnl = 0;
    const pendingSells: { price: number; qty: number }[] = [];
    for (const t of sorted) {
      if (t.trade_type === "sell") {
        pendingSells.push({ price: t.price, qty: t.quantity });
      } else if (t.trade_type === "buy" && pendingSells.length > 0) {
        const s = pendingSells[0];
        const matchQty = Math.min(s.qty, t.quantity);
        pnl += (s.price - t.price) * matchQty;
        if (matchQty >= s.qty) pendingSells.shift();
        else s.qty -= matchQty;
      }
    }
    return pnl;
  })();

  const handleSubmit = async () => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) return;
    const sp = parseFloat(sellPrice);
    const sq = parseFloat(sellQty);
    const bp = parseFloat(buyPrice);
    const bq = parseFloat(buyQty);
    try {
      const dt = tradeDate + " " + new Date().toTimeString().slice(0, 8);
      const [sf, bf] = await Promise.all([
        estimateFees({ trade_type: "sell", price: sp, quantity: sq, market }),
        estimateFees({ trade_type: "buy", price: bp, quantity: bq, market }),
      ]);
      await addDayTrade({ ticker, trade_type: "sell", price: sp, quantity: sq, trade_date: dt, notes: JSON.stringify({ fee: sf.total_fee }) });
      await addDayTrade({ ticker, trade_type: "buy", price: bp, quantity: bq, trade_date: dt, notes: JSON.stringify({ fee: bf.total_fee }) });
      setSellPrice(""); setSellQty(""); setBuyPrice(""); setBuyQty(""); setShowForm(false);
      loadTrades(); onTradesUpdated();
    } catch (e) { console.error('Submit error:', e); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteDayTrade(id); loadTrades(); onTradesUpdated(); } catch {}
  };

  const parseFee = (n: string) => { try { return JSON.parse(n).fee || 0; } catch { return 0; } };

  // Sort trades by date descending for display
  const sortedTrades = [...trades].sort((a, b) => b.trade_date.localeCompare(a.trade_date));

  return (
    <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--bg-secondary, #f8fafc)", borderRadius: 8, border: "1px solid var(--border-light, #f1f5f9)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>做T记录</span>
          {trades.length > 0 && (
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, color: totalPnl >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
              预估T盈亏 {totalPnl >= 0 ? "+" : ""}{currencySymbol}{totalPnl.toFixed(3)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); setShowForm(!showForm); }}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
            <Plus size={12} />添加做T
          </button>
          {expanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ marginTop: 10, padding: 12, background: "var(--bg-surface)", borderRadius: 8, border: "1px solid var(--border-light)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-danger)", marginBottom: 4 }}>卖出</div>
              <input type="number" placeholder="价格" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
              <input type="number" placeholder="数量" value={sellQty} onChange={(e) => setSellQty(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-success)", marginBottom: 4 }}>买回</div>
              <input type="number" placeholder="价格" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} />
              <input type="number" placeholder="数量" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
          {sellPrice && buyPrice && sellQty && buyQty && (
            <div style={{ padding: "8px 10px", background: "var(--bg-secondary)", borderRadius: 6, fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>
              <div>差价: <b>{(parseFloat(sellPrice) - parseFloat(buyPrice)).toFixed(3)}</b></div>
              <div>已匹配盈亏: <b style={{ color: (parseFloat(sellPrice) - parseFloat(buyPrice)) * Math.min(parseFloat(sellQty), parseFloat(buyQty)) >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                {currencySymbol}{((parseFloat(sellPrice) - parseFloat(buyPrice)) * Math.min(parseFloat(sellQty), parseFloat(buyQty))).toFixed(3)}
              </b></div>
              {parseInt(sellQty) !== parseInt(buyQty) && <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>卖出{sellQty}股，买回{buyQty}股</div>}
              {(fees.sell > 0 || fees.buy > 0) && <div style={{ color: "var(--text-tertiary)" }}>预估费用: {currencySymbol}{(fees.sell + fees.buy).toFixed(3)}</div>}
            </div>
          )}
          <button onClick={handleSubmit} disabled={!sellPrice || !buyPrice || !sellQty || !buyQty}
            style={{ width: "100%", padding: "8px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: !sellPrice || !buyPrice || !sellQty || !buyQty ? "not-allowed" : "pointer", opacity: !sellPrice || !buyPrice || !sellQty || !buyQty ? 0.5 : 1 }}>
            {t("common.save")}
          </button>
        </div>
      )}

      {/* Trade list */}
      {expanded && sortedTrades.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {sortedTrades.map((trade) => (
            <div key={trade.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--bg-surface)", borderRadius: 6, border: "1px solid var(--border-light)", fontSize: 11 }}>
              <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: trade.trade_type === "sell" ? "rgba(8, 145, 178, 0.1)" : "rgba(220, 38, 38, 0.1)", color: trade.trade_type === "sell" ? "var(--color-primary)" : "var(--color-danger)" }}>
                {trade.trade_type === "sell" ? "卖" : "买"}
              </span>
              <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{trade.trade_date.slice(5, 16).replace("T", " ")}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{trade.price.toFixed(3)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: trade.trade_type === "sell" ? "var(--color-success)" : "var(--color-danger)", minWidth: 70, textAlign: "right" }}>
                {trade.trade_type === "sell" ? "+" : "-"}{(trade.price * trade.quantity).toFixed(3)}
              </span>
              <span style={{ color: "var(--text-tertiary)", fontSize: 10, minWidth: 24, textAlign: "right" }}>{trade.quantity}</span>
              <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 32, textAlign: "right" }}>{parseFee(trade.notes).toFixed(2)}</span>
              <button onClick={() => handleDelete(trade.id)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, display: "flex" }}>
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
  width: "100%", padding: "7px 10px", fontSize: 12, fontFamily: "var(--font-mono)",
  border: "1px solid var(--border-default, #d6d3d1)", borderRadius: 6,
  background: "var(--bg-surface, #ffffff)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box",
};
