/**
 * StockCard — single holding card with buy price, current price, and P&L.
 * Compact grid layout with responsive design, market badge, and P&L indicator.
 * Supports inline editing of buy price, quantity, and buy date.
 */

import { useState } from "react";
import { Trash2, Pencil, Check, X } from "lucide-react";
import type { StockHolding } from "../../lib/types";
import { detectMarket } from "../../lib/market";
import { useTranslation } from "../../i18n";
import { DayTradePanel } from "./DayTradePanel";

interface StockCardProps {
  holding: StockHolding;
  onDelete: (id: number) => void;
  onUpdate: (id: number, data: { buy_price?: number; quantity?: number; buy_date?: string }) => void;
  onTradesUpdated: () => void;
}

// Market badge config
const MARKET_BADGE: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  CN: { label: "A", bg: "rgba(220, 38, 38, 0.08)", color: "#dc2626" },
  HK: { label: "HK", bg: "rgba(217, 119, 6, 0.08)", color: "#d97706" },
  US: { label: "US", bg: "rgba(8, 145, 178, 0.08)", color: "#0891b2" },
};

export function StockCard({ holding, onDelete, onUpdate, onTradesUpdated }: StockCardProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editBuyPrice, setEditBuyPrice] = useState(holding.buy_price.toString());
  const [editQuantity, setEditQuantity] = useState(holding.quantity.toString());
  const [editBuyDate, setEditBuyDate] = useState(holding.buy_date);

  const isPositive = holding.pnl >= 0;
  const pnlColor = isPositive
    ? "var(--color-success, #16a34a)"
    : "var(--color-danger, #dc2626)";

  const dailyPnl = holding.daily_pnl ?? 0;
  const dailyPnlPct = holding.daily_pnl_pct ?? 0;
  const isDailyPositive = dailyPnl >= 0;
  const dailyColor = isDailyPositive
    ? "var(--color-success, #16a34a)"
    : "var(--color-danger, #dc2626)";

  // Total P&L = holding P&L + day trade P&L
  const totalPnl = holding.total_pnl ?? holding.pnl;
  const dayTradePnl = holding.day_trade_pnl ?? 0;
  const isTotalPositive = totalPnl >= 0;
  const totalColor = isTotalPositive
    ? "var(--color-success, #16a34a)"
    : "var(--color-danger, #dc2626)";

  const marketInfo = detectMarket(holding.ticker);
  const badge = MARKET_BADGE[marketInfo.market];

  return (
    <div
      className="stock-card"
      style={{
        background: "var(--bg-surface, #ffffff)",
        border: "1px solid var(--border-light, #f5f5f4)",
        borderRadius: 12,
        position: "relative",
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default, #d6d3d1)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.03)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-light, #f5f5f4)";
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* P&L indicator bar on the left edge */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: pnlColor,
          opacity: 0.5,
          borderRadius: "12px 0 0 12px",
        }}
      />

      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px 0 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontSize: 15,
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
              letterSpacing: "0.04em",
              padding: "1px 5px",
              borderRadius: 4,
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
                onClick={() => {
                  setEditing(false);
                  setEditBuyPrice(holding.buy_price.toString());
                  setEditQuantity(holding.quantity.toString());
                  setEditBuyDate(holding.buy_date);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted, #a8a29e)",
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
          <button
            onClick={() => onDelete(holding.id)}
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
              e.currentTarget.style.color = "var(--color-danger, #dc2626)";
              e.currentTarget.style.background = "rgba(220, 38, 38, 0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted, #a8a29e)";
              e.currentTarget.style.background = "none";
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Edit form or metrics grid */}
      {editing ? (
        <div style={{ padding: "10px 18px 14px 18px", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <EditField
            label={t("stocks.buyPrice")}
            value={editBuyPrice}
            onChange={setEditBuyPrice}
            prefix={marketInfo.currencySymbol}
          />
          <EditField
            label={t("stocks.quantity")}
            value={editQuantity}
            onChange={setEditQuantity}
          />
          <EditField
            label={t("stocks.buyDate")}
            value={editBuyDate}
            onChange={setEditBuyDate}
            type="date"
          />
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "0",
            padding: "10px 18px 14px 18px",
            borderTop: "1px solid var(--border-light, #f5f5f4)",
            marginTop: 10,
          }}
        >
          <MetricCell
            label={t("stocks.metric.buy")}
            value={`${marketInfo.currencySymbol}${holding.buy_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
          <MetricCell
            label={t("stocks.metric.now")}
            value={`${marketInfo.currencySymbol}${holding.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            highlight
          />
          <MetricCell label={t("stocks.metric.qty")} value={holding.quantity.toString()} />
          <MetricCell
            label={t("stocks.metric.value")}
            value={`${marketInfo.currencySymbol}${(holding.current_price * holding.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          />
          <MetricCell
            label={t("stocks.metric.pnl")}
            value={`${isTotalPositive ? "+" : ""}${marketInfo.currencySymbol}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            color={totalColor}
          />
          <MetricCell
            label={t("stocks.metric.rate")}
            value={`${isPositive ? "+" : ""}${holding.pnl_pct.toFixed(2)}%`}
            color={pnlColor}
          />
          <MetricCell
            label={t("stocks.metric.daily")}
            value={`${isDailyPositive ? "+" : ""}${marketInfo.currencySymbol}${dailyPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            color={dailyColor}
          />
        </div>
      )}

      {/* Day Trade Panel */}
      <DayTradePanel
        ticker={holding.ticker}
        currencySymbol={marketInfo.currencySymbol}
        onTradesUpdated={onTradesUpdated}
      />
    </div>
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
        padding: "2px 4px",
        borderRight: "1px solid var(--border-light, #f5f5f4)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 3,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
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
    <div style={{ flex: "1 1 120px" }}>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 4,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div style={{ position: "relative" }}>
        {prefix && (
          <span
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 12,
              color: "var(--text-muted)",
              pointerEvents: "none",
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
            padding: prefix ? "6px 8px 6px 22px" : "6px 8px",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            border: "1px solid var(--border-default, #d6d3d1)",
            borderRadius: 6,
            background: "var(--bg-surface, #ffffff)",
            color: "var(--text-primary)",
            outline: "none",
            transition: "border-color 0.2s",
            boxSizing: "border-box",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-primary, #0891b2)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default, #d6d3d1)";
          }}
        />
      </div>
    </div>
  );
}
