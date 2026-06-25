/**
 * StockCard — single holding card with buy price, current price, and P&L.
 * Includes market badge, compact layout, P&L indicator, and smooth hover.
 */

import { Trash2 } from "lucide-react";
import type { StockHolding } from "../../lib/types";
import { detectMarket } from "../../lib/market";

interface StockCardProps {
  holding: StockHolding;
  onDelete: (id: number) => void;
}

// Market badge config
const MARKET_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  CN: { label: "A", bg: "rgba(220, 38, 38, 0.08)", color: "#dc2626" },
  HK: { label: "HK", bg: "rgba(217, 119, 6, 0.08)", color: "#d97706" },
  US: { label: "US", bg: "rgba(8, 145, 178, 0.08)", color: "#0891b2" },
};

export function StockCard({ holding, onDelete }: StockCardProps) {
  const isPositive = holding.pnl >= 0;
  const pnlColor = isPositive
    ? "var(--color-success, #16a34a)"
    : "var(--color-danger, #dc2626)";

  const marketInfo = detectMarket(holding.ticker);
  const badge = MARKET_BADGE[marketInfo.market];

  return (
    <div
      style={{
        background: "var(--bg-surface, #ffffff)",
        border: "1px solid var(--border-light, #f5f5f4)",
        borderRadius: 12,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        transition: "all 0.2s ease",
        boxShadow: "var(--shadow-xs)",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default, #d6d3d1)";
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-light, #f5f5f4)";
        e.currentTarget.style.boxShadow = "var(--shadow-xs)";
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
          opacity: 0.6,
          borderRadius: "12px 0 0 12px",
        }}
      />

      {/* Left: ticker + name + market badge */}
      <div style={{ flex: "0 0 160px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
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
          {/* Market badge */}
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
            }}
          >
            {badge.label}
          </span>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {holding.name}
        </div>
      </div>

      {/* Center: price info */}
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 20,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <PriceBlock
          label="Buy"
          value={holding.buy_price}
          currency={marketInfo.currencySymbol}
        />
        <PriceBlock
          label="Now"
          value={holding.current_price}
          currency={marketInfo.currencySymbol}
          highlight
        />
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 2,
            }}
          >
            Qty
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {holding.quantity}
          </div>
        </div>
      </div>

      {/* Right: P&L, rate, and holding value */}
      <div style={{ flex: "0 0 180px", textAlign: "right" }}>
        {/* Holding value */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
            持仓金额
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
            {marketInfo.currencySymbol}{(holding.current_price * holding.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        {/* P&L amount + rate */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
              收益金额
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: pnlColor }}>
              {isPositive ? "+" : ""}{marketInfo.currencySymbol}{holding.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
              收益率
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color: pnlColor }}>
              {isPositive ? "+" : ""}{holding.pnl_pct.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={() => onDelete(holding.id)}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted, #a8a29e)",
          cursor: "pointer",
          padding: 6,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s",
          flexShrink: 0,
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
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function PriceBlock({
  label,
  value,
  currency,
  highlight,
}: {
  label: string;
  value: number;
  currency?: string;
  highlight?: boolean;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: highlight
            ? "var(--text-primary)"
            : "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {currency && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              marginRight: 2,
              opacity: 0.6,
            }}
          >
            {currency}
          </span>
        )}
        {value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </div>
    </div>
  );
}
