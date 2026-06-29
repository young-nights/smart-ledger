/**
 * DayTradePanel — T-trading records panel.
 * Supports two modes:
 *   1. Quick pair: one sell + one buy (default)
 *   2. Batch buy: one sell + multiple small buys
 *
 * Uses FIFO matching: each buy consumes from the oldest unmatched sell.
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

// --- FIFO matching algorithm ---

function calculateMatchedTrades(trades: DayTrade[]): SellGroup[] {
  const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  const pendingSells: { trade: DayTrade; remaining: number }[] = [];
  const matches: MatchedPair[] = [];

  const parseFee = (notes: string): number => {
    try {
      return JSON.parse(notes).fee || 0;
    } catch {
      return 0;
    }
  };

  for (const t of sorted) {
    if (t.trade_type === "sell") {
      pendingSells.push({ trade: t, remaining: t.quantity });
    } else if (t.trade_type === "buy" && pendingSells.length > 0) {
      let buyRemaining = t.quantity;
      while (buyRemaining > 0 && pendingSells.length > 0) {
        const ps = pendingSells[0];
        const matchQty = Math.min(ps.remaining, buyRemaining);
        const sellFee = parseFee(ps.trade.notes);
        const proratedFee =
          ps.trade.quantity > 0 ? sellFee * (matchQty / ps.trade.quantity) : 0;
        const pnl = (ps.trade.price - t.price) * matchQty - proratedFee;
        matches.push({ sell: ps.trade, buy: t, matchQty, pnl });
        ps.remaining -= matchQty;
        buyRemaining -= matchQty;
        if (ps.remaining <= 0) pendingSells.shift();
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

  // Add unmatched sells (no buys matched yet)
  for (const ps of pendingSells) {
    if (!groupMap.has(ps.trade.id)) {
      groupMap.set(ps.trade.id, {
        sell: ps.trade,
        matches: [],
        unmatchedQty: ps.remaining,
        totalPnl: 0,
      });
    }
  }

  // Sort by sell date descending (newest first)
  return Array.from(groupMap.values()).sort((a, b) =>
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

  // Batch summary — FIFO-style tracking of remaining sell qty
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
        padding: "8px 12px",
        background: "var(--bg-secondary, #f8fafc)",
        borderRadius: 8,
        border: "1px solid var(--border-light, #f1f5f9)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <style>{`
        @keyframes expandFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes numberPop {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        .sell-group-card {
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
                      box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .sell-group-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 16px -4px rgba(0, 0, 0, 0.1);
        }
        .buy-row-item {
          transition: background 0.2s ease;
        }
        .buy-row-item:hover {
          background: var(--bg-secondary, #f8fafc);
        }
        .day-trade-action-btn {
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .day-trade-action-btn:hover {
          background: var(--bg-secondary, #f8fafc);
          color: var(--color-primary, #0891b2);
          border-radius: 4px;
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-secondary)",
            }}
          >
            做T记录
          </span>
          {sellGroups.length > 0 && (
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color:
                  totalPnl >= 0
                    ? "var(--color-success)"
                    : "var(--color-danger)",
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
              gap: 4,
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-default)",
              background: showForm ? "var(--color-primary)" : "var(--bg-surface)",
              color: showForm ? "#fff" : "var(--text-secondary)",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
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
            marginTop: 10,
            marginBottom: 10,
          }}
        >
          <button
            onClick={() => setMode("pair")}
            style={{
              flex: 1,
              padding: "6px 0",
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid var(--border-default)",
              borderRadius: "6px 0 0 6px",
              background:
                mode === "pair"
                  ? "var(--color-primary)"
                  : "var(--bg-surface)",
              color:
                mode === "pair"
                  ? "#fff"
                  : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            一次性配对
          </button>
          <button
            onClick={() => setMode("batch")}
            style={{
              flex: 1,
              padding: "6px 0",
              fontSize: 11,
              fontWeight: 600,
              border: "1px solid var(--border-default)",
              borderRadius: "0 6px 6px 0",
              borderLeft: "none",
              background:
                mode === "batch"
                  ? "var(--color-primary)"
                  : "var(--bg-surface)",
              color:
                mode === "batch"
                  ? "#fff"
                  : "var(--text-secondary)",
              cursor: "pointer",
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
            padding: 12,
            background: "var(--bg-surface)",
            borderRadius: 8,
            border: "1px solid var(--border-light)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--color-danger)",
                  marginBottom: 4,
                }}
              >
                卖出
              </div>
              <input
                type="number"
                placeholder="价格"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                style={{ ...inputStyle, marginBottom: 6 }}
              />
              <input
                type="number"
                placeholder="数量"
                value={sellQty}
                onChange={(e) => setSellQty(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--color-success)",
                  marginBottom: 4,
                }}
              >
                买回
              </div>
              <input
                type="number"
                placeholder="价格"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                style={{ ...inputStyle, marginBottom: 6 }}
              />
              <input
                type="number"
                placeholder="数量"
                value={buyQty}
                onChange={(e) => setBuyQty(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
          <input
            type="date"
            value={tradeDate}
            onChange={(e) => setTradeDate(e.target.value)}
            style={{ ...inputStyle, marginBottom: 10 }}
          />
          {sellPrice && buyPrice && sellQty && buyQty && (
            <div
              style={{
                padding: "8px 10px",
                background: "var(--bg-secondary)",
                borderRadius: 6,
                fontSize: 11,
                marginBottom: 10,
                lineHeight: 1.6,
              }}
            >
              <div>
                差价:{" "}
                <b>
                  {(parseFloat(sellPrice) - parseFloat(buyPrice)).toFixed(3)}
                </b>
              </div>
              <div>
                已匹配盈亏:{" "}
                <b
                  style={{
                    color:
                      (parseFloat(sellPrice) - parseFloat(buyPrice)) *
                        Math.min(
                          parseFloat(sellQty),
                          parseFloat(buyQty)
                        ) >=
                      0
                        ? "var(--color-success)"
                        : "var(--color-danger)",
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
                <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                  卖出{sellQty}股，买回{buyQty}股
                </div>
              )}
              {(pairFees.sell > 0 || pairFees.buy > 0) && (
                <div style={{ color: "var(--text-tertiary)" }}>
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
              padding: "8px",
              borderRadius: 8,
              border: "none",
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmitPair ? "pointer" : "not-allowed",
              opacity: canSubmitPair ? 1 : 0.5,
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
            padding: 12,
            background: "var(--bg-surface)",
            borderRadius: 8,
            border: "1px solid var(--border-light)",
          }}
        >
          {/* Sell info (top) */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--color-danger)",
                marginBottom: 4,
              }}
            >
              卖出（填一次）
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                placeholder="价格"
                value={batchSellPrice}
                onChange={(e) => setBatchSellPrice(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="number"
                placeholder="数量"
                value={batchSellQty}
                onChange={(e) => setBatchSellQty(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          </div>

          {/* Date */}
          <input
            type="date"
            value={batchDate}
            onChange={(e) => setBatchDate(e.target.value)}
            style={{ ...inputStyle, marginBottom: 10 }}
          />

          {/* Buy sub-orders */}
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--color-success)",
                marginBottom: 6,
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
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-tertiary)",
                    minWidth: 16,
                  }}
                >
                  {idx + 1}.
                </span>
                <input
                  type="number"
                  placeholder="价格"
                  value={buy.price}
                  onChange={(e) =>
                    updateBatchBuy(idx, "price", e.target.value)
                  }
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  type="number"
                  placeholder="数量"
                  value={buy.quantity}
                  onChange={(e) =>
                    updateBatchBuy(idx, "quantity", e.target.value)
                  }
                  style={{ ...inputStyle, flex: 1 }}
                />
                {batchBuys.length > 1 && (
                  <button
                    onClick={() => removeBatchBuyRow(idx)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                    }}
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
                gap: 4,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px dashed var(--border-default)",
                background: "none",
                color: "var(--text-secondary)",
                fontSize: 11,
                cursor: "pointer",
              }}
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
                  padding: "8px 10px",
                  background: "var(--bg-secondary)",
                  borderRadius: 6,
                  fontSize: 11,
                  marginBottom: 10,
                  lineHeight: 1.6,
                }}
              >
                <div>
                  已匹配: <b>{batchTotalBuyQty}</b>股 / 卖出
                  {batchSellQty}股
                </div>
                {batchRemaining > 0 && (
                  <div style={{ color: "var(--text-tertiary)" }}>
                    剩余未匹配: {batchRemaining}股
                  </div>
                )}
                {batchFees.sell > 0 && (
                  <div style={{ color: "var(--text-tertiary)" }}>
                    卖出手续费: {currencySymbol}
                    {batchFees.sell.toFixed(3)}
                  </div>
                )}
                <div>
                  预估T盈亏:{" "}
                  <b
                    style={{
                      color:
                        batchEstimatedPnl >= 0
                          ? "var(--color-success)"
                          : "var(--color-danger)",
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
              padding: "8px",
              borderRadius: 8,
              border: "none",
              background: "var(--color-primary)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: canSubmitBatch ? "pointer" : "not-allowed",
              opacity: canSubmitBatch ? 1 : 0.5,
            }}
          >
            {t("common.save")}
          </button>
        </div>
      )}

      {/* FIFO-matched sell groups */}
      {sellGroups.length > 0 && (
        <div
          style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}
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
                  background: "var(--bg-surface)",
                  borderRadius: 8,
                  border: "1px solid var(--border-light)",
                  overflow: "hidden",
                  borderLeft: `3px solid ${group.totalPnl >= 0 ? "var(--color-success, #16a34a)" : "var(--color-danger, #dc2626)"}`,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {/* Sell group header */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    cursor: "pointer",
                  }}
                  onClick={() => toggleExpandGroup(group.sell.id)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        padding: "1px 5px",
                        borderRadius: 3,
                        background: "rgba(220, 38, 38, 0.1)",
                        color: "var(--color-danger)",
                        flexShrink: 0,
                      }}
                    >
                      卖
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        flexShrink: 0,
                      }}
                    >
                      {group.sell.quantity}股 @{" "}
                      {group.sell.price.toFixed(3)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--text-tertiary)",
                        flexShrink: 0,
                      }}
                    >
                      {group.sell.trade_date.slice(0, 10)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--text-tertiary)",
                        flexShrink: 0,
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
                            color: "var(--text-tertiary)",
                            flexShrink: 0,
                          }}
                        >
                          匹配{totalBuyMatched}股
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            fontFamily: "var(--font-mono)",
                            color:
                              group.totalPnl >= 0
                                ? "var(--color-success)"
                                : "var(--color-danger)",
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
                          color: "var(--text-muted)",
                          flexShrink: 0,
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
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: 2,
                        display: "flex",
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                    {isExpanded ? (
                      <ChevronUp size={14} color="var(--text-muted)" />
                    ) : (
                      <ChevronDown size={14} color="var(--text-muted)" />
                    )}
                  </div>
                </div>

                {/* Expanded: matched buys */}
                {isExpanded && group.matches.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border-light)", animation: "expandFadeIn 0.25s ease both" }}>
                    {/* Column headers for buy rows */}
                    <div
                      style={{
                        padding: "5px 12px 3px 12px",
                        marginLeft: 12,
                        paddingLeft: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 9,
                        fontWeight: 600,
                        color: "var(--text-tertiary, #a8a29e)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        userSelect: "none",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <span style={{ width: 20, flexShrink: 0 }}>{""}</span>{/* 买 badge */}
                      <span style={{ flex: 1, minWidth: 0 }}>时间</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "right" }}>买入价</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "right" }}>卖出金额</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "right" }}>盈亏</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "right" }}>数量</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "right", marginLeft: -100 }}>手续费</span>
                      <span style={{ width: 42, flexShrink: 0 }}>{""}</span>{/* action buttons */}
                    </div>
                    {group.matches.map((m, idx) => {
                      const isLast = idx === group.matches.length - 1;
                      return (
                        <div
                          key={m.buy.id}
                          className="buy-row-item"
                          style={{
                            padding: "6px 12px",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 11,
                            borderTop: isLast
                              ? "none"
                              : "1px dashed var(--border-light)",
                            borderLeft: "2px solid transparent",
                            marginLeft: 12,
                            paddingLeft: 12,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: "1px 5px",
                              borderRadius: 3,
                              background: "rgba(8, 145, 178, 0.1)",
                              color: "var(--color-primary)",
                              flexShrink: 0,
                            }}
                          >
                            买
                          </span>
                          <span
                            style={{
                              color: "var(--text-tertiary)",
                              fontSize: 10,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            {m.buy.trade_date.slice(5, 16).replace("T", " ")}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontWeight: 500,
                              flex: 1,
                              minWidth: 0,
                              textAlign: "right",
                            }}
                          >
                            {m.buy.price.toFixed(3)}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontWeight: 600,
                              color: "var(--color-danger)",
                              flex: 1,
                              minWidth: 0,
                              textAlign: "right",
                            }}
                          >
                            -{(m.buy.price * m.matchQty).toFixed(3)}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontWeight: 600,
                              color:
                                m.pnl >= 0
                                  ? "var(--color-success)"
                                  : "var(--color-danger)",
                              flex: 1,
                              minWidth: 0,
                              textAlign: "right",
                            }}
                          >
                            {m.pnl >= 0 ? "+" : ""}
                            {currencySymbol}
                            {m.pnl.toFixed(3)}
                          </span>
                          <span
                            style={{
                              color: "var(--text-tertiary)",
                              fontSize: 10,
                              flex: 1,
                              minWidth: 0,
                              textAlign: "right",
                            }}
                          >
                            {m.matchQty}
                          </span>
                          <span
                            style={{
                              color: "var(--text-tertiary)",
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              flex: 1,
                              minWidth: 0,
                              textAlign: "right",
                              marginLeft: -100,
                            }}
                          >
                            {parseFee(m.buy.notes).toFixed(2)}
                          </span>
                          {editingId === m.buy.id ? (
                            <>
                              <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} onClick={(e) => e.stopPropagation()}
                                style={{ width: 60, padding: "2px 4px", fontSize: 10, fontFamily: "var(--font-mono)", border: "1px solid var(--color-primary)", borderRadius: 4, background: "var(--bg-surface)" }} />
                              <input type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)} onClick={(e) => e.stopPropagation()}
                                style={{ width: 50, padding: "2px 4px", fontSize: 10, fontFamily: "var(--font-mono)", border: "1px solid var(--color-primary)", borderRadius: 4, background: "var(--bg-surface)" }} />
                              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} onClick={(e) => e.stopPropagation()}
                                style={{ width: 85, padding: "2px 4px", fontSize: 10, border: "1px solid var(--color-primary)", borderRadius: 4, background: "var(--bg-surface)" }} />
                              <button onClick={(e) => { e.stopPropagation(); saveEdit(m.buy); }} style={{ background: "none", border: "none", color: "var(--color-success)", cursor: "pointer", padding: 2, display: "flex" }}>
                                <Check size={11} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); cancelEdit(); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, display: "flex" }}>
                                <X size={11} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="day-trade-action-btn" onClick={(e) => { e.stopPropagation(); startEdit(m.buy); }}
                                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, display: "flex" }}>
                                <Pencil size={10} />
                              </button>
                              <button className="day-trade-action-btn" onClick={(e) => { e.stopPropagation(); handleDeleteBuy(m); }}
                                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 2, display: "flex" }}>
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
                      borderTop: "1px solid var(--border-light)",
                      padding: "6px 12px",
                      fontSize: 11,
                      color: "var(--text-muted)",
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  border: "1px solid var(--border-default, #d6d3d1)",
  borderRadius: 6,
  background: "var(--bg-surface, #ffffff)",
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};
