export interface Transaction {
  id: number;
  date: string;
  amount: number;
  currency: string;
  category: string;
  subcategory: string;
  description: string;
  raw_input: string;
  is_income: boolean;
  is_expense: boolean;
  abs_amount: number;
  created_at: string;
}

export interface TransactionSummary {
  month: string;
  total_income: number;
  total_expense: number;
  net_saving: number;
  txn_count: number;
  categories: CategorySummary[];
}

export interface CategorySummary {
  category: string;
  total_expense: number;
  total_income: number;
  txn_count: number;
}

export interface BudgetStatus {
  id?: number;
  category: string;
  budget: number;
  amount?: number;
  spent: number;
  remaining: number;
  usage_pct: number;
  status: "normal" | "warning" | "overspent";
  period?: string;
}

export interface Category {
  name: string;
  subcategories: string[];
}

export interface CurrencyData {
  currencies: Record<string, { name: string; symbol: string }>;
  rates: { from: string; to: string; rate: number; date: string }[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  action?: string;
  data?: any;
  timestamp?: string;
}

export interface ChatResponse {
  reply: string;
  action?: string;
  data?: any;
}

export interface SavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
  color: string;
  created_at: string;
  currencies: SavingsGoalCurrency[];
  stock_pnl?: number;
}

export interface SavingsGoalCurrency {
  id: number;
  goal_id: number;
  currency: string;
  amount: number;
}

export interface SavingsHistoryItem {
  id: number;
  goal_id: number;
  amount: number;
  recorded_at: string;
}

export interface HeatmapDay {
  date: string;
  total: number;
}

export interface RecurringTransaction {
  description: string;
  category: string;
  subcategory: string;
  frequency: number;
  avg_amount: number;
  first_seen: string;
  last_seen: string;
}

export interface StockHolding {
  id: number;
  ticker: string;
  name: string;
  buy_price: number;
  current_price: number;
  previous_close: number;
  quantity: number;
  buy_date: string;
  created_at: string;
  is_closed: boolean;
  sell_price: number;
  sell_date: string;
  cost: number;
  value: number;
  pnl: number;
  pnl_pct: number;
  daily_pnl: number;
  daily_pnl_pct: number;
  day_trade_pnl: number;
  total_pnl: number;
  day_trade_matched_buy_qty: number;
  day_trade_matched_sell_qty: number;
  effective_qty: number;
  effective_cost: number;
  realized_pnl?: number;
}

export interface DayTrade {
  id: number;
  ticker: string;
  trade_type: string;  // 'sell' or 'buy'
  price: number;
  quantity: number;
  trade_date: string;
  notes: string;
}

export interface Asset {
  id: number;
  name: string;
  category: string;
  subcategory: string;
  amount: number;
  is_investable: boolean;
  created_at: string;
  updated_at: string;
}

export interface Liability {
  id: number;
  name: string;
  category: string;
  subcategory: string;
  amount: number;
  interest_rate: number;
  monthly_payment: number;
  is_high_interest: boolean;
  created_at: string;
  updated_at: string;
}

export interface NetWorth {
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
}
