/**
 * DayTradePanel — T-trading records panel.
 * Supports two modes:
 *   1. Quick pair: one sell + one buy (default)
 *   2. Batch buy: one sell + multiple small buys
 *
 * Uses FIFO matching: each buy consumes from the oldest unmatched sell.
 * Modernized UI with consistent color palette.
 */

import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Pencil, Check, X } from "lucide-react";
import type { DayTrade } from "../../lib/types";
import {
  fetchDayTrades,
  deleteDayTrade,
  updateDayTrade,
  estimateFees,
  addDayTradeBatch,
} from "../../lib/api";
import { useTranslation } from "../../i18n";

/* ─── Color palette ─── */
const C = {
  bgSurface: "#ffffff",
  bgSecondary: "#f8fafc",
  bgHover: "#f1f5f9",
  borderLight: "#e8ecf0",
  borderDefault: "#d1d9e0",
  textPrimary: "#1a2332",
  textSecondary: "#4a5568",
  textTertiary: "#8896a6",
  textMuted: "#a0aec0",
  primary: "#0891b2",
  primaryLight: "rgba(8, 145, 178, 0.08)",
  success: "#059669",
  successLight: "rgba(5, 150, 105, 0.08)",
  danger: "#dc2626",
  dangerLight: "rgba(220, 38, 38, 0.06)",
  shadowSm: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)",
  shadowMd: "0 4px 16px -4px rgba(0,0,0,0.08), 0 2px 6px -2px rgba(0,0,0,0.04)",
  fontMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
  fontDisplay: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  radiusSm: 8,
  radiusMd: 10,
};

interface DayTradePanelProps {
  ticker: string;
  currencySymbol: string;
  market: string;
  onTradesUpdated: () => void;
}

// --- FIFO matching result types ---

interface MatchedPair {
  sell: DayTrade;
  buy: DayTrade;
  matchQty: number;
  pnl: number;
}

interface SellGroup {
  sell: DayTrade;
  matches: MatchedPair[];
  unmatchedQty: number;
  totalPnl: number;
}

// --- Per-day matching algorithm ---

function calculateMatchedTrades(trades: DayTrade[]): SellGroup[] {
  const parseFee = (notes: string): number => {
    try {
      return JSON.parse(notes).fee || 0;
    } catch {
      return 0;
    }
  };

  // Group trades by day
  const dailyMap = new Map<string, { sells: DayTrade[]; buys: DayTrade[] }>();
  for (const t of trades) {
    const day = t.trade_date.slice(0, 10);
    if (!dailyMap.has(day)) dailyMap.set(day, { sells: [], buys: [] });
    const d = dailyMap.get(day)!;
    if (t.trade_type === "sell") d.sells.push(t);
    else d.buys.push(t);
  }

  const matches: MatchedPair[] = [];

  for (const day of [...dailyMap.keys()].sort()) {
    const { sells, buys } = dailyMap.get(day)!;
    let sellIdx = 0, buyIdx = 0;
    let sellRemaining = sells[0]?.quantity ?? 0;
    let buyRemaining = buys[0]?.quantity ?? 0;

    while (sellIdx < sells.length && buyIdx < buys.length) {
      const s = sells[sellIdx];
      const b = buys[buyIdx];
      const matchQty = Math.min(sellRemaining, buyRemaining);
      if (matchQty <= 0) break;

      const sellFee = parseFee(s.notes);
      const buyFee = parseFee(b.notes);
      const proratedSellFee = s.quantity > 0 ? sellFee * (matchQty / s.quantity) : 0;
      const proratedBuyFee = b.quantity > 0 ? buyFee * (matchQty / b.quantity) : 0;
      const pnl = (s.price - b.price) * matchQty - proratedSellFee - proratedBuyFee;

      matches.push({ sell: s, buy: b, matchQty, pnl });

      sellRemaining -= matchQty;
      buyRemaining -= matchQty;
      if (sellRemaining <= 0) {
        sellIdx++;
        sellRemaining = sells[sellIdx]?.quantity ?? 0;
      }
      if (buyRemaining <= 0) {
        buyIdx++;
        buyRemaining = buys[buyIdx]?.quantity ?? 0;
      }
    }
  }

  // Group matches by sell id
  const groupMap = new Map<number, SellGroup>();
  for (const m of matches) {
    let group = groupMap.get(m.sell.id);
    if (!group) {
      group = {
        sell: m.sell,
        matches: [],
        unmatchedQty: m.sell.quantity,
        totalPnl: 0,
      };
      groupMap.set(m.sell.id, group);
    }
    group.matches.push(m);
    group.unmatchedQty -= m.matchQty;
    group.totalPnl += m.pnl;
  }

  // Add unmatched sells
  for (const t of trades) {
    if (t.trade_type === "sell" && !groupMap.has(t.id)) {
      groupMap.set(t.id, {
        sell: t,
        matches: [],
        unmatchedQty: t.quantity,
        totalPnl: 0,
      });
    }
  }

  return [...groupMap.values()].sort((a, b) =>
    b.sell.trade_date.localeCompare(a.sell.trade_date)
  );
}

