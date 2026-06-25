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
  StockHolding,
  Asset,
  Liability,
  NetWorth,
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

// ---- Stock Holdings ----

export async function fetchStockHoldings(): Promise<StockHolding[]> {
  return request("/stocks");
}

export interface StockSearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

export async function searchStocks(query: string): Promise<StockSearchResult[]> {
  return request(`/stocks/search?q=${encodeURIComponent(query)}`);
}

export async function addStockHolding(
  ticker: string,
  name: string,
  buyPrice: number,
  quantity: number,
  buyDate: string
): Promise<StockHolding> {
  return request("/stocks", {
    method: "POST",
    body: JSON.stringify({
      ticker,
      name,
      buy_price: buyPrice,
      quantity,
      buy_date: buyDate,
    }),
  });
}

export async function deleteStockHolding(id: number): Promise<void> {
  await request(`/stocks/${id}`, { method: "DELETE" });
}

export async function refreshStockPrices(): Promise<StockHolding[]> {
  return request("/stocks/refresh", { method: "POST" });
}

// ---- Assets & Liabilities ----

export async function fetchAssets(): Promise<Asset[]> {
  return request("/assets");
}

export async function addAsset(
  name: string,
  category: string,
  amount: number,
  subcategory?: string
): Promise<Asset> {
  return request("/assets", {
    method: "POST",
    body: JSON.stringify({ name, category, subcategory, amount }),
  });
}

export async function updateAsset(
  id: number,
  data: { name?: string; category?: string; subcategory?: string; amount?: number; is_investable?: boolean }
): Promise<Asset> {
  return request(`/assets/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteAsset(id: number): Promise<void> {
  await request(`/assets/${id}`, { method: "DELETE" });
}

export async function fetchLiabilities(): Promise<Liability[]> {
  return request("/liabilities");
}

export async function addLiability(
  name: string,
  category: string,
  amount: number,
  interestRate: number,
  subcategory?: string,
  monthlyPayment?: number
): Promise<Liability> {
  return request("/liabilities", {
    method: "POST",
    body: JSON.stringify({ name, category, subcategory, amount, interest_rate: interestRate, monthly_payment: monthlyPayment }),
  });
}

export async function updateLiability(
  id: number,
  data: { name?: string; category?: string; subcategory?: string; amount?: number; interest_rate?: number; monthly_payment?: number; is_high_interest?: boolean }
): Promise<Liability> {
  return request(`/liabilities/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteLiability(id: number): Promise<void> {
  await request(`/liabilities/${id}`, { method: "DELETE" });
}

export async function fetchNetWorth(): Promise<NetWorth> {
  return request("/net-worth");
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

// ---- Analysis (FIRE Dashboard) ----

export interface FireData {
  target: number;
  current_assets: number;
  progress_pct: number;
  annual_expenses: number;
  fire_number: number;
  remaining: number;
  monthly_avg_saving: number;
  estimated_years: number;
  estimated_date: string;
  savings_rate: number;
  savings_per_expense: number;
  emergency_fund_months: number;
  net_worth: number;
  investable_assets: number;
}

export interface FlowMetrics {
  monthly_income: number;
  monthly_expense: number;
  monthly_net_saving: number;
  savings_rate: number;
  savings_per_expense: number;
}

export interface StockMetrics {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  investable_assets: number;
  net_financial_assets: number;
  asset_growth_rate: number;
  investable_ratio: number;
  debt_ratio: number;
  debt_to_income: number;
}

export interface AssetAllocationItem {
  category: string;
  amount: number;
  percentage: number;
  is_investable: boolean;
}

export interface LiabilityBreakdownItem {
  category: string;
  amount: number;
  percentage: number;
  is_high_interest: boolean;
}

export interface AssetGrowthPoint {
  month: string;
  actual: number;
  target_optimistic: number;
  target_baseline: number;
  target_conservative: number;
}

export interface MonthlySavingTrend {
  month: string;
  saving: number;
  target: number;
}

export interface ExpenseBreakdownItem {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface IncomeBreakdownItem {
  category: string;
  amount: number;
  percentage: number;
}

export interface InvestmentPortfolio {
  a_shares: { value: number; pnl: number; pnl_pct: number };
  us_stocks: { value: number; pnl: number; pnl_pct: number };
  cash: number;
  total_return_pct: number;
  allocation: { type: string; percentage: number; color: string }[];
}

export interface CurrentMonthData {
  income: number;
  expense: number;
  net_saving: number;
  savings_rate: number;
}

export interface AnalysisData {
  fire: FireData;
  flow_metrics: FlowMetrics;
  stock_metrics: StockMetrics;
  asset_allocation: AssetAllocationItem[];
  liability_breakdown: LiabilityBreakdownItem[];
  asset_growth: AssetGrowthPoint[];
  monthly_saving_trend: MonthlySavingTrend[];
  expense_breakdown: ExpenseBreakdownItem[];
  income_breakdown: IncomeBreakdownItem[];
  investment_portfolio: InvestmentPortfolio;
  current_month: CurrentMonthData;
}

export async function fetchAnalysis(): Promise<AnalysisData> {
  return request("/analysis");
}

export async function updateFireGoal(params: {
  target_amount?: number;
  annual_return_pct?: number;
}): Promise<{ ok: boolean }> {
  return request("/fire/goal", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
