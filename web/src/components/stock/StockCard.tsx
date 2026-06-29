/**
 * StockCard — Enhanced stock holding card with micro-animations.
 */

import { useState, useEffect, useRef } from "react";
import { Pencil, Check, X, Trash2, RefreshCw, MoreVertical } from "lucide-react";
import type { StockHolding } from "../../lib/types";
import { detectMarket, MARKET_BADGE } from "../../lib/market";
import { useTranslation } from "../../i18n";
import { DayTradePanel } from "./DayTradePanel";

interface StockCardProps {
  holding: StockHolding;
  onDelete: (id: number) => void;
  onUpdate: (id: number, data: { buy_price?: number; quantity?: number; buy_date?: string }) => void;
  onTradesUpdated: () => void;
  onClosePosition: (id: number) => void;
}

export function StockCard({ holding, onDelete, onUpdate, onTradesUpdated, onClosePosition }: StockCardProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editBuyPrice, setEditBuyPrice] = useState(holding.buy_price.toString());
  const [editQuantity, setEditQuantity] = useState(holding.quantity.toString());
  const [editBuyDate, setEditBuyDate] = useState(holding.buy_date);
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditBuyPrice(holding.buy_price.toString());
    setEditQuantity(holding.quantity.toString());
    setEditBuyDate(holding.buy_date);
  }, [holding]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const pnl = holding.pnl;
  const isPositive = pnl >= 0;
  const pnlColor = isPositive
    ? "var(--color-success, #16a34a)"
    : "var(--color-danger, #dc2626)";

  const dailyPnl = holding.daily_pnl ?? 0;
  const dailyPnlPct = holding.daily_pnl_pct ?? 0;
  const dayTradePnl = holding.day_trade_pnl ?? 0;
  const totalDailyPnl = dailyPnl + dayTradePnl;
  const isDailyPositive = totalDailyPnl >= 0;
  const dailyColor = isDailyPositive
    ? "var(--color-success, #16a34a)"
    : "var(--color-danger, #dc2626)";

  const totalPnl = holding.total_pnl ?? holding.pnl;
  const isTotalPositive = totalPnl >= 0;
  const totalColor = isTotalPositive
    ? "var(--color-success, #16a34a)"
    : "var(--color-danger, #dc2626)";

  const marketInfo = detectMarket(holding.ticker);
  const badge = MARKET_BADGE[marketInfo.market];

  return (
    <>
    <style>{`
      @keyframes stockCardIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes pulseGlow {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.8; }
      }
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      .stock-card-enhanced {
        animation: stockCardIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .stock-card-enhanced:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px -5px rgba(0, 0, 0, 0.08), 0 4px 10px -5px rgba(0, 0, 0, 0.04) !important;
      }
      .stock-card-enhanced .metric-value {
        transition: color 0.3s ease;
      }
      .stock-card-enhanced .pnl-bar {
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .stock-card-enhanced:hover .pnl-bar {
        width: 4px !important;
        opacity: 0.8 !important;
      }
      .stock-card-enhanced .card-action-btn {
        opacity: 0;
        transform: translateX(4px);
        transition: all 0.2s ease;
      }
      .stock-card-enhanced:hover .card-action-btn {
        opacity: 1;
        transform: translateX(0);
      }
      .stock-card-enhanced .shimmer-bg {
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%);
        background-size: 200% 100%;
        animation: shimmer 3s ease-in-out infinite;
      }
    `}</style>
    <div
      ref={cardRef}
      className="stock-card stock-card-enhanced"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: "var(--bg-surface, #ffffff)",
        border: "1px solid var(--border-light, #f5f5f4)",
        borderRadius: 14,
        position: "relative",
        overflow: "hidden",
        boxShadow: isHovered
          ? "0 8px 25px -5px rgba(0, 0, 0, 0.08), 0 4px 10px -5px rgba(0, 0, 0, 0.04)"
          : "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
        borderColor: isHovered ? "var(--border-default, #d6d3d1)" : "var(--border-light, #f5f5f4)",
      }}
    >
      {/* P&L indicator bar */}
      <div
        className="pnl-bar"
        style={{
          position: "absolute",
          left: 0,
          top: 8,
          bottom: 8,
          width: isHovered ? 4 : 3,
          background: `linear-gradient(180deg, ${pnlColor}, ${pnlColor}88)`,
          opacity: isHovered ? 0.8 : 0.5,
          borderRadius: "0 4px 4px 0",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />

      {/* Subtle gradient overlay */}
      <div
        className="shimmer-bg"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          borderRadius: 14,
        }}
      />

      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px 0 20px",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.02em",
            }}
          >
            {holding.ticker}
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.05em",
              padding: "2px 6px",
              borderRadius: 4,
              background: badge.bg,
              color: badge.color,
              lineHeight: "14px",
              textTransform: "uppercase",
              flexShrink: 0,
              boxShadow: `0 0 8px ${badge.bg}40`,
            }}
          >
            {badge.label}
          </span>
          <span
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {holding.name}
          </span>
        </div>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {!editing && (
            <button
              className="card-action-btn"
              onClick={() => setEditing(true)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted, #a8a29e)",
                cursor: "pointer",
                padding: 5,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--color-primary, #0891b2)";
                e.currentTarget.style.background = "rgba(8, 145, 178, 0.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted, #a8a29e)";
                e.currentTarget.style.background = "none";
              }}
            >
              <Pencil size={14} />
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() => {
                  onUpdate(holding.id, {
                    buy_price: parseFloat(editBuyPrice) || holding.buy_price,
                    quantity: parseFloat(editQuantity) || holding.quantity,
                    buy_date: editBuyDate,
                  });
                  setEditing(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-success, #16a34a)",
                  cursor: "pointer",
                  padding: 5,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: 5,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={14} />
              </button>
            </>
          )}
          {!editing && (
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                className="card-action-btn"
                onClick={() => setShowMenu(!showMenu)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted, #a8a29e)",
                  cursor: "pointer",
                  padding: 5,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--color-primary, #0891b2)";
                  e.currentTarget.style.background = "rgba(8, 145, 178, 0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted, #a8a29e)";
                  e.currentTarget.style.background = "none";
                }}
              >
                <MoreVertical size={14} />
              </button>
              {showMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: 4,
                    background: "var(--bg-surface, #ffffff)",
                    border: "1px solid var(--border-default, #d6d3d1)",
                    borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                    minWidth: 120,
                    zIndex: 50,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(holding.id);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "8px 12px",
                      border: "none",
                      background: "none",
                      color: "var(--color-danger, #dc2626)",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      textAlign: "left",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(220, 38, 38, 0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "none";
                    }}
                  >
                    <Trash2 size={13} />
                    {t("common.delete")}
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onClosePosition(holding.id);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "8px 12px",
                      border: "none",
                      borderTop: "1px solid var(--border-light, #f5f5f4)",
                      background: "none",
                      color: "#d97706",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      textAlign: "left",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(217, 119, 6, 0.06)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "none";
                    }}
                  >
                    <MoreVertical size={13} />
                    {t("stocks.closePosition")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div
          style={{
            padding: "12px 20px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
          }}
        >
          <EditField label={t("stocks.metric.buy")} value={editBuyPrice} onChange={setEditBuyPrice} prefix={marketInfo.currencySymbol} />
          <EditField label={t("stocks.metric.qty")} value={editQuantity} onChange={setEditQuantity} />
          <EditField label={t("stocks.edit.buyDate")} value={editBuyDate} onChange={setEditBuyDate} type="date" />
        </div>
      )}

      {/* Metrics row */}
      {!editing && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 0,
            padding: "12px 20px 14px 20px",
            marginTop: 2,
          }}
        >
          <MetricCell
            label={t("stocks.metric.buy")}
            value={`${marketInfo.currencySymbol}${holding.buy_price.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
          />
          <MetricCell
            label={t("stocks.metric.now")}
            value={`${marketInfo.currencySymbol}${holding.current_price.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
            highlight
          />
          <MetricCell label={t("stocks.metric.qty")} value={holding.quantity.toString()} />
          <MetricCell
            label={t("stocks.metric.value")}
            value={`${marketInfo.currencySymbol}${(holding.current_price * holding.quantity).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
          />
          <MetricCell
            label={t("stocks.metric.pnl")}
            value={`${isTotalPositive ? "+" : ""}${marketInfo.currencySymbol}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
            color={totalColor}
          />
          <MetricCell
            label={t("stocks.metric.rate")}
            value={`${isPositive ? "+" : ""}${holding.pnl_pct.toFixed(3)}%`}
            color={pnlColor}
          />
          <MetricCell
            label={t("stocks.metric.daily")}
            value={`${isDailyPositive ? "+" : ""}${marketInfo.currencySymbol}${totalDailyPnl.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
            color={dailyColor}
          />
        </div>
      )}

      {/* Day Trade Panel */}
      <DayTradePanel
        ticker={holding.ticker}
        currencySymbol={marketInfo.currencySymbol}
        market={marketInfo.market}
        onTradesUpdated={onTradesUpdated}
      />
    </div>
    </>
  );
}

function MetricCell({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "4px 4px",
        borderRight: "1px solid var(--border-light, #f5f5f4)",
        transition: "background 0.2s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-secondary, #f8fafc)";
        e.currentTarget.style.borderRadius = "6px";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderRadius = "0";
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        className="metric-value"
        style={{
          fontSize: 13,
          fontWeight: highlight ? 700 : 600,
          color: color || (highlight ? "var(--text-primary)" : "var(--text-secondary)"),
          fontFamily: "var(--font-mono)",
          lineHeight: 1.3,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  prefix,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  type?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ position: "relative" }}>
        {prefix && (
          <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            paddingLeft: prefix ? `${prefix.length * 8 + 12}px` : "8px",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            border: "1px solid var(--border-default, #d6d3d1)",
            borderRadius: 6,
            background: "var(--bg-surface, #ffffff)",
            color: "var(--text-primary)",
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-primary, #0891b2)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(8, 145, 178, 0.1)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default, #d6d3d1)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      </div>
    </div>
  );
}
