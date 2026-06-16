import type {
  Transaction,
  TransactionSummary,
  BudgetStatus,
  ReportData,
  Category,
  CurrencyData,
  ChatMessage,
  ChatResponse,
  SavingsGoal,
  SavingsGoalCurrency,
  SavingsHistoryItem,
  HeatmapDay,
  RecurringTransaction,
} from "./types";

const BASE = "/api";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ---- Transactions ----

export async function fetchTransactions(
  month?: string,
  category?: string
): Promise<Transaction[]> {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (category) params.set("category", category);
  const qs = params.toString();
  return request(`/transactions${qs ? `?${qs}` : ""}`);
}

export async function addTransaction(
  rawInput: string,
  date?: string,
  time?: string,
  type?: "expense" | "income",
  category?: string
): Promise<{ transaction: Transaction; alerts: string[] }> {
  return request("/transactions", {
    method: "POST",
    body: JSON.stringify({ raw_input: rawInput, date, time, type, category }),
  });
}

export async function deleteTransaction(id: number): Promise<void> {
  await request(`/transactions/${id}`, { method: "DELETE" });
}

export async function updateTransaction(
  id: number,
  data: {
    date: string;
    amount: number;
    currency?: string;
    category: string;
    subcategory?: string;
    description?: string;
    raw_input?: string;
  },
): Promise<void> {
  await request(`/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function fetchTransactionSummary(
  month?: string,
  period?: "day" | "month" | "year",
  dateStr?: string,
): Promise<TransactionSummary> {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (period === "day" && dateStr) params.set("day", dateStr);
  else if (period === "year" && dateStr) params.set("year", dateStr);
  else if (month) params.set("month", month);
  const qs = params.toString();
  return request(`/transactions/summary${qs ? `?${qs}` : ""}`);
}

export async function fetchAllTimeSummary(): Promise<TransactionSummary> {
  return request("/transactions/summary/all");
}

// ---- Budgets ----

export async function fetchBudgets(
  month?: string
): Promise<BudgetStatus[]> {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  const qs = params.toString();
  return request(`/budgets${qs ? `?${qs}` : ""}`);
}

export async function setBudget(
  category: string,
  amount: number,
  currency?: string,
  year?: number,
  month?: number,
  period?: string
): Promise<{ id: number; category: string; amount: number }> {
  return request("/budgets", {
    method: "POST",
    body: JSON.stringify({ category, amount, currency, year, month, period }),
  });
}

export async function deleteBudget(id: number): Promise<void> {
  await request(`/budgets/${id}`, { method: "DELETE" });
}

// ---- Report ----

export async function fetchReport(month?: string): Promise<ReportData> {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  const qs = params.toString();
  return request(`/report${qs ? `?${qs}` : ""}`);
}

// ---- Categories ----

export async function fetchCategories(): Promise<Category[]> {
  return request("/categories");
}

// ---- Currencies ----

export async function fetchCurrencies(): Promise<CurrencyData> {
  return request("/currencies");
}

// ---- Trend ----

export interface MonthlyTrendItem {
  month?: string;
  label?: string;
  income: number;
  expense: number;
}

export async function fetchMonthlyTrend(
  count = 6,
  period: "day" | "month" | "year" = "month"
): Promise<MonthlyTrendItem[]> {
  return request(`/transactions/trend?count=${count}&period=${period}`);
}

// ---- Search ----

export async function searchTransactions(
  q: string
): Promise<Transaction[]> {
  return request(`/search?q=${encodeURIComponent(q)}`);
}

// ---- Chat ----

export async function sendChatMessage(
  message: string,
  model?: string
): Promise<ChatResponse> {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify({ message, model }),
  });
}

export async function getChatHistory(
  limit = 50
): Promise<ChatMessage[]> {
  return request(`/chat/history?limit=${limit}`);
}

export async function clearChatHistory(): Promise<void> {
  await request("/chat/history", { method: "DELETE" });
}

// ---- Savings Goals ----

export async function fetchSavingsGoals(): Promise<SavingsGoal[]> {
  return request("/savings-goals");
}

export async function createSavingsGoal(
  goal: Omit<SavingsGoal, "id" | "created_at">
): Promise<SavingsGoal> {
  return request("/savings-goals", {
    method: "POST",
    body: JSON.stringify(goal),
  });
}

export async function updateSavingsGoal(
  id: number,
  goal: Partial<SavingsGoal>
): Promise<SavingsGoal> {
  return request(`/savings-goals/${id}`, {
    method: "PUT",
    body: JSON.stringify(goal),
  });
}

export async function deleteSavingsGoal(id: number): Promise<void> {
  await request(`/savings-goals/${id}`, { method: "DELETE" });
}

export async function fetchSavingsHistory(
  goalId: number
): Promise<SavingsHistoryItem[]> {
  return request(`/savings-goals/${goalId}/history`);
}

export async function addSavingsHistory(
  goalId: number,
  amount: number,
  recordedAt?: string
): Promise<void> {
  await request(`/savings-goals/${goalId}/history`, {
    method: "POST",
    body: JSON.stringify({ amount, recorded_at: recordedAt }),
  });
}

// ---- Savings Goal Currencies ----

export async function fetchSavingsGoalCurrencies(
  goalId: number
): Promise<SavingsGoalCurrency[]> {
  return request(`/savings-goals/${goalId}/currencies`);
}

export async function addSavingsGoalCurrency(
  goalId: number,
  currency: string,
  amount: number
): Promise<SavingsGoalCurrency> {
  return request(`/savings-goals/${goalId}/currencies`, {
    method: "POST",
    body: JSON.stringify({ currency, amount }),
  });
}

export async function updateSavingsGoalCurrency(
  goalId: number,
  id: number,
  currency: string,
  amount: number
): Promise<void> {
  await request(`/savings-goals/${goalId}/currencies/${id}`, {
    method: "PUT",
    body: JSON.stringify({ currency, amount }),
  });
}

export async function deleteSavingsGoalCurrency(
  goalId: number,
  id: number
): Promise<void> {
  await request(`/savings-goals/${goalId}/currencies/${id}`, {
    method: "DELETE",
  });
}

// ---- Exchange Rates ----

export async function fetchExchangeRates(
  base = "CNY"
): Promise<Record<string, number>> {
  const res = await request<{ base: string; rates: Record<string, number> }>(
    `/exchange-rates?base=${base}`
  );
  return res.rates;
}

// ---- Heatmap ----

export async function fetchHeatmap(year?: number): Promise<HeatmapDay[]> {
  const params = year ? `?year=${year}` : "";
  return request(`/heatmap${params}`);
}

// ---- Recurring ----

export async function fetchRecurring(): Promise<RecurringTransaction[]> {
  return request("/recurring");
}

// ---- Export ----

export function getExportCSVUrl(month?: string): string {
  const params = month ? `?month=${month}` : "";
  return `/api/export/csv${params}`;
}

export function getExportJSONUrl(month?: string): string {
  const params = month ? `?month=${month}` : "";
  return `/api/export/json${params}`;
}

// ---- Config ----

export async function getApiKey(): Promise<{ api_key: string; configured: boolean }> {
  return request("/config/api-key");
}

export async function updateApiKey(apiKey: string): Promise<{ status: string }> {
  return request("/config/api-key", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
}
