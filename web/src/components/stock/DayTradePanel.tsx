/**
 * DayTradePanel — expandable panel for T-trading records.
 * Compact card layout with sell/buy pairs.
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

  const tradePairs = (() => {
    const sorted = [...trades].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
    const pairs: { sell: DayTrade; buy: DayTrade | null; pnl: number; diff: number }[] = [];
    const sellQ = [...sorted.filter(t => t.trade_type === "sell")].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const buyQ = [...sorted.filter(t => t.trade_type === "buy")].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const ms = new Set<number>(), mb = new Set<number>();
    for (const s of sellQ) {
      for (const b of buyQ) {
        if (mb.has(b.id)) continue;
        if (s.quantity === b.quantity) {
          ms.add(s.id); mb.add(b.id);
          pairs.push({ sell: s, buy: b, pnl: (s.price - b.price) * s.quantity, diff: s.price - b.price });
          break;
        }
      }
    }
    for (const s of sellQ.filter(x => !ms.has(x.id))) pairs.push({ sell: s, buy: null, pnl: 0, diff: 0 });
    return pairs;
  })();

  const totalPnl = tradePairs.reduce((s, p) => s + p.pnl, 0);

  const handleSubmit = async () => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) return;
    const sp = parseFloat(sellPrice);
    const sq = parseFloat(sellQty);
    const bp = parseFloat(buyPrice);
    const bq = parseFloat(buyQty);
    console.log('Submit:', { sellPrice: sp, sellQty: sq, buyPrice: bp, buyQty: bq });
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

  return (
    <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--bg-secondary, #f8fafc)", borderRadius: 8, border: "1px solid var(--border-light, #f1f5f9)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>做T记录</span>
          {tradePairs.length > 0 && (
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: totalPnl >= 0 ? "var(--color-success)" : "var(--color-danger)", fontWeight: 600 }}>
              差价 {tradePairs[0]?.diff?.toFixed(3) ?? "0.000"}  预估T盈亏 {totalPnl >= 0 ? "+" : ""}{currencySymbol}{totalPnl.toFixed(3)}
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

      {/* Trade pairs */}
      {expanded && tradePairs.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {tradePairs.map((pair, idx) => (
            <div key={idx} style={{ padding: "8px 10px", background: "var(--bg-surface)", borderRadius: 6, border: "1px solid var(--border-light)" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, color: pair.pnl >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                  差价 {pair.diff.toFixed(3)}  预估T盈亏 {pair.pnl >= 0 ? "+" : ""}{currencySymbol}{pair.pnl.toFixed(3)}
                </span>
                <button onClick={() => { handleDelete(pair.sell.id); if (pair.buy) handleDelete(pair.buy.id); }}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, display: "flex" }}>
                  <Trash2 size={11} />
                </button>
              </div>

              {/* Sell */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 11 }}>
                <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: "rgba(8, 145, 178, 0.1)", color: "var(--color-primary)" }}>卖</span>
                <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{pair.sell.trade_date.slice(5, 16).replace("T", " ")}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{pair.sell.price.toFixed(3)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-success)", minWidth: 70, textAlign: "right" }}>+{(pair.sell.price * pair.sell.quantity).toFixed(3)}</span>
                <span style={{ color: "var(--text-tertiary)", fontSize: 10, minWidth: 24, textAlign: "right" }}>{pair.sell.quantity}</span>
                <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 32, textAlign: "right" }}>{parseFee(pair.sell.notes).toFixed(2)}</span>
              </div>

              {/* Buy */}
              {pair.buy && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 11, borderTop: "1px dashed var(--border-light)" }}>
                  <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: "rgba(220, 38, 38, 0.1)", color: "var(--color-danger)" }}>买</span>
                  <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>{pair.buy.trade_date.slice(5, 16).replace("T", " ")}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{pair.buy.price.toFixed(3)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-danger)", minWidth: 70, textAlign: "right" }}>-{(pair.buy.price * pair.buy.quantity).toFixed(3)}</span>
                  <span style={{ color: "var(--text-tertiary)", fontSize: 10, minWidth: 24, textAlign: "right" }}>{pair.buy.quantity}</span>
                  <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 32, textAlign: "right" }}>{parseFee(pair.buy.notes).toFixed(2)}</span>
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
