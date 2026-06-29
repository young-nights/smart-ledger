/**
 * DayTradePanel — T-trading records panel.
 * Groups sell+buy into pairs, each pair = one T-trade unit.
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

interface TradePair {
  sell: DayTrade;
  buy: DayTrade;
  pnl: number;
  diff: number;
}

export function DayTradePanel({ ticker, currencySymbol, market, onTradesUpdated }: DayTradePanelProps) {
  const { t } = useTranslation();
  const [trades, setTrades] = useState<DayTrade[]>([]);
  const [expandedPairs, setExpandedPairs] = useState<Set<number>>(new Set());
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

  const parseFee = (n: string) => { try { return JSON.parse(n).fee || 0; } catch { return 0; } };

  useEffect(() => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) { setFees({ sell: 0, buy: 0 }); return; }
    const sq = parseFloat(sellQty), bq = parseFloat(buyQty), sp = parseFloat(sellPrice), bp = parseFloat(buyPrice);
    if (sq <= 0 || bq <= 0 || sp <= 0 || bp <= 0) return;
    Promise.all([
      estimateFees({ trade_type: "sell", price: sp, quantity: sq, market }),
      estimateFees({ trade_type: "buy", price: bp, quantity: bq, market }),
    ]).then(([s, b]) => setFees({ sell: s.total_fee, buy: b.total_fee })).catch(() => {});
  }, [sellPrice, buyPrice, sellQty, buyQty, market]);

  // Group trades into pairs (sell + buy) by matching same-date trades
  const tradePairs: TradePair[] = (() => {
    const sells = trades.filter(t => t.trade_type === "sell").sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const buys = trades.filter(t => t.trade_type === "buy").sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const pairs: TradePair[] = [];
    const usedBuys = new Set<number>();

    for (const sell of sells) {
      const matchBuy = buys.find(b =>
        !usedBuys.has(b.id) &&
        b.trade_date.slice(0, 10) === sell.trade_date.slice(0, 10)
      );
      if (matchBuy) {
        usedBuys.add(matchBuy.id);
        const diff = sell.price - matchBuy.price;
        const matchQty = Math.min(sell.quantity, matchBuy.quantity);
        const sellFee = parseFee(sell.notes);
        // Prorate sell fee by matched quantity; buy fee is NOT included (cost of new position)
        const proratedFee = sell.quantity > 0 ? sellFee * (matchQty / sell.quantity) : 0;
        const pnl = diff * matchQty - proratedFee;
        pairs.push({ sell, buy: matchBuy, pnl, diff });
      }
    }
    return pairs.sort((a, b) => b.sell.trade_date.localeCompare(a.sell.trade_date));
  })();

  const totalPnl = tradePairs.reduce((s, p) => s + p.pnl, 0);

  const handleSubmit = async () => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) return;
    const sp = parseFloat(sellPrice), sq = parseFloat(sellQty);
    const bp = parseFloat(buyPrice), bq = parseFloat(buyQty);
    const dt = tradeDate + " " + new Date().toTimeString().slice(0, 8);

    // Optimistic: create temp records
    const tempSell: DayTrade = { id: Date.now(), ticker, trade_type: "sell", price: sp, quantity: sq, trade_date: dt, notes: "{}" };
    const tempBuy: DayTrade = { id: Date.now() + 1, ticker, trade_type: "buy", price: bp, quantity: bq, trade_date: dt, notes: "{}" };
    setTrades((prev) => [tempSell, tempBuy, ...prev]);
    setSellPrice(""); setSellQty(""); setBuyPrice(""); setBuyQty(""); setShowForm(false);

    try {
      const [sf, bf] = await Promise.all([
        estimateFees({ trade_type: "sell", price: sp, quantity: sq, market }),
        estimateFees({ trade_type: "buy", price: bp, quantity: bq, market }),
      ]);
      const realSell = await addDayTrade({ ticker, trade_type: "sell", price: sp, quantity: sq, trade_date: dt, notes: JSON.stringify({ fee: sf.total_fee }) });
      const realBuy = await addDayTrade({ ticker, trade_type: "buy", price: bp, quantity: bq, trade_date: dt, notes: JSON.stringify({ fee: bf.total_fee }) });
      setTrades((prev) => prev.map((t) => {
        if (t.id === tempSell.id) return realSell;
        if (t.id === tempBuy.id) return realBuy;
        return t;
      }));
      onTradesUpdated();
    } catch (e) {
      setTrades((prev) => prev.filter((t) => t.id !== tempSell.id && t.id !== tempBuy.id));
      console.error('Submit error:', e);
    }
  };

  const handleDeletePair = async (pair: TradePair) => {
    // Optimistic: remove both immediately
    setTrades((prev) => prev.filter((t) => t.id !== pair.sell.id && t.id !== pair.buy.id));
    try {
      await deleteDayTrade(pair.sell.id);
      await deleteDayTrade(pair.buy.id);
      onTradesUpdated();
    } catch {
      loadTrades(); // Revert on failure
    }
  };

  const toggleExpand = (idx: number) => {
    setExpandedPairs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  return (
    <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--bg-secondary, #f8fafc)", borderRadius: 8, border: "1px solid var(--border-light, #f1f5f9)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>做T记录</span>
          {tradePairs.length > 0 && (
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, color: totalPnl >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
              预估T盈亏 {totalPnl >= 0 ? "+" : ""}{currencySymbol}{totalPnl.toFixed(3)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setShowForm(!showForm)}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
            <Plus size={12} />添加做T
          </button>
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

      {/* Trade pairs */}
      {tradePairs.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {tradePairs.map((pair, idx) => {
            const isExpanded = expandedPairs.has(idx);
            const matchQty = Math.min(pair.sell.quantity, pair.buy.quantity);
            return (
              <div key={idx} style={{ background: "var(--bg-surface)", borderRadius: 8, border: "1px solid var(--border-light)", overflow: "hidden" }}>
                {/* Pair header - clickable */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "pointer" }}
                  onClick={() => toggleExpand(idx)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>T {matchQty}股</span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>差价</span>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "var(--font-mono)", color: pair.diff >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                      {pair.diff.toFixed(3)}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>预估T盈亏</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: pair.pnl >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                      {pair.pnl >= 0 ? "+" : ""}{currencySymbol}{pair.pnl.toFixed(3)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={(e) => { e.stopPropagation(); handleDeletePair(pair); }}
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, display: "flex" }}>
                      <Trash2 size={11} />
                    </button>
                    {isExpanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--border-light)" }}>
                    {/* Buy row */}
                    <div style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: "rgba(220, 38, 38, 0.1)", color: "var(--color-danger)" }}>买</span>
                      <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{pair.buy.trade_date.slice(5, 16).replace("T", " ")}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{pair.buy.price.toFixed(3)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-danger)", minWidth: 70, textAlign: "right" }}>-{(pair.buy.price * pair.buy.quantity).toFixed(3)}</span>
                      <span style={{ color: "var(--text-tertiary)", fontSize: 10, minWidth: 24, textAlign: "right" }}>{pair.buy.quantity}</span>
                      <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 32, textAlign: "right" }}>{parseFee(pair.buy.notes).toFixed(2)}</span>
                    </div>
                    {/* Sell row */}
                    <div style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 11, borderTop: "1px dashed var(--border-light)" }}>
                      <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: "rgba(8, 145, 178, 0.1)", color: "var(--color-primary)" }}>卖</span>
                      <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{pair.sell.trade_date.slice(5, 16).replace("T", " ")}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{pair.sell.price.toFixed(3)}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-success)", minWidth: 70, textAlign: "right" }}>+{(pair.sell.price * pair.sell.quantity).toFixed(3)}</span>
                      <span style={{ color: "var(--text-tertiary)", fontSize: 10, minWidth: 24, textAlign: "right" }}>{pair.sell.quantity}</span>
                      <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 32, textAlign: "right" }}>{parseFee(pair.sell.notes).toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
