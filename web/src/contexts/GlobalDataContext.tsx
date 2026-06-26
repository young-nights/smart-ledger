/**
 * GlobalDataProvider — centralised data cache with stale-while-revalidate.
 *
 * Every page reads from this single source instead of re-fetching on mount.
 * `refresh(key)` re-fetches only the requested slice; `isStale(key)` checks
 * whether the cached value is older than the configured max age.
 */

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  fetchTransactions,
  fetchTransactionSummary,
  fetchAllTimeSummary,
  fetchBudgets,
  fetchSavingsGoals,
  fetchCategories,
  fetchAnalysis,
  fetchStockHoldings,
  fetchExchangeRates,
} from "../lib/api";
import type {
  Transaction,
  TransactionSummary,
  BudgetStatus,
  SavingsGoal,
  Category,
  StockHolding,
} from "../lib/types";
import type { AnalysisData } from "../lib/api";
import {
  getLocalCategories,
  saveLocalCategories,
  mergeCategories,
  migrateLegacyCategoryNames,
  CHART_COLORS,
} from "../lib/categoryStore";
import type { CategoryItem } from "../lib/categoryStore";

/* ── Types ──────────────────────────────────────────────────── */

export interface GlobalData {
  transactions: Transaction[];
  summary: TransactionSummary | null;
  allTimeSummary: TransactionSummary | null;
  stocks: StockHolding[];
  budgets: BudgetStatus[];
  savingsGoals: SavingsGoal[];
  categories: CategoryItem[];
  analysis: AnalysisData | null;
  exchangeRates: Record<string, number>;
  /** Epoch-ms when each slice was last fetched successfully. */
  lastFetched: Record<string, number>;
}

export interface GlobalDataContextType {
  data: GlobalData;
  loading: boolean;
  /** Re-fetch a specific data slice (or all critical slices if key is omitted). */
  refresh: (key?: string) => Promise<void>;
  /** Returns true if the cached slice is older than maxAgeMs. */
  isStale: (key: string, maxAgeMs?: number) => boolean;
}

/* ── Staleness config (ms) ──────────────────────────────────── */

const STALE_CONFIG: Record<string, number> = {
  stocks: 5_000,          // real-time
  exchangeRates: 300_000, // 5 min
  transactions: 30_000,   // 30 s
  summary: 30_000,
  allTimeSummary: 60_000, // 1 min
  budgets: 60_000,
  savingsGoals: 30_000,
  categories: 300_000,    // 5 min
  analysis: 60_000,
};

const INITIAL_STATE: GlobalData = {
  transactions: [],
  summary: null,
  allTimeSummary: null,
  stocks: [],
  budgets: [],
  savingsGoals: [],
  categories: [],
  analysis: null,
  exchangeRates: {},
  lastFetched: {},
};

/* ── Action types ───────────────────────────────────────────── */

type Action =
  | { type: "SET"; key: string; value: unknown; ts: number }
  | { type: "SET_LOADING"; loading: boolean };

function reducer(state: GlobalData, action: Action): GlobalData {
  switch (action.type) {
    case "SET":
      return {
        ...state,
        [action.key]: action.value,
        lastFetched: { ...state.lastFetched, [action.key]: action.ts },
      };
    case "SET_LOADING":
      return { ...state, loading: action.loading } as GlobalData;
    default:
      return state;
  }
}

/* ── Fetchers (key → async function) ────────────────────────── */

async function fetchCategoriesWithLocal(): Promise<CategoryItem[]> {
  migrateLegacyCategoryNames();
  const raw = await fetchCategories();
  const list: Category[] = raw.categories || [];
  const backendItems: CategoryItem[] = list.map(
    (c: Category, i: number) => ({
      id: i + 1,
      name: c.name,
      parent_id: null,
      color: CHART_COLORS[i % CHART_COLORS.length],
      icon: "",
      keywords: c.subcategories || [],
    }),
  );
  const local = getLocalCategories();
  return mergeCategories(backendItems, local);
}

const FETCHERS: Record<string, () => Promise<unknown>> = {
  transactions: () => fetchTransactions(),
  summary: () => fetchTransactionSummary(),
  allTimeSummary: () => fetchAllTimeSummary(),
  stocks: () => fetchStockHoldings(),
  budgets: () => fetchBudgets(),
  savingsGoals: () => fetchSavingsGoals(),
  categories: () => fetchCategoriesWithLocal(),
  analysis: () => fetchAnalysis(),
  exchangeRates: () => fetchExchangeRates(),
};

/* ── Context ────────────────────────────────────────────────── */

const Ctx = createContext<GlobalDataContextType | null>(null);

export function useGlobalData(): GlobalDataContextType {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGlobalData must be used within GlobalDataProvider");
  return ctx;
}

/* ── Provider ───────────────────────────────────────────────── */

export function GlobalDataProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const inFlight = useRef<Map<string, AbortController>>(new Map());

  /** Check whether a slice is stale. */
  const isStale = useCallback(
    (key: string, maxAgeMs?: number): boolean => {
      const age = maxAgeMs ?? STALE_CONFIG[key] ?? 30_000;
      const ts = state.lastFetched[key] ?? 0;
      return Date.now() - ts > age;
    },
    [state.lastFetched],
  );

  /** Refresh a specific key (or all critical keys). */
  const refresh = useCallback(
    async (key?: string) => {
      const keys = key ? [key] : Object.keys(FETCHERS);

      await Promise.allSettled(
        keys.map(async (k) => {
          const fetcher = FETCHERS[k];
          if (!fetcher) return;

          // Abort previous in-flight request for this key
          inFlight.current.get(k)?.abort();
          const ac = new AbortController();
          inFlight.current.set(k, ac);

          try {
            const value = await fetcher();
            if (!ac.signal.aborted) {
              dispatch({ type: "SET", key: k, value, ts: Date.now() });
            }
          } catch {
            // silently fail — stale data stays in cache
          } finally {
            inFlight.current.delete(k);
          }
        }),
      );
    },
    [],
  );

  /** On mount: pre-fetch critical data in parallel. */
  useEffect(() => {
    // Critical data — fetch immediately
    const critical = ["stocks", "transactions", "summary", "allTimeSummary", "budgets", "savingsGoals", "categories"];
    critical.forEach((k) => { void refresh(k); });

    // Cleanup: abort any in-flight on unmount
    return () => {
      inFlight.current.forEach((ac) => ac.abort());
      inFlight.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: GlobalDataContextType = {
    data: state,
    loading: state.lastFetched["transactions"] === undefined,
    refresh,
    isStale,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
