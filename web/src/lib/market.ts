/**
 * Detect market and currency from stock ticker symbol.
 *
 * Rules:
 *   - A-shares (Shanghai): starts with 6 (600xxx, 601xxx, 603xxx, 688xxx)
 *   - A-shares (Shenzhen): starts with 0 or 3 (000xxx, 001xxx, 002xxx, 300xxx)
 *   - Hong Kong: 5-digit number or ends with .HK
 *   - US stocks: everything else (starts with letters)
 */

export interface MarketInfo {
  market: "CN" | "HK" | "US";
  currency: string;
  currencySymbol: string;
}

export const MARKET_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  CN: { label: "A", bg: "rgba(239, 68, 68, 0.1)", color: "#dc2626" },
  HK: { label: "HK", bg: "rgba(245, 158, 11, 0.1)", color: "#d97706" },
  US: { label: "US", bg: "rgba(59, 130, 246, 0.1)", color: "#2563eb" },
};

export function detectMarket(ticker: string): MarketInfo {
  const t = ticker.trim().toUpperCase();

  // Hong Kong: ends with .HK or is a 5-digit number
  if (/\.HK$/i.test(t) || /^\d{5}$/.test(t)) {
    return { market: "HK", currency: "HKD", currencySymbol: "HK$" };
  }

  // A-shares: starts with digits
  if (/^\d/.test(t)) {
    return { market: "CN", currency: "CNY", currencySymbol: "¥" };
  }

  // Default: US stocks (starts with letters)
  return { market: "US", currency: "USD", currencySymbol: "$" };
}