// --- Component ---

export function DayTradePanel({
  ticker,
  currencySymbol,
  market,
  onTradesUpdated,
}: DayTradePanelProps) {
  const { t } = useTranslation();
  const [trades, setTrades] = useState<DayTrade[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"pair" | "batch">("pair");
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  // Quick pair mode fields
  const [sellPrice, setSellPrice] = useState("");
  const [sellQty, setSellQty] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [buyQty, setBuyQty] = useState("");
  const [tradeDate, setTradeDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // Batch mode fields
  const [batchSellPrice, setBatchSellPrice] = useState("");
  const [batchSellQty, setBatchSellQty] = useState("");
  const [batchBuys, setBatchBuys] = useState<
    { price: string; quantity: string }[]
  >([{ price: "", quantity: "" }]);
  const [batchDate, setBatchDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [batchFees, setBatchFees] = useState<{
    sell: number;
    buys: number[];
  }>({ sell: 0, buys: [] });

  const loadTrades = async () => {
    try {
      setTrades(await fetchDayTrades(ticker));
    } catch {}
  };
  useEffect(() => {
    loadTrades();
  }, [ticker]);

  const parseFee = (n: string) => {
    try {
      return JSON.parse(n).fee || 0;
    } catch {
      return 0;
    }
  };

  // Quick pair fee estimation
  const [pairFees, setPairFees] = useState<{ sell: number; buy: number }>({
    sell: 0,
    buy: 0,
  });
  useEffect(() => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) {
      setPairFees({ sell: 0, buy: 0 });
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
    ])
      .then(([s, b]) => setPairFees({ sell: s.total_fee, buy: b.total_fee }))
      .catch(() => {});
  }, [sellPrice, buyPrice, sellQty, buyQty, market]);

  // Batch fee estimation
  useEffect(() => {
    if (!batchSellPrice || !batchSellQty) {
      setBatchFees({ sell: 0, buys: [] });
      return;
    }
    const sp = parseFloat(batchSellPrice);
    const sq = parseFloat(batchSellQty);
    if (sp <= 0 || sq <= 0) {
      setBatchFees({ sell: 0, buys: [] });
      return;
    }
    estimateFees({ trade_type: "sell", price: sp, quantity: sq, market })
      .then((s) => {
        const buyPromises = batchBuys
          .filter((b) => b.price && b.quantity)
          .map((b) =>
            estimateFees({
              trade_type: "buy",
              price: parseFloat(b.price),
              quantity: parseFloat(b.quantity),
              market,
            })
          );
        Promise.all(buyPromises).then((results) =>
          setBatchFees({
            sell: s.total_fee,
            buys: results.map((r) => r.total_fee),
          })
        );
      })
      .catch(() => {});
  }, [batchSellPrice, batchSellQty, batchBuys, market]);

  // FIFO matching
  const sellGroups = calculateMatchedTrades(trades);
  const totalPnl = sellGroups.reduce((s, g) => s + g.totalPnl, 0);
  const totalMatched = sellGroups.reduce(
    (s, g) => s + g.matches.reduce((ms, m) => ms + m.matchQty, 0),
    0
  );

  // --- Quick pair submit ---
  const handlePairSubmit = async () => {
    if (!sellPrice || !buyPrice || !sellQty || !buyQty) return;
    const sp = parseFloat(sellPrice);
    const sq = parseFloat(sellQty);
    const bp = parseFloat(buyPrice);
    const bq = parseFloat(buyQty);
    const dt = tradeDate + " " + new Date().toTimeString().slice(0, 8);

    const sp2 = sp, sq2 = sq, bp2 = bp, bq2 = bq;

    setSellPrice("");
    setSellQty("");
    setBuyPrice("");
    setBuyQty("");
    setShowForm(false);

    try {
      const created = await addDayTradeBatch({
        ticker,
        sell: { price: sp2, quantity: sq2, trade_date: dt },
        buys: [{ price: bp2, quantity: bq2, trade_date: dt }],
      });
      setTrades((prev) => [...created.reverse(), ...prev]);
      onTradesUpdated();
    } catch (e) {
      console.error("Pair submit error:", e);
      loadTrades();
    }
  };

  // --- Batch submit ---
  const handleBatchSubmit = async () => {
    if (!batchSellPrice || !batchSellQty) return;
    const sp = parseFloat(batchSellPrice);
    const sq = parseFloat(batchSellQty);
    if (sp <= 0 || sq <= 0) return;

    const validBuys = batchBuys
      .filter((b) => b.price && b.quantity)
      .map((b) => ({
        price: parseFloat(b.price),
        quantity: parseFloat(b.quantity),
        trade_date: batchDate + " " + new Date().toTimeString().slice(0, 8),
      }));
    if (validBuys.length === 0) return;

    const dt = batchDate + " " + new Date().toTimeString().slice(0, 8);

    const sp2 = sp, sq2 = sq;

    setBatchSellPrice("");
    setBatchSellQty("");
    setBatchBuys([{ price: "", quantity: "" }]);
    setShowForm(false);

    try {
      const created = await addDayTradeBatch({
        ticker,
        sell: { price: sp2, quantity: sq2, trade_date: dt },
        buys: validBuys,
      });
      setTrades((prev) => [...created.reverse(), ...prev]);
      onTradesUpdated();
    } catch (e) {
      console.error("Batch submit error:", e);
      loadTrades();
    }
  };

  // --- Delete handlers ---
  const handleDeleteGroup = async (group: SellGroup) => {
    const idsToDelete = [
      group.sell.id,
      ...group.matches.map((m) => m.buy.id),
    ];
    setTrades((prev) => prev.filter((t) => !idsToDelete.includes(t.id)));
    try {
      for (const id of idsToDelete) {
        await deleteDayTrade(id);
      }
      onTradesUpdated();
    } catch {
      loadTrades();
    }
  };

  const handleDeleteBuy = async (match: MatchedPair) => {
    setTrades((prev) => prev.filter((t) => t.id !== match.buy.id));
    try {
      await deleteDayTrade(match.buy.id);
      onTradesUpdated();
    } catch {
      loadTrades();
    }
  };

  // --- Edit handlers ---
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editDate, setEditDate] = useState("");

  const startEdit = (trade: DayTrade) => {
    setEditingId(trade.id);
    setEditPrice(trade.price.toString());
    setEditQty(trade.quantity.toString());
    setEditDate(trade.trade_date.slice(0, 10));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPrice("");
    setEditQty("");
    setEditDate("");
  };

  const saveEdit = async (trade: DayTrade) => {
    const price = parseFloat(editPrice);
    const quantity = parseFloat(editQty);
    if (!price || !quantity) return;
    const dt = editDate + " " + trade.trade_date.slice(11, 19);
    // Optimistic update
    setTrades((prev) =>
      prev.map((t) =>
        t.id === trade.id ? { ...t, price, quantity, trade_date: dt } : t
      )
    );
    cancelEdit();
    try {
      await updateDayTrade(trade.id, { price, quantity, trade_date: dt });
      onTradesUpdated();
    } catch {
      loadTrades();
    }
  };

  const toggleExpandGroup = (sellId: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(sellId)) next.delete(sellId);
      else next.add(sellId);
      return next;
    });
  };

  const addBatchBuyRow = () => {
    setBatchBuys((prev) => [...prev, { price: "", quantity: "" }]);
  };

  const removeBatchBuyRow = (idx: number) => {
    setBatchBuys((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateBatchBuy = (
    idx: number,
    field: "price" | "quantity",
    value: string
  ) => {
    setBatchBuys((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, [field]: value } : b))
    );
  };

  // Batch summary
  const batchTotalBuyQty = batchBuys.reduce(
    (s, b) => s + (b.quantity ? parseFloat(b.quantity) : 0),
    0
  );
  const batchSellQtyNum = batchSellQty ? parseFloat(batchSellQty) : 0;
  const batchRemaining = Math.max(batchSellQtyNum - batchTotalBuyQty, 0);
  const batchEstimatedPnl = (() => {
    if (!batchSellPrice || !batchSellQty) return 0;
    const sp = parseFloat(batchSellPrice);
    const sq = parseFloat(batchSellQty);
    let remaining = sq;
    let totalPnl = 0;
    for (const b of batchBuys) {
      if (!b.price || !b.quantity) continue;
      const bp = parseFloat(b.price);
      const bq = parseFloat(b.quantity);
      const matchQty = Math.min(remaining, bq);
      if (matchQty <= 0) break;
      const sellFee = batchFees.sell > 0 ? batchFees.sell * (matchQty / sq) : 0;
      totalPnl += (sp - bp) * matchQty - sellFee;
      remaining -= matchQty;
    }
    return totalPnl;
  })();

  const canSubmitPair = sellPrice && buyPrice && sellQty && buyQty;
  const canSubmitBatch =
    batchSellPrice &&
    batchSellQty &&
    batchBuys.some((b) => b.price && b.quantity);

  return (
    <div
      style={{
        marginTop: 8,
        padding: "10px 14px",
        background: C.bgSecondary,
        borderRadius: C.radiusSm,
        border: `1px solid ${C.borderLight}`,
      }}
    >
      <style>{`
        @keyframes expandFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sell-group-card {
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                      box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .sell-group-card:hover {
          transform: translateY(-2px);
          box-shadow: ${C.shadowMd};
        }
        .buy-row-item {
          transition: background 0.2s ease;
        }
        .buy-row-item:hover {
          background: ${C.bgSecondary};
        }
        .day-trade-action-btn {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          border-radius: 5px;
        }
        .day-trade-action-btn:hover {
          background: ${C.bgSecondary};
          color: ${C.primary};
        }
        .dt-input {
          width: 100%;
          padding: 8px 12px;
          font-size: 12px;
          font-family: ${C.fontMono};
          border: 1.5px solid ${C.borderDefault};
          border-radius: ${C.radiusSm}px;
          background: ${C.bgSurface};
          color: ${C.textPrimary};
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
        }
        .dt-input:focus {
          border-color: ${C.primary};
          box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
          background: #fff;
        }
        .dt-input::placeholder {
          color: ${C.textMuted};
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.textSecondary,
              fontFamily: C.fontDisplay,
            }}
          >
            做T记录
          </span>
          {sellGroups.length > 0 && (
            <span
              style={{
                fontSize: 12,
                fontFamily: C.fontMono,
                fontWeight: 700,
                color: totalPnl >= 0 ? C.success : C.danger,
              }}
            >
              预估T盈亏 {totalPnl >= 0 ? "+" : ""}
              {currencySymbol}
              {totalPnl.toFixed(3)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            className="day-trade-action-btn"
            onClick={() => {
              setShowForm(!showForm);
              if (!showForm) setMode("pair");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 12px",
              borderRadius: C.radiusSm,
              border: `1px solid ${showForm ? C.primary : C.borderDefault}`,
              background: showForm ? C.primary : C.bgSurface,
              color: showForm ? "#fff" : C.textSecondary,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              fontFamily: C.fontDisplay,
            }}
          >
            <Plus size={12} />
            添加做T
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      {showForm && (
        <div
          style={{
            display: "flex",
            gap: 0,
            marginTop: 12,
            marginBottom: 12,
          }}
        >
          <button
            onClick={() => setMode("pair")}
            style={{
              flex: 1,
              padding: "7px 0",
              fontSize: 11,
              fontWeight: 600,
              border: `1px solid ${mode === "pair" ? C.primary : C.borderDefault}`,
              borderRadius: `${C.radiusSm}px 0 0 ${C.radiusSm}px`,
              background: mode === "pair" ? C.primary : C.bgSurface,
              color: mode === "pair" ? "#fff" : C.textSecondary,
              cursor: "pointer",
              transition: "all 0.2s",
              fontFamily: C.fontDisplay,
            }}
          >
            一次性配对
          </button>
          <button
            onClick={() => setMode("batch")}
            style={{
              flex: 1,
              padding: "7px 0",
              fontSize: 11,
              fontWeight: 600,
              border: `1px solid ${mode === "batch" ? C.primary : C.borderDefault}`,
              borderRadius: `0 ${C.radiusSm}px ${C.radiusSm}px 0`,
              borderLeft: "none",
              background: mode === "batch" ? C.primary : C.bgSurface,
              color: mode === "batch" ? "#fff" : C.textSecondary,
              cursor: "pointer",
              transition: "all 0.2s",
              fontFamily: C.fontDisplay,
            }}
          >
            分批买入
          </button>
        </div>
      )}

      {/* Quick pair form */}
      {showForm && mode === "pair" && (
        <div
          style={{
            padding: 14,
            background: C.bgSurface,
            borderRadius: C.radiusMd,
            border: `1px solid ${C.borderLight}`,
            boxShadow: C.shadowSm,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.danger,
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontFamily: C.fontDisplay,
                }}
              >
                卖出
              </div>
              <input
                type="number"
                className="dt-input"
                placeholder="价格"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <input
                type="number"
                className="dt-input"
                placeholder="数量"
                value={sellQty}
                onChange={(e) => setSellQty(e.target.value)}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.success,
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontFamily: C.fontDisplay,
                }}
              >
                买回
              </div>
              <input
                type="number"
                className="dt-input"
                placeholder="价格"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <input
                type="number"
                className="dt-input"
                placeholder="数量"
                value={buyQty}
                onChange={(e) => setBuyQty(e.target.value)}
              />
            </div>
          </div>
          <input
            type="date"
            className="dt-input"
            value={tradeDate}
            onChange={(e) => setTradeDate(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          {sellPrice && buyPrice && sellQty && buyQty && (
            <div
              style={{
                padding: "10px 14px",
                background: C.bgSecondary,
                borderRadius: C.radiusSm,
                fontSize: 12,
                marginBottom: 12,
                lineHeight: 1.7,
                fontFamily: C.fontDisplay,
                color: C.textSecondary,
              }}
            >
              <div>
                差价:{" "}
                <b style={{ fontFamily: C.fontMono, color: C.textPrimary }}>
                  {(parseFloat(sellPrice) - parseFloat(buyPrice)).toFixed(3)}
                </b>
              </div>
              <div>
                已匹配盈亏:{" "}
                <b
                  style={{
                    fontFamily: C.fontMono,
                    color:
                      (parseFloat(sellPrice) - parseFloat(buyPrice)) *
                        Math.min(parseFloat(sellQty), parseFloat(buyQty)) >=
                      0
                        ? C.success
                        : C.danger,
                  }}
                >
                  {currencySymbol}
                  {(
                    (parseFloat(sellPrice) - parseFloat(buyPrice)) *
                    Math.min(parseFloat(sellQty), parseFloat(buyQty))
                  ).toFixed(3)}
                </b>
              </div>
              {parseInt(sellQty) !== parseInt(buyQty) && (
                <div style={{ fontSize: 10, color: C.textTertiary }}>
                  卖出{sellQty}股，买回{buyQty}股
                </div>
              )}
              {(pairFees.sell > 0 || pairFees.buy > 0) && (
                <div style={{ fontSize: 11, color: C.textTertiary }}>
                  预估费用: {currencySymbol}
                  {(pairFees.sell + pairFees.buy).toFixed(3)}
                </div>
              )}
            </div>
          )}
          <button
            onClick={handlePairSubmit}
            disabled={!canSubmitPair}
            style={{
              width: "100%",
              padding: "9px",
              borderRadius: C.radiusSm,
              border: "none",
              background: `linear-gradient(135deg, ${C.primary} 0%, #0e7490 100%)`,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmitPair ? "pointer" : "not-allowed",
              opacity: canSubmitPair ? 1 : 0.5,
              transition: "all 0.2s",
              boxShadow: canSubmitPair ? "0 2px 8px rgba(8, 145, 178, 0.2)" : "none",
              fontFamily: C.fontDisplay,
            }}
          >
            {t("common.save")}
          </button>
        </div>
      )}

      {/* Batch buy form */}
      {showForm && mode === "batch" && (
        <div
          style={{
            padding: 14,
            background: C.bgSurface,
            borderRadius: C.radiusMd,
            border: `1px solid ${C.borderLight}`,
            boxShadow: C.shadowSm,
          }}
        >
          {/* Sell info (top) */}
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.danger,
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontFamily: C.fontDisplay,
              }}
            >
              卖出（填一次）
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="number"
                className="dt-input"
                placeholder="价格"
                value={batchSellPrice}
                onChange={(e) => setBatchSellPrice(e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                type="number"
                className="dt-input"
                placeholder="数量"
                value={batchSellQty}
                onChange={(e) => setBatchSellQty(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          {/* Date */}
          <input
            type="date"
            className="dt-input"
            value={batchDate}
            onChange={(e) => setBatchDate(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          {/* Buy sub-orders */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.success,
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontFamily: C.fontDisplay,
              }}
            >
              买回子单
            </div>
            {batchBuys.map((buy, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: C.textTertiary,
                    minWidth: 18,
                    fontFamily: C.fontDisplay,
                    fontWeight: 600,
                  }}
                >
                  {idx + 1}.
                </span>
                <input
                  type="number"
                  className="dt-input"
                  placeholder="价格"
                  value={buy.price}
                  onChange={(e) => updateBatchBuy(idx, "price", e.target.value)}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  className="dt-input"
                  placeholder="数量"
                  value={buy.quantity}
                  onChange={(e) => updateBatchBuy(idx, "quantity", e.target.value)}
                  style={{ flex: 1 }}
                />
                {batchBuys.length > 1 && (
                  <button
                    onClick={() => removeBatchBuyRow(idx)}
                    style={{
                      background: "none",
                      border: "none",
                      color: C.textMuted,
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                      borderRadius: 4,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = C.danger; e.currentTarget.style.background = C.dangerLight; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.background = "none"; }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addBatchBuyRow}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                borderRadius: C.radiusSm,
                border: `1px dashed ${C.borderDefault}`,
                background: "none",
                color: C.textSecondary,
                fontSize: 11,
                cursor: "pointer",
                transition: "all 0.2s",
                fontFamily: C.fontDisplay,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.color = C.primary; e.currentTarget.style.background = C.primaryLight; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.borderDefault; e.currentTarget.style.color = C.textSecondary; e.currentTarget.style.background = "none"; }}
            >
              <Plus size={12} /> 添加买入
            </button>
          </div>

          {/* Batch summary */}
          {batchSellPrice &&
            batchSellQty &&
            batchBuys.some((b) => b.price && b.quantity) && (
              <div
                style={{
                  padding: "10px 14px",
                  background: C.bgSecondary,
                  borderRadius: C.radiusSm,
                  fontSize: 12,
                  marginBottom: 12,
                  lineHeight: 1.7,
                  fontFamily: C.fontDisplay,
                  color: C.textSecondary,
                }}
              >
                <div>
                  已匹配: <b style={{ fontFamily: C.fontMono }}>{batchTotalBuyQty}</b>股 / 卖出
                  {batchSellQty}股
                </div>
                {batchRemaining > 0 && (
                  <div style={{ color: C.textTertiary }}>
                    剩余未匹配: {batchRemaining}股
                  </div>
                )}
                {batchFees.sell > 0 && (
                  <div style={{ color: C.textTertiary }}>
                    卖出手续费: {currencySymbol}
                    {batchFees.sell.toFixed(3)}
                  </div>
                )}
                <div>
                  预估T盈亏:{" "}
                  <b
                    style={{
                      fontFamily: C.fontMono,
                      color: batchEstimatedPnl >= 0 ? C.success : C.danger,
                    }}
                  >
                    {batchEstimatedPnl >= 0 ? "+" : ""}
                    {currencySymbol}
                    {batchEstimatedPnl.toFixed(3)}
                  </b>
                </div>
              </div>
            )}

          <button
            onClick={handleBatchSubmit}
            disabled={!canSubmitBatch}
            style={{
              width: "100%",
              padding: "9px",
              borderRadius: C.radiusSm,
              border: "none",
              background: `linear-gradient(135deg, ${C.primary} 0%, #0e7490 100%)`,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmitBatch ? "pointer" : "not-allowed",
              opacity: canSubmitBatch ? 1 : 0.5,
              transition: "all 0.2s",
              boxShadow: canSubmitBatch ? "0 2px 8px rgba(8, 145, 178, 0.2)" : "none",
              fontFamily: C.fontDisplay,
            }}
          >
            {t("common.save")}
          </button>
        </div>
      )}

      {/* FIFO-matched sell groups */}
      {sellGroups.length > 0 && (
        <div
          style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}
        >
          {sellGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.sell.id);
            const totalBuyMatched = group.matches.reduce(
              (s, m) => s + m.matchQty,
              0
            );
            return (
              <div
                key={group.sell.id}
                className="sell-group-card"
                style={{
                  background: C.bgSurface,
                  borderRadius: C.radiusMd,
                  border: `1px solid ${C.borderLight}`,
                  overflow: "hidden",
                  borderLeft: `3px solid ${group.totalPnl >= 0 ? C.success : C.danger}`,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {/* Sell group header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onClick={() => toggleExpandGroup(group.sell.id)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = C.bgSecondary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: C.dangerLight,
                        color: C.danger,
                        flexShrink: 0,
                        letterSpacing: "0.04em",
                        fontFamily: C.fontDisplay,
                      }}
                    >
                      卖
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: C.textSecondary,
                        flexShrink: 0,
                        fontFamily: C.fontMono,
                      }}
                    >
                      {group.sell.quantity}股 @ {group.sell.price.toFixed(3)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: C.textTertiary,
                        flexShrink: 0,
                        fontFamily: C.fontDisplay,
                      }}
                    >
                      {group.sell.trade_date.slice(0, 10)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: C.textTertiary,
                        flexShrink: 0,
                        fontFamily: C.fontDisplay,
                      }}
                    >
                      手续费:{currencySymbol}
                      {parseFee(group.sell.notes).toFixed(2)}
                    </span>
                    {group.matches.length > 0 && (
                      <>
                        <span
                          style={{
                            fontSize: 10,
                            color: C.textTertiary,
                            flexShrink: 0,
                            fontFamily: C.fontDisplay,
                          }}
                        >
                          匹配{totalBuyMatched}股
                        </span>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            fontFamily: C.fontMono,
                            color: group.totalPnl >= 0 ? C.success : C.danger,
                            flexShrink: 0,
                          }}
                        >
                          {group.totalPnl >= 0 ? "+" : ""}
                          {currencySymbol}
                          {group.totalPnl.toFixed(3)}
                        </span>
                      </>
                    )}
                    {group.unmatchedQty > 0 && group.matches.length > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: C.textMuted,
                          flexShrink: 0,
                          fontFamily: C.fontDisplay,
                        }}
                      >
                        剩余{group.unmatchedQty}股
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    <button
                      className="day-trade-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGroup(group);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: C.textMuted,
                        cursor: "pointer",
                        padding: 4,
                        display: "flex",
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                    {isExpanded ? (
                      <ChevronUp size={14} color={C.textMuted} />
                    ) : (
                      <ChevronDown size={14} color={C.textMuted} />
                    )}
                  </div>
                </div>

                {/* Expanded: matched buys */}
                {isExpanded && group.matches.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.borderLight}`, animation: "expandFadeIn 0.25s ease both" }}>
                    {/* Column headers for buy rows */}
                    <div
                      style={{
                        padding: "6px 14px 4px 14px",
                        marginLeft: 12,
                        paddingLeft: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 9,
                        fontWeight: 700,
                        color: C.textTertiary,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        userSelect: "none",
                        fontVariantNumeric: "tabular-nums",
                        fontFamily: C.fontDisplay,
                      }}
                    >
                      <span style={{ width: 24, flexShrink: 0 }}>{""}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>时间</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "center" }}>买入价</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "center" }}>卖出金额</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "center" }}>盈亏</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "center", marginLeft: 16 }}>数量</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "center", marginLeft: 16, marginRight: 30 }}>手续费</span>
                      <span style={{ width: 42, flexShrink: 0 }}>{""}</span>
                    </div>
                    {group.matches.map((m, idx) => {
                      const isLast = idx === group.matches.length - 1;
                      return (
                        <div
                          key={m.buy.id}
                          className="buy-row-item"
                          style={{
                            padding: "7px 14px",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 11,
                            borderTop: isLast ? "none" : `1px dashed ${C.borderLight}`,
                            borderLeft: "2px solid transparent",
                            marginLeft: 12,
                            paddingLeft: 12,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: C.primaryLight,
                              color: C.primary,
                              flexShrink: 0,
                              width: 24,
                              textAlign: "center",
                              fontFamily: C.fontDisplay,
                            }}
                          >
                            买
                          </span>
                          <span
                            style={{
                              color: C.textTertiary,
                              fontSize: 10,
                              flex: 1,
                              minWidth: 0,
                              fontFamily: C.fontDisplay,
                            }}
                          >
                            {m.buy.trade_date.slice(5, 16).replace("T", " ")}
                          </span>
                          <span
                            style={{
                              fontFamily: C.fontMono,
                              fontWeight: 500,
                              flex: 1,
                              minWidth: 0,
                              textAlign: "center",
                              color: C.textPrimary,
                            }}
                          >
                            {m.buy.price.toFixed(3)}
                          </span>
                          <span
                            style={{
                              fontFamily: C.fontMono,
                              fontWeight: 600,
                              color: C.danger,
                              flex: 1,
                              minWidth: 0,
                              textAlign: "center",
                            }}
                          >
                            -{(m.buy.price * m.matchQty).toFixed(3)}
                          </span>
                          <span
                            style={{
                              fontFamily: C.fontMono,
                              fontWeight: 700,
                              color: m.pnl >= 0 ? C.success : C.danger,
                              flex: 1,
                              minWidth: 0,
                              textAlign: "center",
                            }}
                          >
                            {m.pnl >= 0 ? "+" : ""}
                            {currencySymbol}
                            {m.pnl.toFixed(3)}
                          </span>
                          <span
                            style={{
                              color: C.textTertiary,
                              fontSize: 10,
                              flex: 1,
                              minWidth: 0,
                              textAlign: "center",
                              marginLeft: 16,
                              fontFamily: C.fontMono,
                            }}
                          >
                            {m.matchQty}
                          </span>
                          <span
                            style={{
                              color: C.textTertiary,
                              fontFamily: C.fontMono,
                              fontSize: 10,
                              flex: 1,
                              minWidth: 0,
                              textAlign: "center",
                              marginLeft: 16,
                              marginRight: 30,
                            }}
                          >
                            {parseFee(m.buy.notes).toFixed(2)}
                          </span>
                          {editingId === m.buy.id ? (
                            <>
                              <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} onClick={(e) => e.stopPropagation()}
                                style={{ width: 60, padding: "3px 5px", fontSize: 10, fontFamily: C.fontMono, border: `1.5px solid ${C.primary}`, borderRadius: 5, background: C.bgSurface, color: C.textPrimary, outline: "none" }} />
                              <input type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)} onClick={(e) => e.stopPropagation()}
                                style={{ width: 50, padding: "3px 5px", fontSize: 10, fontFamily: C.fontMono, border: `1.5px solid ${C.primary}`, borderRadius: 5, background: C.bgSurface, color: C.textPrimary, outline: "none" }} />
                              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} onClick={(e) => e.stopPropagation()}
                                style={{ width: 85, padding: "3px 5px", fontSize: 10, border: `1.5px solid ${C.primary}`, borderRadius: 5, background: C.bgSurface, color: C.textPrimary, outline: "none" }} />
                              <button onClick={(e) => { e.stopPropagation(); saveEdit(m.buy); }} className="day-trade-action-btn"
                                style={{ background: "none", border: "none", color: C.success, cursor: "pointer", padding: 3, display: "flex" }}>
                                <Check size={11} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); cancelEdit(); }} className="day-trade-action-btn"
                                style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: 3, display: "flex" }}>
                                <X size={11} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="day-trade-action-btn" onClick={(e) => { e.stopPropagation(); startEdit(m.buy); }}
                                style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: 3, display: "flex" }}>
                                <Pencil size={10} />
                              </button>
                              <button className="day-trade-action-btn" onClick={(e) => { e.stopPropagation(); handleDeleteBuy(m); }}
                                style={{ background: "none", border: "none", color: C.textMuted, cursor: "pointer", padding: 3, display: "flex" }}>
                                <Trash2 size={10} />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* No matches yet */}
                {isExpanded && group.matches.length === 0 && (
                  <div
                    style={{
                      borderTop: `1px solid ${C.borderLight}`,
                      padding: "8px 14px",
                      fontSize: 11,
                      color: C.textMuted,
                      fontFamily: C.fontDisplay,
                    }}
                  >
                    尚无匹配买入
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
