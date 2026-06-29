/**
 * StockPortfolio — manage and track stock holdings.
 * Displays a list of holdings with buy/current prices, P&L, and a summary bar.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  addStockHolding,
  deleteStockHolding,
  updateStockHolding,
  refreshStockPricesBackground,
  fetchStockHoldings,
  syncStockPnl,
  searchStocks,
  fetchExchangeRates,
  closeStockHolding,
  fetchClosedStockHoldings,
} from "../lib/api";
import type { StockSearchResult } from "../lib/api";
import type { StockHolding } from "../lib/types";
import { notifySavingsGoalsUpdated } from "../lib/savingsMetrics";
import { StockCard } from "../components/stock/StockCard";
import { FeeSettingsModal } from "../components/stock/FeeSettingsModal";
import { useTranslation } from "../i18n";
import {
  Plus,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  BarChart3,
  X,
  Clock,
  Loader2,
  Settings,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react";
import { detectMarket } from "../lib/market";

function convertToCNY(amount: number, currency: string, rates: Record<string, number>): number {
  if (currency === "CNY") return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount;
}

export default function StockPortfolio() {
  const { t } = useTranslation();
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [closedHoldings, setClosedHoldings] = useState<StockHolding[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closeSellPrice, setCloseSellPrice] = useState("");
  const [closeSellDate, setCloseSellDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showFeeSettings, setShowFeeSettings] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(() => {
    return localStorage.getItem("stock_auto_refresh") === "true";
  });
  const [lastRefreshTime, setLastRefreshTime] = useState<string | null>(null);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval>>();
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});

  // Form state
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [buyDate, setBuyDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Autocomplete search
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchField, setSearchField] = useState<"ticker" | "name" | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStockHoldings();
      setHoldings(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      // Trigger background price refresh (non-blocking)
      refreshStockPricesBackground();
    }
  }, []);

  const loadClosed = useCallback(async () => {
    try {
      const closed = await fetchClosedStockHoldings();
      setClosedHoldings(closed);
    } catch {
      // silently fail
    }
  }, []);

  // Page load: data is fetched via the load() effect below;
  // background price refresh is triggered at the end of load().



  useEffect(() => {
    load();
    loadClosed();
    fetchExchangeRates().then(setExchangeRates).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const dropdowns = document.querySelectorAll("[data-autocomplete-dropdown]");
      let inside = false;
      dropdowns.forEach((d) => {
        if (d.contains(target)) inside = true;
      });
      if (!inside) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = useCallback((query: string, field: "ticker" | "name") => {
    clearTimeout(searchTimerRef.current);
    if (!query.trim() || query.trim().length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setSearchField(field);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchStocks(query.trim());
        setSearchResults(results);
        setShowDropdown(results.length > 0);
      } catch {
        setSearchResults([]);
      }
    }, 300);
  }, []);

  const handleSelectResult = (result: StockSearchResult) => {
    setTicker(result.symbol);
    setName(result.name);
    setShowDropdown(false);
    setSearchResults([]);
  };

  const syncHoldingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncSavingsFromHoldings = useCallback(() => {
    if (syncHoldingsTimerRef.current) clearTimeout(syncHoldingsTimerRef.current);
    syncHoldingsTimerRef.current = setTimeout(async () => {
      try {
        await syncStockPnl();
        notifySavingsGoalsUpdated();
      } catch {
        // silent
      }
    }, 1000);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Fire background refresh, then re-fetch after short delay
      refreshStockPricesBackground();
      setTimeout(async () => {
        const data = await fetchStockHoldings();
        setHoldings(data);
        setLastRefreshTime(new Date().toLocaleTimeString());
        notifySavingsGoalsUpdated();
      }, 3000);
    } catch {
      // silently fail
    } finally {
      setRefreshing(false);
    }
  };

  // Check if any market is currently open (A-share: 9:30-15:00, US: 21:30-04:00 HKT)
  const isMarketOpen = useCallback(() => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeMinutes = hour * 60 + minute;
    // A-share: 9:30 (570) to 15:00 (900)
    const aShareOpen = timeMinutes >= 570 && timeMinutes <= 900;
    // US market: 21:30 (1290) to 04:00 (240 next day)
    const usOpen = timeMinutes >= 1290 || timeMinutes <= 240;
    return aShareOpen || usOpen;
  }, []);

  // Auto-refresh toggle
  useEffect(() => {
    if (autoRefresh && isMarketOpen()) {
      autoRefreshTimerRef.current = setInterval(() => {
        refreshStockPricesBackground();
        // Re-fetch after background refresh completes
        setTimeout(async () => {
          const data = await fetchStockHoldings();
          setHoldings(data);
          setLastRefreshTime(new Date().toLocaleTimeString());
        }, 3000);
      }, 60000); // 60 seconds (background refresh, non-blocking)
    }
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefresh, isMarketOpen]);

  const handleAdd = async () => {
    if (!ticker.trim() || !buyPrice || !quantity) return;
    try {
      const newHolding = await addStockHolding(
        ticker.trim(),
        name.trim(),
        parseFloat(buyPrice),
        parseFloat(quantity),
        buyDate
      );
      setHoldings((prev) => [newHolding, ...prev]);
      await syncSavingsFromHoldings();
      setShowForm(false);
      setTicker("");
      setName("");
      setBuyPrice("");
      setQuantity("");
      setBuyDate(new Date().toISOString().split("T")[0]);
    } catch {
      // silently fail
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t("stocks.confirmDelete"))) return;
    try {
      await deleteStockHolding(id);
      setHoldings((prev) => prev.filter((h) => h.id !== id));
      await syncSavingsFromHoldings();
    } catch {
      // silently fail
    }
  };

  const handleClosePosition = (id: number) => {
    const h = holdings.find((x) => x.id === id);
    if (!h) return;
    setClosingId(id);
    setCloseSellPrice(h.current_price.toString());
    setCloseSellDate(new Date().toISOString().split("T")[0]);
  };

  const confirmClosePosition = async () => {
    if (!closingId) return;
    try {
      await closeStockHolding(closingId, parseFloat(closeSellPrice), closeSellDate);
      setHoldings((prev) => prev.filter((h) => h.id !== closingId));
      setClosingId(null);
      await loadClosed();
      await syncSavingsFromHoldings();
    } catch {
      // silently fail
    }
  };

  const handleUpdate = async (id: number, data: { buy_price?: number; quantity?: number; buy_date?: string }) => {
    try {
      const updated = await updateStockHolding(id, data);
      setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, ...updated } : h)));
      syncSavingsFromHoldings();
    } catch {
      // silently fail
    }
  };

  // Summary calculations (convert to CNY for display)
  const totalCost = holdings.reduce((sum, h) => {
    const market = detectMarket(h.ticker);
    const cost = h.buy_price * h.quantity;
    return sum + convertToCNY(cost, market.currency, exchangeRates);
  }, 0);
  const totalValue = holdings.reduce((sum, h) => {
    const market = detectMarket(h.ticker);
    const value = h.current_price * h.quantity;
    return sum + convertToCNY(value, market.currency, exchangeRates);
  }, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const isPositive = totalPnl >= 0;
  const pnlColor = isPositive
    ? "var(--color-success, #16a34a)"
    : "var(--color-danger, #dc2626)";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px 40px 16px" }}>
      {/* Responsive CSS */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
        }
        .holdings-list {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }
        @media (max-width: 900px) {
          .summary-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .summary-item-label {
            font-size: 10px !important;
          }
          .summary-item-value {
            font-size: 13px !important;
          }
        }
        @media (max-width: 480px) {
          .summary-grid {
            grid-template-columns: 1fr 1fr !important;
          }
          .action-bar {
            flex-direction: column !important;
            gap: 10px !important;
          }
          .action-bar-left {
            justify-content: center !important;
          }
        }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 4,
          }}
        >
          <TrendingUp size={22} color="var(--color-primary)" />
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.01em",
            }}
          >
            {t("stocks.title")}
          </h1>
        </div>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-tertiary)",
            margin: 0,
            paddingLeft: 32,
          }}
        >
          {holdings.length > 0
            ? `${holdings.length} holding${holdings.length !== 1 ? "s" : ""} tracked`
            : t("stocks.empty")}
        </p>
      </div>

      {/* Action bar */}
      <div
        className="action-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {/* Left: refresh status */}
        <div
          className="action-bar-left"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {lastRefreshTime && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                color: "var(--text-tertiary)",
                transition: "opacity 0.3s",
              }}
            >
              {refreshing ? (
                <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Clock size={13} style={{ opacity: autoRefresh ? 0.6 : 1 }} />
              )}
              <span>{`上次刷新: ${lastRefreshTime}`}</span>
              {autoRefresh && !refreshing && (
                <span style={{ color: "var(--color-success, #16a34a)", fontSize: 10 }}>●</span>
              )}
            </div>
          )}
          {/* Auto-refresh toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--text-secondary)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <div
              onClick={() => {
                if (!autoRefresh && !isMarketOpen()) {
                  // Warn: market closed, auto-refresh won't fire
                }
                setAutoRefresh(!autoRefresh);
                localStorage.setItem("stock_auto_refresh", String(!autoRefresh));
              }}
              style={{
                width: 36,
                height: 20,
                borderRadius: 10,
                background: autoRefresh ? "var(--color-primary, #0891b2)" : "var(--border-default, #d6d3d1)",
                position: "relative",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: 2,
                  left: autoRefresh ? 18 : 2,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                }}
              />
            </div>
            <span>自动刷新</span>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleRefresh}
            disabled={holdings.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border-default, #d6d3d1)",
              background: "var(--bg-surface, #ffffff)",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: holdings.length === 0 ? "not-allowed" : "pointer",
              opacity: holdings.length === 0 ? 0.5 : 1,
              transition: "all 0.2s",
            }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: refreshing ? "spin 1s linear infinite" : "none",
                transition: "transform 0.3s",
              }}
            />
            {t("stocks.refresh")}
          </button>
          <button
            onClick={() => setShowFeeSettings(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border-default, #d6d3d1)",
              background: "var(--bg-surface, #ffffff)",
              color: "var(--text-secondary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            <Settings size={14} />
            {t("stocks.feeSettings.title")}
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background:
                "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(8, 145, 178, 0.25)",
              transition: "all 0.2s",
            }}
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? t("common.cancel") : t("stocks.add")}
          </button>
        </div>
      </div>

      {/* Summary bar — compact glassmorphism style */}
      {holdings.length > 0 && (
        <div
          style={{
            background: "var(--bg-surface, #ffffff)",
            border: "1px solid var(--border-light, #f5f5f4)",
            borderRadius: 14,
            marginBottom: 20,
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          }}
        >
          <div className="summary-grid">
            <SummaryItem
              icon={<Wallet size={16} color="var(--color-primary)" />}
              label={t("stocks.totalAssets")}
              value={`¥${totalValue.toLocaleString(undefined, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}`}
            />
            <SummaryItem
              icon={<PiggyBank size={16} color="var(--color-accent, #d97706)" />}
              label={t("stocks.cost")}
              value={`¥${totalCost.toLocaleString(undefined, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}`}
            />
            <SummaryItem
              icon={
                isPositive ? (
                  <TrendingUp size={16} color={pnlColor} />
                ) : (
                  <TrendingDown size={16} color={pnlColor} />
                )
              }
              label={t("stocks.totalPnl")}
              value={`${isPositive ? "+" : ""}¥${totalPnl.toLocaleString(undefined, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}`}
              color={pnlColor}
            />
            <SummaryItem
              icon={<BarChart3 size={16} color={pnlColor} />}
              label={t("stocks.pnlPct")}
              value={`${isPositive ? "+" : ""}${totalPnlPct.toFixed(3)}%`}
              color={pnlColor}
            />
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div
          style={{
            background: "var(--bg-surface, #ffffff)",
            border: "1px solid var(--border-light, #f5f5f4)",
            borderRadius: 14,
            padding: "20px 24px",
            marginBottom: 20,
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Plus size={14} />
            Add New Holding
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px 16px",
              marginBottom: 16,
              position: "relative",
            }}
          >
            {/* Ticker input with autocomplete */}
            <div style={{ position: "relative" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  marginBottom: 4,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {t("stocks.ticker")}
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value);
                  handleSearch(e.target.value, "ticker");
                }}
                placeholder={t("stocks.tickerPlaceholder")}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border-default, #d6d3d1)",
                  background: "var(--bg-page, #fafaf9)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor =
                    "var(--color-primary, #0891b2)";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 3px rgba(8,145,178,0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor =
                    "var(--border-default, #d6d3d1)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              {showDropdown &&
                searchField === "ticker" &&
                searchResults.length > 0 && (
                  <div
                    data-autocomplete-dropdown
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      background: "var(--bg-surface, #ffffff)",
                      border: "1px solid var(--border-default, #d6d3d1)",
                      borderRadius: 8,
                      maxHeight: 200,
                      overflowY: "auto",
                      zIndex: 100,
                      boxShadow: "var(--shadow-lg)",
                    }}
                  >
                    {searchResults.map((r) => (
                      <div
                        key={r.symbol}
                        onClick={() => handleSelectResult(r)}
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border-light, #f5f5f4)",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "var(--bg-page, #fafaf9)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {r.symbol}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                            marginTop: 1,
                          }}
                        >
                          {r.name} · {r.exchange}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            {/* Name input with autocomplete */}
            <div style={{ position: "relative" }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  marginBottom: 4,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {t("stocks.name")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  handleSearch(e.target.value, "name");
                }}
                placeholder={t("stocks.namePlaceholder")}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border-default, #d6d3d1)",
                  background: "var(--bg-page, #fafaf9)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor =
                    "var(--color-primary, #0891b2)";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 3px rgba(8,145,178,0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor =
                    "var(--border-default, #d6d3d1)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              {showDropdown &&
                searchField === "name" &&
                searchResults.length > 0 && (
                  <div
                    data-autocomplete-dropdown
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      background: "var(--bg-surface, #ffffff)",
                      border: "1px solid var(--border-default, #d6d3d1)",
                      borderRadius: 8,
                      maxHeight: 200,
                      overflowY: "auto",
                      zIndex: 100,
                      boxShadow: "var(--shadow-lg)",
                    }}
                  >
                    {searchResults.map((r) => (
                      <div
                        key={r.symbol}
                        onClick={() => handleSelectResult(r)}
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border-light, #f5f5f4)",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background =
                            "var(--bg-page, #fafaf9)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {r.symbol}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-tertiary)",
                            marginTop: 1,
                          }}
                        >
                          {r.name} · {r.exchange}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
            <FormField
              label={`${t("stocks.buyPrice")} (${detectMarket(ticker).currencySymbol})`}
              value={buyPrice}
              onChange={setBuyPrice}
              type="number"
              placeholder={detectMarket(ticker).currency}
            />
            <FormField
              label={t("stocks.quantity")}
              value={quantity}
              onChange={setQuantity}
              type="number"
            />
            <FormField
              label={t("stocks.buyDate")}
              value={buyDate}
              onChange={setBuyDate}
              type="date"
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              paddingTop: 12,
              borderTop: "1px solid var(--border-light, #f5f5f4)",
            }}
          >
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid var(--border-default, #d6d3d1)",
                background: "var(--bg-surface, #ffffff)",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleAdd}
              disabled={!ticker.trim() || !buyPrice || !quantity}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background:
                  "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  !ticker.trim() || !buyPrice || !quantity
                    ? "not-allowed"
                    : "pointer",
                opacity: !ticker.trim() || !buyPrice || !quantity ? 0.5 : 1,
                boxShadow:
                  !ticker.trim() || !buyPrice || !quantity
                    ? "none"
                    : "0 2px 8px rgba(8, 145, 178, 0.25)",
                transition: "all 0.2s",
              }}
            >
              {t("common.confirm")}
            </button>
          </div>
        </div>
      )}

      {/* Holdings list */}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          {t("common.loading")}
        </p>
      ) : holdings.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 24px",
            color: "var(--text-tertiary)",
          }}
        >
          <TrendingUp
            size={32}
            style={{ opacity: 0.3, marginBottom: 12 }}
          />
          <p style={{ fontSize: 14, margin: 0 }}>{t("stocks.empty")}</p>
        </div>
      ) : (
        <div className="holdings-list">
          {holdings.map((h) => (
            <StockCard key={h.id} holding={h} onDelete={handleDelete} onUpdate={handleUpdate} onTradesUpdated={load} onClosePosition={handleClosePosition} />
          ))}
        </div>
      )}

      {/* Close Position Modal */}
      {closingId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
          onClick={() => setClosingId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-surface, #ffffff)",
              borderRadius: 16,
              padding: "24px 28px",
              width: 380,
              maxWidth: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              style={{
                margin: "0 0 16px 0",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {t("stocks.confirmClose")}
            </h3>
            {(() => {
              const h = holdings.find((x) => x.id === closingId);
              if (!h) return null;
              const market = detectMarket(h.ticker);
              const pnl = (parseFloat(closeSellPrice) - h.buy_price) * h.quantity;
              const isProfit = pnl >= 0;
              return (
                <>
                  <div
                    style={{
                      padding: "12px 16px",
                      background: "var(--bg-page, #fafaf9)",
                      borderRadius: 10,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {h.ticker}
                      </span>
                      <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                        {h.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {t("stocks.quantity")}
                      </span>
                      <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                        {h.quantity}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {t("stocks.buyPrice")}
                      </span>
                      <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                        {market.currencySymbol}{h.buy_price.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        {t("stocks.realizedPnl")}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 600,
                          color: isProfit ? "var(--color-success, #16a34a)" : "var(--color-danger, #dc2626)",
                        }}
                      >
                        {isProfit ? "+" : ""}{market.currencySymbol}{pnl.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        marginBottom: 4,
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {t("stocks.sellPrice")}
                    </label>
                    <input
                      type="number"
                      value={closeSellPrice}
                      onChange={(e) => setCloseSellPrice(e.target.value)}
                      step="0.001"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border-default, #d6d3d1)",
                        background: "var(--bg-page, #fafaf9)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        fontFamily: "var(--font-mono)",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        marginBottom: 4,
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {t("stocks.sellDate")}
                    </label>
                    <input
                      type="date"
                      value={closeSellDate}
                      onChange={(e) => setCloseSellDate(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border-default, #d6d3d1)",
                        background: "var(--bg-page, #fafaf9)",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      margin: "0 0 16px 0",
                      lineHeight: 1.5,
                    }}
                  >
                    {t("stocks.closeHint")}
                  </p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => setClosingId(null)}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "1px solid var(--border-default, #d6d3d1)",
                        background: "var(--bg-surface, #ffffff)",
                        color: "var(--text-secondary)",
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      onClick={confirmClosePosition}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "none",
                        background: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(217, 119, 6, 0.25)",
                      }}
                    >
                      {t("stocks.confirmClose")}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Closed Positions Section */}
      {closedHoldings.length > 0 && (
        <div
          style={{
            marginTop: 24,
            background: "var(--bg-surface, #ffffff)",
            border: "1px solid var(--border-light, #f5f5f4)",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          }}
        >
          <button
            onClick={() => setShowClosed(!showClosed)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "14px 20px",
              border: "none",
              background: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
              fontSize: 14,
              fontWeight: 600,
              textAlign: "left",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-page, #fafaf9)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
            }}
          >
            <FileText size={16} color="var(--text-tertiary)" />
            {t("stocks.closedPositions")}
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-tertiary)",
                background: "var(--bg-page, #fafaf9)",
                padding: "2px 8px",
                borderRadius: 10,
              }}
            >
              {closedHoldings.length}
            </span>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
              {showClosed ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          </button>
          {showClosed && (
            <div style={{ padding: "0 20px 16px 20px" }}>
              {/* Summary */}
              {(() => {
                const totalRealized = closedHoldings.reduce((s, h) => s + ((h.realized_pnl as number) ?? ((h.sell_price - h.buy_price) * h.quantity)), 0);
                const isProfit = totalRealized >= 0;
                return (
                  <div
                    style={{
                      padding: "10px 14px",
                      background: "var(--bg-page, #fafaf9)",
                      borderRadius: 8,
                      marginBottom: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                      {t("stocks.totalRealized")}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: "var(--font-mono)",
                        color: isProfit ? "var(--color-success, #16a34a)" : "var(--color-danger, #dc2626)",
                      }}
                    >
                      {isProfit ? "+" : ""}¥{totalRealized.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                    </span>
                  </div>
                );
              })()}
              {/* Closed holdings list */}
              {closedHoldings.map((h) => {
                const market = detectMarket(h.ticker);
                const realizedPnl = (h.realized_pnl as number) ?? ((h.sell_price - h.buy_price) * h.quantity);
                const isProfit = realizedPnl >= 0;
                return (
                  <div
                    key={h.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--border-light, #f5f5f4)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-page, #fafaf9)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          padding: "2px 5px",
                          borderRadius: 4,
                          background: "var(--bg-page, #f5f5f4)",
                          color: "var(--text-tertiary)",
                          flexShrink: 0,
                        }}
                      >
                        CLOSED
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                        {h.ticker}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {h.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 1 }}>
                          {market.currencySymbol}{h.buy_price.toFixed(3)} → {market.currencySymbol}{h.sell_price.toFixed(3)}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                          ×{h.quantity}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                            color: isProfit ? "var(--color-success, #16a34a)" : "var(--color-danger, #dc2626)",
                          }}
                        >
                          {isProfit ? "+" : ""}{market.currencySymbol}{realizedPnl.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </div>
                        {h.sell_date && (
                          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 1 }}>
                            {h.sell_date}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <FeeSettingsModal open={showFeeSettings} onClose={() => setShowFeeSettings(false)} />
    </div>
  );
}

// ── Helper sub-components ─────────────────────────────────────

function SummaryItem({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--bg-surface, #ffffff)",
        transition: "background 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-page, #fafaf9)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--bg-surface, #ffffff)";
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background:
            color && color.includes("success")
              ? "rgba(22, 163, 74, 0.06)"
              : color && color.includes("danger")
                ? "rgba(220, 38, 38, 0.06)"
                : "rgba(8, 145, 178, 0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          className="summary-item-label"
          style={{
            fontSize: 10,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginBottom: 1,
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        <div
          className="summary-item-value"
          style={{
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            color: color || "var(--text-primary)",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 11,
          color: "var(--text-tertiary)",
          marginBottom: 4,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "9px 12px",
          borderRadius: 8,
          border: "1px solid var(--border-default, #d6d3d1)",
          background: "var(--bg-page, #fafaf9)",
          color: "var(--text-primary)",
          fontSize: 13,
          fontFamily: type === "number" ? "var(--font-mono)" : "inherit",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor =
            "var(--color-primary, #0891b2)";
          e.currentTarget.style.boxShadow =
            "0 0 0 3px rgba(8,145,178,0.1)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor =
            "var(--border-default, #d6d3d1)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </div>
  );
}
