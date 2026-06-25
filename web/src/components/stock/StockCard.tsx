/**
 * StockCard — single holding card with buy price, current price, and P&L.
 */

import { Trash2 } from "lucide-react";
import type { StockHolding } from "../../lib/types";
import { detectMarket } from "../../lib/market";

interface StockCardProps {
  holding: StockHolding;
  onDelete: (id: number) => void;
}

export function StockCard({ holding, onDelete }: StockCardProps) {
  const isPositive = holding.pnl >= 0;
  const pnlColor = isPositive ? "var(--color-success, #22c55e)" : "var(--color-danger, #ef4444)";

  return (
    <div
      style={{
        background: "var(--bg-card, rgba(255,255,255,0.03))",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        borderRadius: 12,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        transition: "border-color 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
      }}
    >
      {/* Left: ticker + name */}
      <div style={{ flex: "0 0 140px", minWidth: 0 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--text-primary)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.02em",
          }}
        >
          {holding.ticker}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            marginTop: 2,
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
          gap: 24,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <PriceBlock label="Buy" value={holding.buy_price} currency={detectMarket(holding.ticker).currencySymbol} />
        <PriceBlock label="Now" value={holding.current_price} currency={detectMarket(holding.ticker).currencySymbol} />
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

      {/* Right: P&L */}
      <div
        style={{
          flex: "0 0 120px",
          textAlign: "right",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            color: pnlColor,
            lineHeight: 1.2,
          }}
        >
          {isPositive ? "+" : ""}
          {detectMarket(holding.ticker).currencySymbol}{holding.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            color: pnlColor,
            marginTop: 2,
          }}
        >
          {isPositive ? "+" : ""}
          {holding.pnl_pct.toFixed(2)}%
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={() => onDelete(holding.id)}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-tertiary)",
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
          e.currentTarget.style.color = "var(--color-danger, #ef4444)";
          e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-tertiary)";
          e.currentTarget.style.background = "none";
        }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function PriceBlock({ label, value, currency }: { label: string; value: number; currency?: string }) {
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
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {currency && <span style={{ fontSize: 11, fontWeight: 500, marginRight: 2, opacity: 0.7 }}>{currency}</span>}
        {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
