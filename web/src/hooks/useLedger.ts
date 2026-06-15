import { useState, useEffect, useCallback } from "react";
import {
  fetchTransactions,
  fetchTransactionSummary,
  fetchBudgets,
  fetchReport,
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
  ReportData,
  Category,
} from "../lib/types";
import type { MonthlyTrendItem } from "../lib/api";
import {
  getLocalCategories,
  saveLocalCategories,
  mergeCategories,
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // If no month specified, fetch all transactions
      setData(await fetchTransactions(month, category));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [month, category]);

  useEffect(() => { load(); }, [load]);

  // Optimistic remove — instantly removes from local state
  const optimisticRemove = useCallback((id: number) => {
    setData((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { data, loading, error, reload: load, optimisticRemove };
}

// Hook: summary by period
export function useSummary(
  month?: string,
  period: "day" | "month" | "year" = "month",
  dateStr?: string,
) {
  const [data, setData] = useState<TransactionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = month || currentMonth();
      setData(await fetchTransactionSummary(m, period, dateStr));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [month, period, dateStr]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

// Hook: budgets
export function useBudgets(month?: string) {
  const [data, setData] = useState<BudgetStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = month || currentMonth();
      setData(await fetchBudgets(m));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

// Hook: report
export function useReport(month?: string) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = month || currentMonth();
      setData(await fetchReport(m));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

// Hook: add transaction
export function useAddTransaction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (rawInput: string, date?: string, time?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await addTransaction(rawInput, date, time);
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
  const [initialLoad, setInitialLoad] = useState(true);

  const load = useCallback(async () => {
    if (initialLoad) setLoading(true);
    try {
      const newData = await fetchMonthlyTrend(count, period);
      setData(newData);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [count, period, initialLoad]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

// Hook: categories (merged backend + local)
export function useCategories() {
  const [data, setData] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetchCategories() as unknown as { categories: Category[] } | Category[];
      const list: Category[] = Array.isArray(raw) ? raw : (raw as { categories: Category[] }).categories || [];
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
