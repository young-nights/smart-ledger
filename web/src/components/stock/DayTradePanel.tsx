/**
 * DayTradePanel — expandable panel for managing T-trading records.
 * Clean card layout with buy/sell pairs, fees, and P&L preview.
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
    try {
      const data = await fetchDayTrades(ticker);
      setTrades(data);
    } catch { /* silently fail */ }
  };

  useEffect(() => { loadTrades(); }, [ticker]);

  // Calculate fees for preview
  useEffect(() => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) { setFees({ sell: 0, buy: 0 }); return; }
    const sq = parseFloat(sellQty), bq = parseFloat(buyQty), sp = parseFloat(sellPrice), bp = parseFloat(buyPrice);
    if (sq <= 0 || bq <= 0 || sp <= 0 || bp <= 0) return;
    Promise.all([
      estimateFees({ trade_type: "sell", price: sp, quantity: sq, market }),
      estimateFees({ trade_type: "buy", price: bp, quantity: bq, market }),
    ]).then(([s, b]) => setFees({ sell: s.total_fee, buy: b.total_fee })).catch(() => {});
  }, [sellPrice, buyPrice, sellQty, buyQty, market]);

  // Group trades into pairs
  const tradePairs = (() => {
    const sorted = [...trades].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
    const pairs: { sell: DayTrade; buy: DayTrade | null; pnl: number; diff: number }[] = [];
    const sellQueue = [...sorted.filter(t => t.trade_type === "sell")].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const buyQueue = [...sorted.filter(t => t.trade_type === "buy")].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const matchedSells = new Set<number>();
    const matchedBuys = new Set<number>();
    for (const sell of sellQueue) {
      for (const buy of buyQueue) {
        if (matchedBuys.has(buy.id)) continue;
        if (sell.quantity === buy.quantity) {
          matchedSells.add(sell.id); matchedBuys.add(buy.id);
          pairs.push({ sell, buy, pnl: (sell.price - buy.price) * sell.quantity, diff: sell.price - buy.price });
          break;
        }
      }
    }
    for (const sell of allSells(sellQueue, matchedSells)) pairs.push({ sell, buy: null, pnl: 0, diff: 0 });
    return pairs;
  })();

  function allSells(queue: DayTrade[], matched: Set<number>) {
    return queue.filter(s => !matched.has(s.id));
  }

  const totalPnl = tradePairs.reduce((s, p) => s + p.pnl, 0);

  const handleSubmit = async () => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) return;
    try {
      const dt = tradeDate + " " + new Date().toTimeString().slice(0, 8);
      const [sf, bf] = await Promise.all([
        estimateFees({ trade_type: "sell", price: parseFloat(sellPrice), quantity: parseFloat(sellQty), market }),
        estimateFees({ trade_type: "buy", price: parseFloat(buyPrice), quantity: parseFloat(buyQty), market }),
      ]);
      await addDayTrade({ ticker, trade_type: "sell", price: parseFloat(sellPrice), quantity: parseFloat(sellQty), trade_date: dt, notes: JSON.stringify({ fee: sf.total_fee }) });
      await addDayTrade({ ticker, trade_type: "buy", price: parseFloat(buyPrice), quantity: parseFloat(buyQty), trade_date: dt, notes: JSON.stringify({ fee: bf.total_fee }) });
      setSellPrice(""); setSellQty(""); setBuyPrice(""); setBuyQty(""); setShowForm(false);
      loadTrades(); onTradesUpdated();
    } catch { /* silently fail */ }
  };

  const handleDelete = async (id: number) => {
    try { await deleteDayTrade(id); loadTrades(); onTradesUpdated(); } catch { /* silently fail */ }
  };

  const parseFee = (n: string) => { try { return JSON.parse(n).fee || 0; } catch { return 0; } };

  return (
    <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--bg-secondary, #f8fafc)", borderRadius: 8, border: "1px solid var(--border-light, #f1f5f9)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>{t("stocks.dayTrade")}</span>
          {tradePairs.length > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>差价</span>
              <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)", color: totalPnl >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                {tradePairs[0]?.diff?.toFixed(3) ?? "0.000"}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>预估T盈亏</span>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)", color: totalPnl >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                {totalPnl >= 0 ? "+" : ""}{currencySymbol}{totalPnl.toFixed(3)}
              </span>
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); setShowForm(!showForm); }}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 10, fontWeight: 500, cursor: "pointer" }}>
            <Plus size={10} />{t("stocks.dayTrade.add")}
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
              <input type="number" placeholder="价格" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)}
                onWheel={(e) => e.stopPropagation()}
                style={{ ...inputStyle, borderColor: sellPrice ? "var(--color-danger)" : undefined, marginBottom: 6 }} />
              <input type="number" placeholder="数量" value={sellQty} onChange={(e) => setSellQty(e.target.value)}
                onWheel={(e) => e.stopPropagation()}
                style={{ ...inputStyle, borderColor: sellQty ? "var(--color-danger)" : undefined }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-success)", marginBottom: 4 }}>买回</div>
              <input type="number" placeholder="价格" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)}
                onWheel={(e) => e.stopPropagation()}
                style={{ ...inputStyle, borderColor: buyPrice ? "var(--color-success)" : undefined, marginBottom: 6 }} />
              <input type="number" placeholder="数量" value={buyQty} onChange={(e) => setBuyQty(e.target.value)}
                onWheel={(e) => e.stopPropagation()}
                style={{ ...inputStyle, borderColor: buyQty ? "var(--color-success)" : undefined }} />
            </div>
          </div>
          <input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />

          {sellPrice && buyPrice && sellQty && buyQty && (
            <div style={{ padding: "8px 10px", background: "var(--bg-secondary)", borderRadius: 6, fontSize: 11, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "var(--text-tertiary)" }}>差价</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{(parseFloat(sellPrice) - parseFloat(buyPrice)).toFixed(3)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "var(--text-tertiary)" }}>已匹配盈亏</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: (parseFloat(sellPrice) - parseFloat(buyPrice)) * Math.min(parseFloat(sellQty), parseFloat(buyQty)) >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                  {currencySymbol}{((parseFloat(sellPrice) - parseFloat(buyPrice)) * Math.min(parseFloat(sellQty), parseFloat(buyQty))).toFixed(3)}
                </span>
              </div>
              {parseInt(sellQty) !== parseInt(buyQty) && (
                <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  卖出 {sellQty} 股，买回 {buyQty} 股，{Math.abs(parseInt(sellQty) - parseInt(buyQty))} 股未匹配
                </div>
              )}
              {(fees.sell > 0 || fees.buy > 0) && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, color: "var(--text-tertiary)" }}>
                  <span>预估费用</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{currencySymbol}{(fees.sell + fees.buy).toFixed(3)}</span>
                </div>
              )}
            </div>
          )}

          <button onClick={handleSubmit} disabled={!sellPrice || !buyPrice || !sellQty || !buyQty}
            style={{ width: "100%", padding: "8px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: !sellPrice || !buyPrice || !sellQty || !buyQty ? "not-allowed" : "pointer", opacity: !sellPrice || !buyPrice || !sellQty || !buyQty ? 0.5 : 1 }}>
            {t("common.save")}
          </button>
        </div>
      )}

      {/* Trade pairs */}
      {expanded && tradePairs.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {tradePairs.map((pair, idx) => (
            <div key={idx} style={{ padding: "10px 12px", background: "var(--bg-surface)", borderRadius: 8, border: "1px solid var(--border-light)" }}>
              {/* Header: diff + pnl */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>差价</span>
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "var(--font-mono)", color: pair.diff >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                    {pair.diff.toFixed(3)}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>预估T盈亏</span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: pair.pnl >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                    {pair.pnl >= 0 ? "+" : ""}{currencySymbol}{pair.pnl.toFixed(3)}
                  </span>
                </div>
                <button onClick={() => { handleDelete(pair.sell.id); if (pair.buy) handleDelete(pair.buy.id); }}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, display: "flex" }}>
                  <Trash2 size={11} />
                </button>
              </div>

              {/* Sell row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(8, 145, 178, 0.1)", color: "var(--color-primary)" }}>卖</span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{pair.sell.trade_date.slice(5, 16).replace("T", " ")}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500, minWidth: 60, textAlign: "right" }}>{pair.sell.price.toFixed(3)}</span>
                <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-success)", minWidth: 80, textAlign: "right" }}>+{(pair.sell.price * pair.sell.quantity).toFixed(3)}</span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", minWidth: 30, textAlign: "right" }}>{pair.sell.quantity}</span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", minWidth: 40, textAlign: "right" }}>{parseFee(pair.sell.notes).toFixed(2)}</span>
              </div>

              {/* Buy row */}
              {pair.buy && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid var(--border-light)" }}>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(220, 38, 38, 0.1)", color: "var(--color-danger)" }}>买</span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{pair.buy.trade_date.slice(5, 16).replace("T", " ")}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500, minWidth: 60, textAlign: "right" }}>{pair.buy.price.toFixed(3)}</span>
                  <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-danger)", minWidth: 80, textAlign: "right" }}>-{(pair.buy.price * pair.buy.quantity).toFixed(3)}</span>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)", minWidth: 30, textAlign: "right" }}>{pair.buy.quantity}</span>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", minWidth: 40, textAlign: "right" }}>{parseFee(pair.buy.notes).toFixed(2)}</span>
                </div>
              )}
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
