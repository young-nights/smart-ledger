/**
 * StockPortfolio — manage and track stock holdings.
 * Displays a list of holdings with buy/current prices, P&L, and a summary bar.
 * Modernized UI: staggered animations, multi-layer shadows, soft colors, responsive.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  addStockHolding,
  deleteStockHolding,
  updateStockHolding,
  refreshStockPricesRealtime,
  refreshStockPricesBackground,
  fetchStockHoldings,
  syncStockPnl,
  searchStocks,
  fetchExchangeRates,
  closeStockHolding,
  fetchClosedStockHoldings,
  partialSellStock,
  fetchPositionSummary,
  addPositionCurrency,
  updatePositionCurrency,
  deletePositionCurrency,
  addStockTransfer,
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

/* ─── Color palette ─── */
const C = {
  bgPage: "#f8fafb",
  bgSurface: "#ffffff",
  bgHover: "#f1f5f9",
  bgMuted: "#f8fafc",
  borderLight: "#e8ecf0",
  borderDefault: "#d1d9e0",
  textPrimary: "#1a2332",
  textSecondary: "#4a5568",
  textTertiary: "#8896a6",
  textMuted: "#a0aec0",
  primary: "#0891b2",
  primaryHover: "#0e7490",
  primaryLight: "rgba(8, 145, 178, 0.08)",
  success: "#059669",
  successLight: "rgba(5, 150, 105, 0.08)",
  danger: "#dc2626",
  dangerLight: "rgba(220, 38, 38, 0.06)",
  accent: "#d97706",
  accentLight: "rgba(217, 119, 6, 0.08)",
  shadowSm: "0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.03)",
  shadowMd: "0 2px 8px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
  shadowLg: "0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
  shadowXl: "0 16px 48px rgba(0,0,0,0.10), 0 4px 16px rgba(0,0,0,0.06)",
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
  fontMono: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, monospace",
  fontDisplay: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

function convertToCNY(amount: number, currency: string, rates: Record<string, number>): number {
  if (currency === "CNY") return amount;
  const rate = rates[currency];
  return rate ? amount * rate : amount;
}

export default function StockPortfolio() {
  const { t } = useTranslation();
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [closedHoldings, setClosedHoldings] = useState<StockHolding[]>([]);
  const [positionSummary, setPositionSummary] = useState<{
    total_position_amount: number;
    currencies: Array<{ id: number; currency: string; amount: number }>;
    invested_amount: number;
    cash_balance: number;
    current_value: number;
    unrealized_pnl: number;
    realized_pnl: number;
    total_t_pnl: number;
    total_pnl: number;
    transfer_in: number;
    transfer_out: number;
    loss_amount: number;
  } | null>(null);
  const [editingField, setEditingField] = useState<'total_position' | 'transfer' | null>(null);
  const [positionCurrencies, setPositionCurrencies] = useState<Array<{ id: number; currency: string; amount: number }>>([]);
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newAmount, setNewAmount] = useState('');
  const [showInfoTip, setShowInfoTip] = useState(false);
  const [transferType, setTransferType] = useState<'in' | 'out'>('in');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [showClosed, setShowClosed] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closeSellPrice, setCloseSellPrice] = useState("");
  const [closeSellDate, setCloseSellDate] = useState(new Date().toISOString().split("T")[0]);
  const [partialSellId, setPartialSellId] = useState<number | null>(null);
  const [partialSellPrice, setPartialSellPrice] = useState("");
  const [partialSellQty, setPartialSellQty] = useState("");
  const [partialSellDate, setPartialSellDate] = useState(new Date().toISOString().split("T")[0]);
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

  const loadPositionSummary = useCallback(async () => {
    try {
      const summary = await fetchPositionSummary();
      setPositionSummary(summary);
      setPositionCurrencies(summary.currencies || []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    load();
    loadClosed();
    loadPositionSummary();
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
      const data = await refreshStockPricesRealtime();
      setHoldings(data);
      setLastRefreshTime(new Date().toLocaleTimeString());
      notifySavingsGoalsUpdated();
    } catch {
      // silently fail
    } finally {
      setRefreshing(false);
    }
  };

  const isMarketOpen = useCallback(() => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeMinutes = hour * 60 + minute;
    const aShareOpen = timeMinutes >= 570 && timeMinutes <= 900;
    const usOpen = timeMinutes >= 1290 || timeMinutes <= 240;
    return aShareOpen || usOpen;
  }, []);

  // Auto-refresh toggle
  useEffect(() => {
    if (autoRefresh && isMarketOpen()) {
      autoRefreshTimerRef.current = setInterval(async () => {
        try {
          const data = await refreshStockPricesRealtime();
          setHoldings(data);
          setLastRefreshTime(new Date().toLocaleTimeString());
        } catch {
          // silently fail
        }
      }, 60000);
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

  const handlePartialSell = (id: number) => {
    const h = holdings.find((x) => x.id === id);
    if (!h) return;
    setPartialSellId(id);
    setPartialSellPrice(h.current_price.toString());
    setPartialSellQty("");
    setPartialSellDate(new Date().toISOString().split("T")[0]);
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

  const confirmPartialSell = async () => {
    if (!partialSellId) return;
    try {
      const qty = parseFloat(partialSellQty);
      if (qty <= 0) return;
      await partialSellStock(partialSellId, parseFloat(partialSellPrice), qty, partialSellDate);
      // Reload holdings to get updated quantity
      const data = await fetchStockHoldings();
      setHoldings(data);
      setPartialSellId(null);
      await syncSavingsFromHoldings();
    } catch {
      // silently fail
    }
  };

  const handleUpdate = async (id: number, data: { buy_price?: number; quantity?: number; buy_date?: string; user_cost?: number; user_qty?: number }) => {
    try {
      const updated = await updateStockHolding(id, data);
      setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, ...updated } : h)));
      syncSavingsFromHoldings();
    } catch {
      // silently fail
    }
  };

  // Summary calculations
  const totalCost = holdings.reduce((sum, h) => {
    const market = detectMarket(h.ticker);
    const cost = h.cost ?? ((h.effective_cost ?? h.buy_price) * (h.effective_qty ?? h.quantity));
    return sum + convertToCNY(cost, market.currency, exchangeRates);
  }, 0);
  const totalValue = holdings.reduce((sum, h) => {
    const market = detectMarket(h.ticker);
    const value = h.value ?? (h.current_price * (h.effective_qty ?? h.quantity));
    return sum + convertToCNY(value, market.currency, exchangeRates);
  }, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const isPositive = totalPnl >= 0;
  const pnlColor = isPositive ? C.success : C.danger;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px 48px 16px" }}>
      {/* Global styles */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 800px; }
        }
        .sp-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
        }
        .sp-holdings-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .sp-card-entrance {
          animation: fadeSlideIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .sp-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 18px;
          border-radius: ${C.radiusSm}px;
          border: none;
          background: linear-gradient(135deg, ${C.primary} 0%, ${C.primaryHover} 100%);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(8, 145, 178, 0.2);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          font-family: ${C.fontDisplay};
        }
        .sp-btn-primary:hover {
          box-shadow: 0 4px 16px rgba(8, 145, 178, 0.3);
          transform: translateY(-1px);
        }
        .sp-btn-primary:active {
          transform: translateY(0);
          box-shadow: 0 1px 4px rgba(8, 145, 178, 0.2);
        }
        .sp-btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .sp-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          border-radius: ${C.radiusSm}px;
          border: 1px solid ${C.borderDefault};
          background: ${C.bgSurface};
          color: ${C.textSecondary};
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          font-family: ${C.fontDisplay};
        }
        .sp-btn-ghost:hover {
          background: ${C.bgHover};
          border-color: ${C.borderDefault};
          box-shadow: ${C.shadowSm};
        }
        .sp-btn-ghost:active {
          transform: scale(0.98);
        }
        .sp-btn-ghost:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
        }
        .sp-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: ${C.radiusSm}px;
          border: 1.5px solid ${C.borderDefault};
          background: ${C.bgMuted};
          color: ${C.textPrimary};
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          font-family: ${C.fontDisplay};
        }
        .sp-input:focus {
          border-color: ${C.primary};
          box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.12);
          background: ${C.bgSurface};
        }
        .sp-input::placeholder {
          color: ${C.textMuted};
        }
        .sp-input-mono {
          font-family: ${C.fontMono};
        }
        .sp-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeInScale { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .sp-modal {
          background: ${C.bgSurface};
          border-radius: ${C.radiusLg}px;
          padding: 28px;
          width: 400px;
          maxWidth: 92vw;
          box-shadow: ${C.shadowXl};
          animation: scaleIn 0.25s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @media (max-width: 900px) {
          .sp-summary-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 600px) {
          .sp-summary-grid {
            grid-template-columns: 1fr 1fr !important;
          }
          .sp-action-bar {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .sp-action-bar-left {
            justify-content: center !important;
          }
          .sp-action-bar-right {
            justify-content: center !important;
          }
          .sp-modal {
            width: 94vw !important;
            padding: 20px !important;
          }
        }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: 28, animation: "fadeInUp 0.4s ease both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${C.primary}15, ${C.primary}08)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TrendingUp size={20} color={C.primary} />
          </div>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: C.textPrimary,
                margin: 0,
                fontFamily: C.fontDisplay,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}
            >
              {t("stocks.title")}
            </h1>
            <p
              style={{
                fontSize: 13,
                color: C.textTertiary,
                margin: 0,
                fontFamily: C.fontDisplay,
              }}
            >
              {holdings.length > 0
                ? `${holdings.length} holding${holdings.length !== 1 ? "s" : ""} tracked`
                : t("stocks.empty")}
            </p>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div
        className="sp-action-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
          animation: "fadeInUp 0.4s ease 0.05s both",
        }}
      >
        <div
          className="sp-action-bar-left"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          {lastRefreshTime && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: C.textTertiary,
                transition: "opacity 0.3s",
                fontFamily: C.fontDisplay,
              }}
            >
              {refreshing ? (
                <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <Clock size={13} style={{ opacity: autoRefresh ? 0.6 : 1 }} />
              )}
              <span>{`上次刷新: ${lastRefreshTime}`}</span>
              {autoRefresh && !refreshing && (
                <span style={{ color: C.success, fontSize: 10 }}>●</span>
              )}
            </div>
          )}
          {/* Auto-refresh toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: C.textSecondary,
              cursor: "pointer",
              userSelect: "none",
              fontFamily: C.fontDisplay,
            }}
          >
            <div
              onClick={() => {
                setAutoRefresh(!autoRefresh);
                localStorage.setItem("stock_auto_refresh", String(!autoRefresh));
              }}
              style={{
                width: 38,
                height: 22,
                borderRadius: 11,
                background: autoRefresh ? C.primary : C.borderDefault,
                position: "relative",
                cursor: "pointer",
                transition: "background 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: 2,
                  left: autoRefresh ? 18 : 2,
                  transition: "left 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                }}
              />
            </div>
            <span>自动刷新</span>
          </label>
        </div>
        <div className="sp-action-bar-right" style={{ display: "flex", gap: 8 }}>
          <button
            className="sp-btn-ghost"
            onClick={handleRefresh}
            disabled={holdings.length === 0}
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
            className="sp-btn-ghost"
            onClick={() => setShowFeeSettings(true)}
          >
            <Settings size={14} />
            {t("stocks.feeSettings.title")}
          </button>
          <button
            className="sp-btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? t("common.cancel") : t("stocks.add")}
          </button>
        </div>
      </div>

      {/* Position Management */}
      {positionSummary && (
        <div
          style={{
            background: C.bgSurface,
            border: `1px solid ${C.borderLight}`,
            borderRadius: C.radiusLg,
            marginBottom: 20,
            padding: "18px 22px",
            boxShadow: C.shadowMd,
            animation: "fadeInUp 0.4s ease 0.05s both",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.textPrimary, fontFamily: C.fontDisplay }}>
              {t("stocks.positionManagement")}
            </h3>
            <button
              onClick={() => setEditingField('transfer')}
              style={{
                border: 'none',
                background: 'none',
                color: C.primary,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: C.fontDisplay,
              }}
            >
              {t("stocks.addTransfer")}
            </button>
          </div>

          <div className="sp-summary-grid">
            <div onClick={() => setEditingField('total_position')} style={{ cursor: 'pointer' }}>
              <SummaryItem
                icon={<Wallet size={16} color={C.primary} />}
                label={t("stocks.totalPosition")}
                value={`¥${positionSummary.total_position_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              />
            </div>
            <SummaryItem
              icon={<TrendingUp size={16} color={C.accent} />}
              label={<InvestedCapitalLabel />}
              value={`¥${positionSummary.invested_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
            <SummaryItem
              icon={<BarChart3 size={16} color={C.textPrimary} />}
              label={<TotalMarketValueLabel />}
              value={`¥${positionSummary.current_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
            <SummaryItem
              icon={<PiggyBank size={16} color="#10b981" />}
              label={<CashBalanceLabel />}
              value={`¥${positionSummary.cash_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              color={positionSummary.cash_balance >= 0 ? "#10b981" : C.danger}
            />
          </div>

          <div className="sp-summary-grid" style={{ marginTop: 10 }}>
            <SummaryItem
              icon={<TrendingUp size={16} color="#3b82f6" />}
              label={t("stocks.transferIn")}
              value={`¥${positionSummary.transfer_in.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              color="#3b82f6"
            />
            <SummaryItem
              icon={<TrendingDown size={16} color="#f59e0b" />}
              label={t("stocks.transferOut")}
              value={`¥${positionSummary.transfer_out.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              color="#f59e0b"
            />
            <SummaryItem
              icon={<TrendingDown size={16} color={C.danger} />}
              label={t("stocks.lossAmount")}
              value={`¥${positionSummary.loss_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              color={positionSummary.loss_amount > 0 ? C.danger : undefined}
            />
            <SummaryItem
              icon={positionSummary.total_pnl >= 0 ? <TrendingUp size={16} color={C.success} /> : <TrendingDown size={16} color={C.danger} />}
              label={t("stocks.totalProfitLoss")}
              value={`${positionSummary.total_pnl >= 0 ? "+" : ""}¥${positionSummary.total_pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              color={positionSummary.total_pnl >= 0 ? C.success : C.danger}
            />
          </div>


          {positionSummary.total_position_amount > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: C.textTertiary }}>{t("stocks.positionUsage")}</span>
                <span style={{ fontSize: 11, color: C.textTertiary, fontFamily: C.fontMono }}>
                  {((positionSummary.invested_amount / positionSummary.total_position_amount) * 100).toFixed(1)}%
                </span>
              </div>
              <div style={{ height: 6, background: C.bgMuted, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (positionSummary.invested_amount / positionSummary.total_position_amount) * 100)}%`, background: `linear-gradient(90deg, ${C.primary} 0%, ${C.accent} 100%)`, borderRadius: 3, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}
        </div>
      )}

{/* Position Edit Modal */}
      {editingField === 'total_position' && (
        <div
          className="sp-overlay"
          onClick={() => setEditingField(null)}
          style={{ animation: 'fadeIn 0.15s ease' }}
        >
          <div
            className="sp-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480,
              animation: 'fadeInScale 0.2s ease',
            }}
          >
            <h3
              style={{
                margin: '0 0 24px 0',
                fontSize: 18,
                fontWeight: 700,
                color: C.textPrimary,
                fontFamily: C.fontDisplay,
              }}
            >
              {t("stocks.editTotalPosition")}
            </h3>

            {/* Currency list */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: C.textTertiary, marginBottom: 12, display: 'block', fontWeight: 600 }}>
                {t("stocks.positionCurrencies")}
              </label>
              {positionCurrencies.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 10,
                    padding: '10px 14px',
                    background: C.bgMuted,
                    borderRadius: C.radiusSm,
                  }}
                >
                  <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.textPrimary,
                    fontFamily: C.fontMono,
                    minWidth: 36,
                  }}>
                    {item.currency}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="sp-input sp-input-mono"
                    value={item.amount ? item.amount.toString() : ''}
                    onChange={async (e) => {
                      const val = e.target.value;
                      if (/^[0-9]*\.?[0-9]*$/.test(val) || val === '') {
                        const numVal = parseFloat(val) || 0;
                        setPositionCurrencies(prev =>
                          prev.map(c => c.id === item.id ? { ...c, amount: numVal } : c)
                        );
                      }
                    }}
                    onBlur={async () => {
                      await updatePositionCurrency(item.id, item.amount);
                      await loadPositionSummary();
                    }}
                    style={{
                      flex: 1,
                      fontSize: 15,
                      fontWeight: 600,
                      padding: '8px 12px',
                    }}
                    placeholder="0.00"
                  />
                  <button
                    onClick={async () => {
                      await deletePositionCurrency(item.id);
                      setPositionCurrencies(prev => prev.filter(c => c.id !== item.id));
                      await loadPositionSummary();
                    }}
                    style={{
                      border: `1px solid ${C.danger}33`,
                      background: `${C.danger}11`,
                      color: C.danger,
                      cursor: 'pointer',
                      padding: '6px 10px',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1,
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${C.danger}22`;
                      e.currentTarget.style.borderColor = C.danger;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `${C.danger}11`;
                      e.currentTarget.style.borderColor = `${C.danger}33`;
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Add new currency */}
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <select
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value)}
                  className="sp-input"
                  style={{ width: 80, fontSize: 13, fontWeight: 600, padding: '8px 10px' }}
                >
                  {['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  className="sp-input sp-input-mono"
                  value={newAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^[0-9]*\.?[0-9]*$/.test(val) || val === '') {
                      setNewAmount(val);
                    }
                  }}
                  style={{ flex: 1, fontSize: 13, padding: '8px 12px' }}
                  placeholder={t("stocks.enterAmount")}
                />
                <button
                  onClick={async () => {
                    if (!newAmount || parseFloat(newAmount) <= 0) return;
                    const res = await addPositionCurrency(newCurrency, parseFloat(newAmount));
                    setPositionCurrencies(prev => [...prev, { id: res.id, currency: newCurrency, amount: parseFloat(newAmount) }]);
                    setNewAmount('');
                    await loadPositionSummary();
                  }}
                  style={{
                    border: 'none',
                    background: C.primary,
                    color: '#fff',
                    cursor: 'pointer',
                    padding: '8px 14px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Total display */}
            <div style={{
              padding: '14px 18px',
              background: C.bgMuted,
              borderRadius: C.radiusSm,
              marginBottom: 24,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, color: C.textTertiary, fontWeight: 600 }}>
                {t("stocks.totalInCNY")}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.textPrimary, fontFamily: C.fontMono }}>
                ¥{(positionSummary?.total_position_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="sp-btn-ghost"
                onClick={() => setEditingField(null)}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}





      {/* Transfer Modal */}
      {editingField === 'transfer' && (
        <div className="sp-overlay" onClick={() => setEditingField(null)} style={{ animation: 'fadeIn 0.15s ease' }}>
          <div className="sp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, animation: 'fadeInScale 0.2s ease' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: 18, fontWeight: 700, color: C.textPrimary, fontFamily: C.fontDisplay }}>
              {t("stocks.addTransfer")}
            </h3>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button
                onClick={() => setTransferType('in')}
                style={{
                  flex: 1, padding: '10px', border: 'none', borderRadius: 8,
                  background: transferType === 'in' ? '#dcfce7' : C.bgMuted,
                  color: transferType === 'in' ? '#16a34a' : C.textTertiary,
                  fontWeight: 600, cursor: 'pointer', fontSize: 13,
                }}
              >
                {t("stocks.transferIn")}
              </button>
              <button
                onClick={() => setTransferType('out')}
                style={{
                  flex: 1, padding: '10px', border: 'none', borderRadius: 8,
                  background: transferType === 'out' ? '#fef3c7' : C.bgMuted,
                  color: transferType === 'out' ? '#d97706' : C.textTertiary,
                  fontWeight: 600, cursor: 'pointer', fontSize: 13,
                }}
              >
                {t("stocks.transferOut")}
              </button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: C.textTertiary, marginBottom: 6, display: 'block' }}>{t("stocks.amount")}</label>
              <input type="text" inputMode="decimal" className="sp-input sp-input-mono" value={transferAmount}
                onChange={(e) => { if (/^[0-9]*\.?[0-9]*$/.test(e.target.value) || e.target.value === '') setTransferAmount(e.target.value); }}
                style={{ fontSize: 16, fontWeight: 600, padding: '12px 14px' }} placeholder="0.00" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: C.textTertiary, marginBottom: 6, display: 'block' }}>{t("stocks.sellDate")}</label>
              <input type="date" className="sp-input" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="sp-btn-ghost" onClick={() => setEditingField(null)}>{t("common.cancel")}</button>
              <button className="sp-btn-primary" onClick={async () => {
                if (!transferAmount || parseFloat(transferAmount) <= 0) return;
                await addStockTransfer(transferType, parseFloat(transferAmount), transferDate);
                await loadPositionSummary();
                setEditingField(null);
                setTransferAmount('');
              }} style={{ background: `linear-gradient(135deg, ${C.primary} 0%, ${C.accent} 100%)`, boxShadow: `0 2px 8px ${C.primary}33` }}>
                {t("stocks.confirmEdit")}
              </button>
            </div>
          </div>
        </div>
      )}

{/* Add form */}
      {showForm && (
        <div
          style={{
            background: C.bgSurface,
            border: `1px solid ${C.borderLight}`,
            borderRadius: C.radiusLg,
            padding: "24px 28px",
            marginBottom: 20,
            boxShadow: C.shadowMd,
            animation: "fadeSlideIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.textPrimary,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: C.fontDisplay,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: C.primaryLight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={14} color={C.primary} />
            </div>
            Add New Holding
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "14px 18px",
              marginBottom: 20,
              position: "relative",
            }}
          >
            {/* Ticker input with autocomplete */}
            <div style={{ position: "relative" }}>
              <label style={labelStyle}>{t("stocks.ticker")}</label>
              <input
                type="text"
                className="sp-input sp-input-mono"
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value);
                  handleSearch(e.target.value, "ticker");
                }}
                placeholder={t("stocks.tickerPlaceholder")}
              />
              {showDropdown && searchField === "ticker" && searchResults.length > 0 && (
                <div
                  data-autocomplete-dropdown
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 6,
                    background: C.bgSurface,
                    border: `1px solid ${C.borderDefault}`,
                    borderRadius: C.radiusSm,
                    maxHeight: 220,
                    overflowY: "auto",
                    zIndex: 100,
                    boxShadow: C.shadowLg,
                  }}
                >
                  {searchResults.map((r) => (
                    <div
                      key={r.symbol}
                      onClick={() => handleSelectResult(r)}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        borderBottom: `1px solid ${C.borderLight}`,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = C.bgHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: C.fontMono }}>
                        {r.symbol}
                      </div>
                      <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>
                        {r.name} · {r.exchange}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Name input with autocomplete */}
            <div style={{ position: "relative" }}>
              <label style={labelStyle}>{t("stocks.name")}</label>
              <input
                type="text"
                className="sp-input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  handleSearch(e.target.value, "name");
                }}
                placeholder={t("stocks.namePlaceholder")}
              />
              {showDropdown && searchField === "name" && searchResults.length > 0 && (
                <div
                  data-autocomplete-dropdown
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: 6,
                    background: C.bgSurface,
                    border: `1px solid ${C.borderDefault}`,
                    borderRadius: C.radiusSm,
                    maxHeight: 220,
                    overflowY: "auto",
                    zIndex: 100,
                    boxShadow: C.shadowLg,
                  }}
                >
                  {searchResults.map((r) => (
                    <div
                      key={r.symbol}
                      onClick={() => handleSelectResult(r)}
                      style={{
                        padding: "10px 14px",
                        cursor: "pointer",
                        borderBottom: `1px solid ${C.borderLight}`,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = C.bgHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: C.fontMono }}>
                        {r.symbol}
                      </div>
                      <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>
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
              gap: 10,
              justifyContent: "flex-end",
              paddingTop: 16,
              borderTop: `1px solid ${C.borderLight}`,
            }}
          >
            <button className="sp-btn-ghost" onClick={() => setShowForm(false)}>
              {t("common.cancel")}
            </button>
            <button
              className="sp-btn-primary"
              onClick={handleAdd}
              disabled={!ticker.trim() || !buyPrice || !quantity}
            >
              {t("common.confirm")}
            </button>
          </div>
        </div>
      )}

      {/* Holdings list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <Loader2
            size={24}
            color={C.textTertiary}
            style={{ animation: "spin 1s linear infinite" }}
          />
          <p style={{ fontSize: 13, color: C.textTertiary, marginTop: 12, fontFamily: C.fontDisplay }}>
            {t("common.loading")}
          </p>
        </div>
      ) : holdings.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "56px 24px",
            color: C.textTertiary,
            animation: "fadeInUp 0.4s ease 0.15s both",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: C.bgMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <TrendingUp size={24} style={{ opacity: 0.3 }} />
          </div>
          <p style={{ fontSize: 14, margin: 0, fontFamily: C.fontDisplay }}>{t("stocks.empty")}</p>
        </div>
      ) : (
        <div className="sp-holdings-list">
          {holdings.map((h, idx) => (
            <div
              key={h.id}
              className="sp-card-entrance"
              style={{ animationDelay: `${0.08 + idx * 0.06}s` }}
            >
              <StockCard
                holding={h}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                onTradesUpdated={load}
                onClosePosition={handleClosePosition}
                onPartialSell={handlePartialSell}
              />
            </div>
          ))}
        </div>
      )}

      {/* Close Position Modal */}
      {closingId && (
        <div className="sp-overlay" onClick={() => setClosingId(null)}>
          <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
            <h3
              style={{
                margin: "0 0 20px 0",
                fontSize: 18,
                fontWeight: 700,
                color: C.textPrimary,
                fontFamily: C.fontDisplay,
              }}
            >
              {t("stocks.confirmClose")}
            </h3>
            {(() => {
              const h = holdings.find((x) => x.id === closingId);
              if (!h) return null;
              const market = detectMarket(h.ticker);
              const sellQty = h.effective_qty ?? h.quantity;
              const sellPrice = parseFloat(closeSellPrice) || 0;
              // Estimate fee
              const amount = sellPrice * sellQty;
              const commission = Math.max(amount * 0.00015, 5);
              const stampDuty = amount * 0.0005;
              const transferFee = amount * 0.00001;
              const fee = Math.round((commission + stampDuty + transferFee) * 100) / 100;
              const pnl = (sellPrice - h.buy_price) * sellQty - fee;
              const isProfit = pnl >= 0;
              return (
                <>
                  <div
                    style={{
                      padding: "16px 18px",
                      background: C.bgMuted,
                      borderRadius: C.radiusMd,
                      marginBottom: 20,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: C.fontMono }}>
                        {h.ticker}
                      </span>
                      <span style={{ fontSize: 13, color: C.textTertiary, fontFamily: C.fontDisplay }}>
                        {h.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: C.textTertiary }}>{t("stocks.quantity")}</span>
                      <span style={{ fontSize: 13, fontFamily: C.fontMono, color: C.textPrimary, fontWeight: 500 }}>
                        {sellQty}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: C.textTertiary }}>{t("stocks.sellPrice")}</span>
                      <span style={{ fontSize: 13, fontFamily: C.fontMono, color: C.textPrimary, fontWeight: 500 }}>
                        {market.currencySymbol}{sellPrice.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: C.textTertiary }}>{t("stocks.fee")}</span>
                      <span style={{ fontSize: 13, fontFamily: C.fontMono, color: C.textTertiary, fontWeight: 500 }}>
                        {market.currencySymbol}{fee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: C.textTertiary }}>{t("stocks.realizedPnl")}</span>
                      <span
                        style={{
                          fontSize: 14,
                          fontFamily: C.fontMono,
                          fontWeight: 700,
                          color: isProfit ? C.success : C.danger,
                        }}
                      >
                        {isProfit ? "+" : ""}{market.currencySymbol}{pnl.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </span>
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>{t("stocks.sellPrice")}</label>
                    <input
                      type="number"
                      className="sp-input sp-input-mono"
                      value={closeSellPrice}
                      onChange={(e) => setCloseSellPrice(e.target.value)}
                      step="0.001"
                    />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>{t("stocks.sellDate")}</label>
                    <input
                      type="date"
                      className="sp-input"
                      value={closeSellDate}
                      onChange={(e) => setCloseSellDate(e.target.value)}
                    />
                  </div>
                  <p
                    style={{
                      fontSize: 12,
                      color: C.textTertiary,
                      margin: "0 0 20px 0",
                      lineHeight: 1.6,
                      fontFamily: C.fontDisplay,
                    }}
                  >
                    {t("stocks.closeHint")}
                  </p>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button className="sp-btn-ghost" onClick={() => setClosingId(null)}>
                      {t("common.cancel")}
                    </button>
                    <button
                      className="sp-btn-primary"
                      onClick={confirmClosePosition}
                      style={{
                        background: `linear-gradient(135deg, ${C.accent} 0%, #b45309 100%)`,
                        boxShadow: "0 2px 8px rgba(217, 119, 6, 0.2)",
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

      {/* Partial Sell Modal */}
      {partialSellId && (
        <div className="sp-overlay" onClick={() => setPartialSellId(null)}>
          <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
            <h3
              style={{
                margin: "0 0 20px 0",
                fontSize: 18,
                fontWeight: 700,
                color: C.textPrimary,
                fontFamily: C.fontDisplay,
              }}
            >
              {t("stocks.partialSellTitle")}
            </h3>
            {(() => {
              const h = holdings.find((x) => x.id === partialSellId);
              if (!h) return null;
              const market = detectMarket(h.ticker);
              const sellQty = parseFloat(partialSellQty) || 0;
              const sellPrice = parseFloat(partialSellPrice) || 0;
              const pnl = (sellPrice - h.effective_cost) * sellQty;
              const isProfit = pnl >= 0;
              const maxQty = h.effective_qty ?? h.quantity;
              return (
                <>
                  <div
                    style={{
                      padding: "16px 18px",
                      background: C.bgMuted,
                      borderRadius: C.radiusMd,
                      marginBottom: 20,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: C.fontMono }}>
                        {h.ticker}
                      </span>
                      <span style={{ fontSize: 13, color: C.textTertiary, fontFamily: C.fontDisplay }}>
                        {h.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: C.textTertiary }}>{t("stocks.availableQty")}</span>
                      <span style={{ fontSize: 13, fontFamily: C.fontMono, color: C.textPrimary, fontWeight: 500 }}>
                        {maxQty}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: C.textTertiary }}>{t("stocks.costPrice")}</span>
                      <span style={{ fontSize: 13, fontFamily: C.fontMono, color: C.textPrimary, fontWeight: 500 }}>
                        {market.currencySymbol}{(h.effective_cost ?? h.buy_price).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </span>
                    </div>
                    {sellQty > 0 && sellPrice > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: C.textTertiary }}>{t("stocks.estimatedPnl")}</span>
                        <span
                          style={{
                            fontSize: 14,
                            fontFamily: C.fontMono,
                            fontWeight: 700,
                            color: isProfit ? C.success : C.danger,
                          }}
                        >
                          {isProfit ? "+" : ""}{market.currencySymbol}{pnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>{t("stocks.sellPrice")}</label>
                    <input
                      type="number"
                      className="sp-input sp-input-mono"
                      value={partialSellPrice}
                      onChange={(e) => setPartialSellPrice(e.target.value)}
                      step="0.001"
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>{t("stocks.sellQty")}</label>
                    <input
                      type="number"
                      className="sp-input sp-input-mono"
                      value={partialSellQty}
                      onChange={(e) => setPartialSellQty(e.target.value)}
                      max={maxQty}
                      min="1"
                      placeholder={t("stocks.sellQtyPlaceholder")}
                    />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>{t("stocks.sellDate")}</label>
                    <input
                      type="date"
                      className="sp-input"
                      value={partialSellDate}
                      onChange={(e) => setPartialSellDate(e.target.value)}
                    />
                  </div>
                  <p
                    style={{
                      fontSize: 12,
                      color: C.textTertiary,
                      margin: "0 0 20px 0",
                      lineHeight: 1.6,
                      fontFamily: C.fontDisplay,
                    }}
                  >
                    {t("stocks.partialSellHint")}
                  </p>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button className="sp-btn-ghost" onClick={() => setPartialSellId(null)}>
                      {t("common.cancel")}
                    </button>
                    <button
                      className="sp-btn-primary"
                      onClick={confirmPartialSell}
                      disabled={!partialSellQty || parseFloat(partialSellQty) <= 0 || parseFloat(partialSellQty) > maxQty}
                      style={{
                        background: `linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)`,
                        boxShadow: "0 2px 8px rgba(37, 99, 235, 0.2)",
                      }}
                    >
                      {t("stocks.confirmPartialSell")}
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
            marginTop: 28,
            background: C.bgSurface,
            border: `1px solid ${C.borderLight}`,
            borderRadius: C.radiusLg,
            overflow: "hidden",
            boxShadow: C.shadowMd,
            animation: "fadeInUp 0.4s ease 0.2s both",
          }}
        >
          <button
            onClick={() => setShowClosed(!showClosed)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "16px 22px",
              border: "none",
              background: "none",
              cursor: "pointer",
              color: C.textSecondary,
              fontSize: 14,
              fontWeight: 600,
              textAlign: "left",
              transition: "background 0.15s",
              fontFamily: C.fontDisplay,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = C.bgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            <FileText size={16} color={C.textTertiary} />
            {t("stocks.closedPositions")}
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: C.textTertiary,
                background: C.bgMuted,
                padding: "2px 10px",
                borderRadius: 10,
                fontFamily: C.fontMono,
              }}
            >
              {closedHoldings.length}
            </span>
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
              {showClosed ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          </button>
          {showClosed && (
            <div style={{ padding: "0 22px 18px 22px" }}>
              {(() => {
                const totalRealized = closedHoldings.reduce(
                  (s, h) => s + ((h.realized_pnl as number) ?? ((h.sell_price - h.buy_price) * h.quantity)),
                  0
                );
                const isProfit = totalRealized >= 0;
                return (
                  <div
                    style={{
                      padding: "12px 16px",
                      background: C.bgMuted,
                      borderRadius: C.radiusSm,
                      marginBottom: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ fontSize: 12, color: C.textTertiary, fontFamily: C.fontDisplay }}>
                      {t("stocks.totalRealized")}
                    </span>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontFamily: C.fontMono,
                        color: isProfit ? C.success : C.danger,
                      }}
                    >
                      {isProfit ? "+" : ""}¥{totalRealized.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                    </span>
                  </div>
                );
              })()}
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
                      padding: "12px 16px",
                      borderBottom: `1px solid ${C.borderLight}`,
                      transition: "background 0.15s",
                      borderRadius: 6,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.bgHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: C.bgMuted,
                          color: C.textTertiary,
                          flexShrink: 0,
                          fontFamily: C.fontDisplay,
                        }}
                      >
                        CLOSED
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: C.fontMono, color: C.textPrimary }}>
                        {h.ticker}
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
                        {h.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: C.textTertiary, marginBottom: 2, fontFamily: C.fontDisplay }}>
                          {market.currencySymbol}{h.buy_price.toFixed(3)} → {market.currencySymbol}{h.sell_price.toFixed(3)}
                        </div>
                        <div style={{ fontSize: 11, color: C.textTertiary, fontFamily: C.fontMono }}>
                          ×{h.quantity}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: C.fontMono,
                            color: isProfit ? C.success : C.danger,
                          }}
                        >
                          {isProfit ? "+" : ""}{market.currencySymbol}{realizedPnl.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </div>
                        {h.sell_date && (
                          <div style={{ fontSize: 10, color: C.textTertiary, marginTop: 2, fontFamily: C.fontDisplay }}>
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

/* ─── Shared style tokens ─── */
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "#8896a6",
  marginBottom: 6,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

/* ─── Helper sub-components ─── */

function TotalMarketValueLabel() {
  const { t } = useTranslation();
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {t("stocks.totalMarketValue")}
      <InfoTooltip text={t("stocks.totalMarketValueDesc")} />
    </span>
  );
}

function InvestedCapitalLabel() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {t("stocks.investedCapital")}
      <InfoTooltip text={t("stocks.investedCapitalDesc")} />
    </span>
  );
}

