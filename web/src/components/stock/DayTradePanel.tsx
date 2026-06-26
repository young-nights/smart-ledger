/**
 * DayTradePanel — expandable panel for managing T-trading records.
 * Clean card style with buy/sell pairs, fees, and P&L preview.
 * Supports different quantities for sell and buy.
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Info } from "lucide-react";
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
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    loadTrades();
  }, [ticker]);

  // Calculate fees for preview
  useEffect(() => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) {
      setFees({ sell: 0, buy: 0 });
      return;
    }
    const sq = parseFloat(sellQty);
    const bq = parseFloat(buyQty);
    const sp = parseFloat(sellPrice);
    const bp = parseFloat(buyPrice);
    if (sq <= 0 || bq <= 0 || sp <= 0 || bp <= 0) return;

    Promise.all([
      estimateFees({ trade_type: "sell", price: sp, quantity: sq, market }),
      estimateFees({ trade_type: "buy", price: bp, quantity: bq, market }),
    ]).then(([sellFees, buyFees]) => {
      setFees({ sell: sellFees.total_fee, buy: buyFees.total_fee });
    }).catch(() => {});
  }, [sellPrice, buyPrice, sellQty, buyQty, market]);

  // Group trades into pairs (sell + buy)
  const tradePairs = (() => {
    const sorted = [...trades].sort((a, b) => b.trade_date.localeCompare(a.trade_date));
    const pairs: { sell: DayTrade; buy: DayTrade | null; pnl: number; diff: number }[] = [];

    const allBuys = sorted.filter(t => t.trade_type === "buy");
    const allSells = sorted.filter(t => t.trade_type === "sell");

    const sellQueue = [...allSells].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    const buyQueue = [...allBuys].sort((a, b) => a.trade_date.localeCompare(b.trade_date));

    const matchedSells = new Set<number>();
    const matchedBuys = new Set<number>();

    for (const sell of sellQueue) {
      for (const buy of buyQueue) {
        if (matchedBuys.has(buy.id)) continue;
        // Match when quantities are equal (paired trade)
        if (sell.quantity === buy.quantity) {
          matchedSells.add(sell.id);
          matchedBuys.add(buy.id);
          const diff = sell.price - buy.price;
          const pnl = diff * sell.quantity;
          pairs.push({ sell, buy, pnl, diff });
          break;
        }
      }
    }

    // Unmatched sells
    for (const sell of allSells) {
      if (!matchedSells.has(sell.id)) {
        pairs.push({ sell, buy: null, pnl: 0, diff: 0 });
      }
    }

    return pairs;
  })();

  const totalPnl = tradePairs.reduce((sum, p) => sum + p.pnl, 0);

  const handleSubmit = async () => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) return;
    try {
      const tradeDateStr = tradeDate + " " + new Date().toTimeString().slice(0, 8);
      const sq = parseFloat(sellQty);
      const bq = parseFloat(buyQty);
      const sp = parseFloat(sellPrice);
      const bp = parseFloat(buyPrice);

      // Get fees
      const [sellFees, buyFees] = await Promise.all([
        estimateFees({ trade_type: "sell", price: sp, quantity: sq, market }),
        estimateFees({ trade_type: "buy", price: bp, quantity: bq, market }),
      ]);

      await addDayTrade({
        ticker,
        trade_type: "sell",
        price: sp,
        quantity: sq,
        trade_date: tradeDateStr,
        notes: JSON.stringify({ fee: sellFees.total_fee }),
      });
      await addDayTrade({
        ticker,
        trade_type: "buy",
        price: bp,
        quantity: bq,
        trade_date: tradeDateStr,
        notes: JSON.stringify({ fee: buyFees.total_fee }),
      });
      setSellPrice("");
      setSellQty("");
      setBuyPrice("");
      setBuyQty("");
      setShowForm(false);
      loadTrades();
      onTradesUpdated();
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteDayTrade(id);
      loadTrades();
      onTradesUpdated();
    } catch {
      // silently fail
    }
  };

  const parseFee = (notes: string): number => {
    try {
      const obj = JSON.parse(notes);
      return obj.fee || 0;
    } catch {
      return 0;
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
            {t("stocks.dayTrade")}
          </span>
          {tradePairs.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
              T {tradePairs.length}笔
            </span>
          )}
          {tradePairs.length > 0 && (
            <>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>差价</span>
              <Info size={10} style={{ color: "var(--text-muted)" }} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  color: totalPnl >= 0 ? "var(--color-success, #16a34a)" : "var(--color-danger, #dc2626)",
                }}
              >
                {tradePairs[0]?.diff?.toFixed(3) ?? "0.000"}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>预估T盈亏</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)",
                  color: totalPnl >= 0 ? "var(--color-success, #16a34a)" : "var(--color-danger, #dc2626)",
                }}
              >
                {totalPnl >= 0 ? "+" : ""}{currencySymbol}{totalPnl.toFixed(3)}
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowForm(!showForm);
            }}
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
            }}
          >
            <Plus size={10} />
            {t("stocks.dayTrade.add")}
          </button>
          {expanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            background: "var(--bg-surface, #ffffff)",
            borderRadius: 8,
            border: "1px solid var(--border-light, #e2e8f0)",
          }}
        >
          {/* Sell row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...fieldLabel, color: "var(--color-danger, #dc2626)" }}>卖出价格</div>
              <input
                type="number"
                placeholder="0.000"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                style={{ ...inputStyle, borderColor: sellPrice ? "var(--color-danger, #dc2626)" : undefined }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...fieldLabel, color: "var(--color-danger, #dc2626)" }}>卖出数量</div>
              <input
                type="number"
                placeholder="0"
                value={sellQty}
                onChange={(e) => setSellQty(e.target.value)}
                style={{ ...inputStyle, borderColor: sellQty ? "var(--color-danger, #dc2626)" : undefined }}
              />
            </div>
          </div>
          {/* Buy row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ ...fieldLabel, color: "var(--color-success, #16a34a)" }}>买回价格</div>
              <input
                type="number"
                placeholder="0.000"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                style={{ ...inputStyle, borderColor: buyPrice ? "var(--color-success, #16a34a)" : undefined }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...fieldLabel, color: "var(--color-success, #16a34a)" }}>买回数量</div>
              <input
                type="number"
                placeholder="0"
                value={buyQty}
                onChange={(e) => setBuyQty(e.target.value)}
                style={{ ...inputStyle, borderColor: buyQty ? "var(--color-success, #16a34a)" : undefined }}
              />
            </div>
          </div>
          {/* Date */}
          <div style={{ marginBottom: 8 }}>
            <div style={fieldLabel}>日期</div>
            <input
              type="date"
              value={tradeDate}
              onChange={(e) => setTradeDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Preview */}
          {sellPrice && buyPrice && sellQty && buyQty && (
            <div
              style={{
                padding: "6px 8px",
                background: "var(--bg-secondary, #f8fafc)",
                borderRadius: 6,
                fontSize: 11,
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ color: "var(--text-tertiary)" }}>差价</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                  {(parseFloat(sellPrice) - parseFloat(buyPrice)).toFixed(3)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ color: "var(--text-tertiary)" }}>已匹配盈亏</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    color: (parseFloat(sellPrice) - parseFloat(buyPrice)) * Math.min(parseFloat(sellQty), parseFloat(buyQty)) >= 0
                      ? "var(--color-success)" : "var(--color-danger)",
                  }}
                >
                  {currencySymbol}{((parseFloat(sellPrice) - parseFloat(buyPrice)) * Math.min(parseFloat(sellQty), parseFloat(buyQty))).toFixed(3)}
                </span>
              </div>
              {parseInt(sellQty) !== parseInt(buyQty) && (
                <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 2 }}>
                  卖出 {sellQty} 股，买回 {buyQty} 股，{Math.abs(parseInt(sellQty) - parseInt(buyQty))} 股未匹配
                </div>
              )}
              {(fees.sell > 0 || fees.buy > 0) && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-tertiary)" }}>
                  <span>预估费用</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {currencySymbol}{(fees.sell + fees.buy).toFixed(3)}
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!sellPrice || !buyPrice || !sellQty || !buyQty}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: 8,
              border: "none",
              background: "var(--color-primary, #0891b2)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: !sellPrice || !buyPrice || !sellQty || !buyQty ? "not-allowed" : "pointer",
              opacity: !sellPrice || !buyPrice || !sellQty || !buyQty ? 0.5 : 1,
            }}
          >
            {t("common.save")}
          </button>
        </div>
      )}

      {/* Trade pairs */}
      {expanded && tradePairs.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {tradePairs.map((pair, idx) => (
            <div
              key={idx}
              style={{
                padding: "8px 10px",
                background: "var(--bg-surface, #ffffff)",
                borderRadius: 6,
                border: "1px solid var(--border-light, #f1f5f9)",
              }}
            >
              {/* Pair header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>差价</span>
                  <Info size={9} style={{ color: "var(--text-muted)" }} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono)",
                      color: pair.diff >= 0 ? "var(--color-success)" : "var(--color-danger)",
                    }}
                  >
                    {pair.diff.toFixed(3)}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>预估T盈亏</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      color: pair.pnl >= 0 ? "var(--color-success)" : "var(--color-danger)",
                    }}
                  >
                    {pair.pnl >= 0 ? "+" : ""}{currencySymbol}{pair.pnl.toFixed(3)}
                  </span>
                </div>
                <button
                  onClick={() => {
                    handleDelete(pair.sell.id);
                    if (pair.buy) handleDelete(pair.buy.id);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 2,
                    display: "flex",
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>

              {/* Sell row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>卖出</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: "1px 4px",
                      borderRadius: 3,
                      background: "rgba(8, 145, 178, 0.08)",
                      color: "var(--color-primary, #0891b2)",
                    }}
                  >
                    卖
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                    {pair.sell.trade_date.slice(5, 16).replace("T", " ")}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                    {pair.sell.price.toFixed(3)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                      color: "var(--color-success, #16a34a)",
                    }}
                  >
                    +{(pair.sell.price * pair.sell.quantity).toFixed(3)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  {pair.sell.quantity}
                </span>
                <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {parseFee(pair.sell.notes).toFixed(3)}
                </span>
              </div>

              {/* Buy row */}
              {pair.buy && (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>买入</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          padding: "1px 4px",
                          borderRadius: 3,
                          background: "rgba(220, 38, 38, 0.08)",
                          color: "var(--color-danger, #dc2626)",
                        }}
                      >
                        买
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                        {pair.buy.trade_date.slice(5, 16).replace("T", " ")}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                        {pair.buy.price.toFixed(3)}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                          color: "var(--color-danger, #dc2626)",
                        }}
                      >
                        -{(pair.buy.price * pair.buy.quantity).toFixed(3)}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                      {pair.buy.quantity}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      {parseFee(pair.buy.notes).toFixed(3)}
                    </span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: "var(--text-tertiary)",
  marginBottom: 3,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  border: "1px solid var(--border-default, #d6d3d1)",
  borderRadius: 6,
  background: "var(--bg-surface, #ffffff)",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};
