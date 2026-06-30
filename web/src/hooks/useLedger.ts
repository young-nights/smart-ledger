import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  fetchTransactions,
  fetchTransactionSummary,
  fetchBudgets,
  fetchMonthlyTrend,
  fetchCategories,
  addTransaction,
  deleteTransaction,
  setBudget,
  deleteBudget,
  searchTransactions,
} from "../lib/api";
import type {
  Transaction,
  TransactionSummary,
  BudgetStatus,
  Category,
} from "../lib/types";
import type { MonthlyTrendItem } from "../lib/api";
import {
  getLocalCategories,
  saveLocalCategories,
  mergeCategories,
  migrateLegacyCategoryNames,
  CHART_COLORS,
} from "../lib/categoryStore";
import type { CategoryItem } from "../lib/categoryStore";
import { useGlobalData } from "../contexts/GlobalDataContext";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Hook: transactions list — reads from global cache, triggers refresh if stale
export function useTransactions(month?: string, category?: string) {
  const { data: globalData, refresh, isStale } = useGlobalData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter global transactions by month/category
  const filtered = useMemo(() => {
    let list = globalData.transactions;
    if (month) list = list.filter((t) => t.date.startsWith(month));
    if (category) list = list.filter((t) => t.category === category);
    return list;
  }, [globalData.transactions, month, category]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refresh("transactions");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (isStale("transactions")) {
      void load();
    }
  }, [isStale, load]);

  // Optimistic helpers — update local state immediately
  const optimisticRemove = useCallback((id: number) => {
    // This will be handled by the global state
  }, []);

  const optimisticAdd = useCallback((txn: Transaction) => {
    // This will be handled by the global state
  }, []);

  const optimisticUpdate = useCallback((id: number, updates: Partial<Transaction>) => {
    // This will be handled by the global state
  }, []);

  return { data: filtered, loading, error, reload: load, optimisticRemove, optimisticAdd, optimisticUpdate };
}

// Hook: summary by period — reads from global cache
export function useSummary(
  month?: string,
  period: "day" | "month" | "year" = "month",
  dateStr?: string,
) {
  const { data: globalData, refresh, isStale } = useGlobalData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refresh("summary");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (isStale("summary")) {
      void load();
    }
  }, [isStale, load]);

  return { data: globalData.summary, loading, error, reload: load };
}

// Hook: budgets — reads from global cache
export function useBudgets(month?: string) {
  const { data: globalData, refresh, isStale } = useGlobalData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter budgets by month if needed (API already returns current month by default)
  const filtered = useMemo(() => {
    // budgets are already filtered server-side based on month param at fetch time
    return globalData.budgets;
  }, [globalData.budgets]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refresh("budgets");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (isStale("budgets")) {
      void load();
    }
  }, [isStale, load]);

  return { data: filtered, loading, error, reload: load };
}

// Hook: add transaction
export function useAddTransaction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (rawInput: string, date?: string, time?: string, type?: "expense" | "income", category?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await addTransaction(rawInput, date, time, type, category);
      return result;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { add, loading, error };
}

// Hook: delete transaction
export function useDeleteTransaction() {
  const remove = async (id: number) => {
    await deleteTransaction(id);
  };
  return { remove };
}

// Hook: set budget
export function useSetBudget() {
  const save = async (category: string, amount: number, currency?: string, year?: number, month?: number, period?: string) => {
    return await setBudget(category, amount, currency, year, month, period);
  };
  return { save };
}

// Hook: delete budget
export function useDeleteBudget() {
  const remove = async (id: number) => {
    await deleteBudget(id);
  };
  return { remove };
}

// Hook: monthly trend (last N months)
export function useMonthlyTrend(count = 6, period: "day" | "month" | "year" = "month") {
  const [data, setData] = useState<MonthlyTrendItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const newData = await fetchMonthlyTrend(count, period);
      setData(newData);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [count, period]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

// Hook: categories — reads from global cache
export function useCategories() {
  const { data: globalData, refresh, isStale } = useGlobalData();
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await refresh("categories");
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (isStale("categories")) {
      void load();
    }
  }, [isStale, load]);

  const updateLocal = useCallback((updated: CategoryItem[]) => {
    saveLocalCategories(updated);
  }, []);

  return { data: globalData.categories, loading, reload: load, update: updateLocal };
}

// Hook: search
export function useSearch() {
  const [results, setResults] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      setResults(await searchTransactions(q));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return { results, loading, search };
}
