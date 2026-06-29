/**
 * StockCard — Modern stock holding card with micro-animations.
 * Features: staggered fade-in, hover lift + shadow, P&L glow bar, smooth transitions.
 */

import { useState, useEffect, useRef } from "react";
import { Pencil, Check, X, Trash2, MoreVertical } from "lucide-react";
import type { StockHolding } from "../../lib/types";
import { detectMarket, MARKET_BADGE } from "../../lib/market";
import { useTranslation } from "../../i18n";
import { DayTradePanel } from "./DayTradePanel";

/* ─── Color palette ─── */
const C = {
  bgSurface: "#ffffff",
  bgHover: "#f8fafc",
  bgMuted: "#f8fafc",
  borderLight: "#e8ecf0",
  borderDefault: "#d1d9e0",
  textPrimary: "#1a2332",
  textSecondary: "#4a5568",
  textTertiary: "#8896a6",
  textMuted: "#a0aec0",
  primary: "#0891b2",
  primaryLight: "rgba(8, 145, 178, 0.06)",
  success: "#059669",
  successLight: "rgba(5, 150, 105, 0.08)",
  danger: "#dc2626",
  dangerLight: "rgba(220, 38, 38, 0.06)",
  shadowSm: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)",
  shadowMd: "0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
  shadowLg: "0 12px 40px -8px rgba(0,0,0,0.10), 0 4px 16px -4px rgba(0,0,0,0.05)",
  shadowHover: "0 16px 48px -8px rgba(0,0,0,0.12), 0 6px 20px -4px rgba(0,0,0,0.06)",
  fontMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
  fontDisplay: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

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
  const [editBuyPrice, setEditBuyPrice] = useState((holding.effective_cost ?? holding.buy_price).toString());
  const [editQuantity, setEditQuantity] = useState((holding.effective_qty ?? holding.quantity).toString());
  const [editBuyDate, setEditBuyDate] = useState(holding.buy_date);
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditBuyPrice((holding.effective_cost ?? holding.buy_price).toString());
    setEditQuantity((holding.effective_qty ?? holding.quantity).toString());
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
  const pnlColor = isPositive ? C.success : C.danger;

  const dailyPnl = holding.daily_pnl ?? 0;
  const dailyPnlPct = holding.daily_pnl_pct ?? 0;
  const dayTradePnl = holding.day_trade_pnl ?? 0;
  const totalDailyPnl = dailyPnl + dayTradePnl;
  const isDailyPositive = totalDailyPnl >= 0;
  const dailyColor = isDailyPositive ? C.success : C.danger;

  const totalPnl = holding.total_pnl ?? holding.pnl;
  const isTotalPositive = totalPnl >= 0;
  const totalColor = isTotalPositive ? C.success : C.danger;

  const marketInfo = detectMarket(holding.ticker);
  const badge = MARKET_BADGE[marketInfo.market];

  return (
    <>
    <style>{`
      .stock-card-modern {
        position: relative;
        overflow: hidden;
        border-radius: 14px;
        border: 1px solid ${C.borderLight};
        background: ${C.bgSurface};
        box-shadow: ${C.shadowSm};
        transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
                    box-shadow 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                    border-color 0.3s ease;
        cursor: default;
      }
      .stock-card-modern:hover {
        transform: translateY(-3px);
        box-shadow: ${C.shadowHover};
        border-color: ${C.borderDefault};
      }
      .stock-card-modern:active {
        transform: translateY(-1px) scale(0.995);
        transition: transform 0.1s ease;
      }
      /* Action buttons appear on hover */
      .stock-card-modern .card-action-btn {
        opacity: 0;
        transform: translateX(4px);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .stock-card-modern:hover .card-action-btn {
        opacity: 1;
        transform: translateX(0);
      }
      /* Metric cell hover */
      .metric-cell-modern {
        transition: background 0.2s ease, transform 0.15s ease;
        border-radius: 8px;
      }
      .metric-cell-modern:hover {
        background: ${C.bgMuted};
        transform: scale(1.02);
      }
      /* Top border glow on hover */
      .stock-card-modern::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
        pointer-events: none;
        z-index: 1;
      }
    `}</style>
    <div
      ref={cardRef}
      className="stock-card stock-card-modern"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 22px 0 22px",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: C.textPrimary,
              fontFamily: C.fontMono,
              letterSpacing: "0.02em",
            }}
          >
            {holding.ticker}
          </span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "2px 7px",
              borderRadius: 5,
              background: badge.bg,
              color: badge.color,
              lineHeight: "14px",
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            {badge.label}
          </span>
          <span
            style={{
              fontSize: 12,
              color: C.textTertiary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: C.fontDisplay,
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
                color: C.textMuted,
                cursor: "pointer",
                padding: 6,
                borderRadius: 7,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = C.primary;
                e.currentTarget.style.background = C.primaryLight;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = C.textMuted;
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
                  color: C.success,
                  cursor: "pointer",
                  padding: 6,
                  borderRadius: 7,
                  display: "flex",
                  alignItems: "center",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.successLight; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => setEditing(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: C.textMuted,
                  cursor: "pointer",
                  padding: 6,
                  borderRadius: 7,
                  display: "flex",
                  alignItems: "center",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.bgMuted; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
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
                  color: C.textMuted,
                  cursor: "pointer",
                  padding: 6,
                  borderRadius: 7,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = C.primary;
                  e.currentTarget.style.background = C.primaryLight;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = C.textMuted;
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
                    marginTop: 6,
                    background: C.bgSurface,
                    border: `1px solid ${C.borderDefault}`,
                    borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
                    minWidth: 130,
                    zIndex: 50,
                    overflow: "hidden",
                    animation: "fadeSlideIn 0.2s ease",
                  }}
                >
                  <style>{`
                    @keyframes fadeSlideIn {
                      from { opacity: 0; transform: translateY(-4px) scale(0.97); }
                      to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                  `}</style>
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
                      padding: "10px 14px",
                      border: "none",
                      background: "none",
                      color: C.danger,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      textAlign: "left",
                      transition: "background 0.15s",
                      fontFamily: C.fontDisplay,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.dangerLight; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
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
                      padding: "10px 14px",
                      border: "none",
                      borderTop: `1px solid ${C.borderLight}`,
                      background: "none",
                      color: "#d97706",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      textAlign: "left",
                      transition: "background 0.15s",
                      fontFamily: C.fontDisplay,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(217, 119, 6, 0.06)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
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
            padding: "14px 22px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
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
            gap: 4,
            padding: "14px 22px 16px 22px",
            marginTop: 2,
          }}
        >
          <MetricCell
            label={t("stocks.metric.buy")}
            value={`${marketInfo.currencySymbol}${(holding.effective_cost ?? holding.buy_price).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
          />
          <MetricCell
            label={t("stocks.metric.now")}
            value={`${marketInfo.currencySymbol}${holding.current_price.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
            highlight
          />
          <MetricCell
            label={t("stocks.metric.qty")}
            value={(holding.effective_qty ?? holding.quantity).toString()}
          />
          <MetricCell
            label={t("stocks.metric.value")}
            value={`${marketInfo.currencySymbol}${(holding.current_price * (holding.effective_qty ?? holding.quantity)).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
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
      className="metric-cell-modern"
      style={{
        textAlign: "center",
        padding: "6px 6px",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: C.textTertiary,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 5,
          fontWeight: 600,
          fontFamily: C.fontDisplay,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: highlight ? 700 : 600,
          color: color || (highlight ? C.textPrimary : C.textSecondary),
          fontFamily: C.fontMono,
          lineHeight: 1.3,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontVariantNumeric: "tabular-nums",
          transition: "color 0.2s ease",
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
      <div
        style={{
          fontSize: 10,
          color: C.textTertiary,
          marginBottom: 5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontFamily: C.fontDisplay,
        }}
      >
        {label}
      </div>
      <div style={{ position: "relative" }}>
        {prefix && (
          <span
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 12,
              color: C.textMuted,
              fontFamily: C.fontMono,
            }}
          >
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 10px",
            paddingLeft: prefix ? `${prefix.length * 8 + 14}px` : "10px",
            fontSize: 13,
            fontFamily: C.fontMono,
            border: `1.5px solid ${C.borderDefault}`,
            borderRadius: 8,
            background: C.bgSurface,
            color: C.textPrimary,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = C.primary;
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(8, 145, 178, 0.12)";
            e.currentTarget.style.background = "#fff";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = C.borderDefault;
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.background = C.bgSurface;
          }}
        />
      </div>
    </div>
  );
}