function CashBalanceLabel() {
  const { t } = useTranslation();
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {t("stocks.cashBalance")}
      <InfoTooltip text={t("stocks.cashBalanceDesc")} />
    </span>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%', background: C.textTertiary,
        color: '#fff', fontSize: 9, fontWeight: 700, cursor: 'help', opacity: 0.5,
        transition: 'opacity 0.15s', lineHeight: 1, position: 'relative',
      }}
    >
      ?
      {show && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 8, width: 280, padding: '14px 18px', background: C.textPrimary,
          color: '#fff', fontSize: 12, lineHeight: 1.7, borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 100,
          animation: 'fadeInScale 0.15s ease', pointerEvents: 'none',
        }}>
          {text}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent', borderTop: `6px solid ${C.textPrimary}`,
          }} />
        </div>
      )}
    </span>
  );
}

function CashBalanceInfo() {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: C.textTertiary,
        color: '#fff',
        fontSize: 9,
        fontWeight: 700,
        cursor: 'help',
        opacity: 0.5,
        transition: 'opacity 0.15s',
        lineHeight: 1,
        position: 'relative',
      }}
    >
      ?
      {show && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            width: 280,
            padding: '14px 18px',
            background: C.textPrimary,
            color: '#fff',
            fontSize: 12,
            lineHeight: 1.7,
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            zIndex: 100,
            animation: 'fadeInScale 0.15s ease',
            pointerEvents: 'none',
          }}
        >
          {t("stocks.cashBalanceDesc")}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: `6px solid ${C.textPrimary}`,
          }} />
        </div>
      )}
    </span>
  );
}

function SummaryItem({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: C.bgSurface,
        transition: "background 0.2s",
        borderRight: `1px solid ${C.borderLight}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.bgSurface; }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: color === C.success
            ? C.successLight
            : color === C.danger
              ? C.dangerLight
              : C.primaryLight,
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
          style={{
            fontSize: 10,
            color: C.textTertiary,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 2,
            fontWeight: 600,
            fontFamily: C.fontDisplay,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            fontFamily: C.fontMono,
            color: color || C.textPrimary,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontVariantNumeric: "tabular-nums",
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
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        className={`sp-input${type === "number" ? " sp-input-mono" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
