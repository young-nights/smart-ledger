import { useState, useEffect, useCallback, useRef } from "react";
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

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Hook: transactions list
export function useTransactions(month?: string, category?: string) {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTransactions(month, category, { signal: ac.signal });
      if (id !== reqId.current) return;
      setData(result);
    } catch (e: unknown) {
      if (id !== reqId.current || ac.signal.aborted) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [month, category]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
      reqId.current += 1;
    };
  }, [load]);

  // Optimistic remove — instantly removes from local state
  const optimisticRemove = useCallback((id: number) => {
    setData((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Optimistic add — instantly adds new transaction to local state
  const optimisticAdd = useCallback((txn: Transaction) => {
    setData((prev) => [txn, ...prev]);
  }, []);

  // Optimistic update — instantly updates transaction fields in local state
  const optimisticUpdate = useCallback((id: number, updates: Partial<Transaction>) => {
    setData((prev) => prev.map((t) => t.id === id ? { ...t, ...updates } : t));
  }, []);

  return { data, loading, error, reload: load, optimisticRemove, optimisticAdd, optimisticUpdate };
}

// Hook: summary by period
export function useSummary(
  month?: string,
  period: "day" | "month" | "year" = "month",
  dateStr?: string,
) {
  const [data, setData] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const m = month || currentMonth();
      const result = await fetchTransactionSummary(m, period, dateStr, { signal: ac.signal });
      if (id !== reqId.current) return;
      setData(result);
    } catch (e: unknown) {
      if (id !== reqId.current || ac.signal.aborted) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      setData(null);
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [month, period, dateStr]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
      reqId.current += 1;
    };
  }, [load]);

  return { data, loading, error, reload: load };
}

// Hook: budgets
export function useBudgets(month?: string) {
  const [data, setData] = useState<BudgetStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const m = month || currentMonth();
      const result = await fetchBudgets(m, { signal: ac.signal });
      if (id !== reqId.current) return;
      setData(result);
    } catch (e: unknown) {
      if (id !== reqId.current || ac.signal.aborted) return;
      if (e instanceof DOMException && e.name === "AbortError") return;
      setData([]);
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
      reqId.current += 1;
    };
  }, [load]);

  return { data, loading, error, reload: load };
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

// Hook: categories (merged backend + local)
export function useCategories() {
  const [data, setData] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    migrateLegacyCategoryNames();
    try {
      const raw = await fetchCategories();
      const list: Category[] = raw.categories || [];
      // Map backend Category[] to CategoryItem[]
      const backendItems: CategoryItem[] = list.map(
        (c: Category, i: number) => ({
          id: i + 1,
          name: c.name,
          parent_id: null,
          color: CHART_COLORS[i % CHART_COLORS.length],
          icon: "",
          keywords: c.subcategories || [],
        })
      );
      const local = getLocalCategories();
      setData(mergeCategories(backendItems, local));
    } catch {
      // Fallback to local-only
      setData(getLocalCategories());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateLocal = useCallback((updated: CategoryItem[]) => {
    saveLocalCategories(updated);
    setData(updated);
  }, []);

  return { data, loading, reload: load, update: updateLocal };
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
