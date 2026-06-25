/**
 * StockCard — single holding card with buy price, current price, and P&L.
 * Compact grid layout with responsive design, market badge, and P&L indicator.
 */

import { Trash2 } from "lucide-react";
import type { StockHolding } from "../../lib/types";
import { detectMarket } from "../../lib/market";
import { useTranslation } from "../../i18n";

interface StockCardProps {
  holding: StockHolding;
  onDelete: (id: number) => void;
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

export function StockCard({ holding, onDelete }: StockCardProps) {
  const { t } = useTranslation();
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
          <Trash2 size={14} />
        </button>
      </div>

      {/* Metrics grid */}
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
          value={`${isPositive ? "+" : ""}${marketInfo.currencySymbol}${holding.pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          color={pnlColor}
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
