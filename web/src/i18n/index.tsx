/**
 * i18n — Internationalization module for Smart Ledger.
 * Uses React Context for shared locale state across the app.
 */

import { useState, useCallback, useContext, createContext, type ReactNode } from "react";

export type Locale = "zh" | "en";

// Translation dictionaries
const translations: Record<Locale, Record<string, string>> = {
  zh: {
    // Navigation
    "nav.dashboard": "Dashboard",
    "nav.transactions": "记账",
    "nav.budgets": "预算",
    "nav.savings": "储蓄目标",
    "nav.heatmap": "消费热力图",
    "nav.stocks": "持仓",
    "nav.chat": "AI 助手",
    "nav.analysis": "财务分析",

    // Dashboard
    "dashboard.income": "总收入",
    "dashboard.expense": "总支出",
    "dashboard.saving": "总储蓄",
    "dashboard.savingRate": "储蓄率",
    "dashboard.trend": "月度趋势",
    "dashboard.spending": "消费结构",
    "dashboard.byCategory": "分类支出",
    "dashboard.recent": "最近交易",
    "dashboard.goals": "储蓄目标",

    // Transactions
    "txn.title": "记账",
    "txn.add": "添加",
    "txn.placeholder": "输入记账内容... 例如: 午饭35",
    "txn.hint": "支持自然语言输入，如「午饭35」「打车28块」「工资8000」",
    "txn.list": "本月交易",
  "txn.all": "全部交易",
    "txn.empty": "暂无交易记录",
    "txn.date": "日期",
    "txn.category": "分类",
    "txn.desc": "描述",
    "txn.amount": "金额",
    "txn.alerts": "预算提醒",
    "txn.budgetAlerts": "预算提醒",

    // Budget
    "budget.title": "预算管理",
    "budget.monthly": "月总预算",
    "budget.add": "添加预算",
    "budget.category": "分类",
    "budget.categoryBudgets": "分类预算",
    "budget.amount": "金额",
    "budget.save": "保存",
    "budget.remaining": "剩余",
    "budget.normal": "正常",
    "budget.warning": "预警",
    "budget.overspent": "超支",
    "budget.empty": "暂无分类预算",
    "budget.totalBudget": "总预算",

    // Savings Goals
    "savings.title": "储蓄目标",
    "savings.add": "新建目标",
    "savings.target": "目标金额",
    "savings.current": "当前进度",
    "savings.deadline": "截止日期",
    "savings.monthly": "每月需存",
    "savings.empty": "暂无储蓄目标",
    "savings.complete": "已达成！",
    "savings.goalName": "目标名称",
    "savings.currentAmount": "当前金额",
    "savings.editGoal": "编辑目标",
    "savings.newGoal": "新建储蓄目标",
    "savings.create": "创建",
    "savings.update": "更新",
    "savings.cancel": "取消",
    "savings.noGoals": "暂无储蓄目标，创建一个开始追踪！",
    "savings.need": "需存",
    "savings.perMonth": "/月",
    "savings.color": "颜色",

    // Heatmap
    "heatmap.title": "消费热力图",
    "heatmap.clickDay": "点击查看当天交易",
    "heatmap.total": "总消费",
    "heatmap.avg": "日均",
    "heatmap.peak": "最高单日",
    "heatmap.less": "少",
    "heatmap.more": "多",
    "heatmap.txnOn": "交易记录 - ",
    "heatmap.noTxnOnDay": "当天无交易记录",

    // Report
    "report.title": "月度财务报告",
    "report.income": "总收入",
    "report.expense": "总支出",
    "report.saving": "净储蓄",
    "report.rate": "储蓄率",
    "report.advice": "理财建议",
    "report.anomaly": "异常提醒",
    "report.budget": "预算执行",
    "report.anomalies": "消费异常",
    "report.financialAdvice": "理财建议",
    "report.noReport": "暂无报告数据",

    // Stock Portfolio
    "stocks.title": "股票持仓",
    "stocks.add": "添加持仓",
    "stocks.ticker": "股票代码",
    "stocks.name": "股票名称",
    "stocks.buyPrice": "买入价",
    "stocks.currentPrice": "当前价",
    "stocks.quantity": "持仓数量",
    "stocks.buyDate": "买入日期",
    "stocks.pnl": "盈亏",
    "stocks.pnlPct": "盈亏%",
    "stocks.cost": "成本",
    "stocks.value": "市值",
    "stocks.totalAssets": "总资产",
    "stocks.totalPnl": "总盈亏",
    "stocks.refresh": "刷新价格",
    "stocks.refreshing": "刷新中...",
    "stocks.empty": "暂无持仓，添加一只股票开始追踪！",
    "stocks.confirmDelete": "确定删除该持仓？",
    "stocks.addSuccess": "持仓已添加",
    "stocks.deleteSuccess": "持仓已删除",
    "stocks.refreshSuccess": "价格已更新",
    "stocks.tickerPlaceholder": "如 AAPL、600519.SS",
    "stocks.namePlaceholder": "如 苹果",

    // Chat
    "chat.title": "AI 小账助手",
    "chat.placeholder": "输入消息",
    "chat.send": "发送",
    "chat.clear": "清空",
    "chat.loading": "思考中...",
    "chat.welcome": "你好！我是小账，你的 AI 财务助手。",
    "chat.hint": "试试说「午饭35」或点击上方快捷命令",
    "chat.cmd.record": "记账",
    "chat.cmd.query": "查询",
    "chat.cmd.budget": "预算",
    "chat.cmd.report": "报告",
    "chat.cmd.advice": "建议",

    // Common
    "common.loading": "加载中...",
    "common.empty": "暂无数据",
    "common.save": "保存",
    "common.cancel": "取消",
    "common.delete": "删除",
    "common.edit": "编辑",
    "common.confirm": "确认",
    "common.export": "导出",
    "common.search": "搜索交易...",
    "common.theme": "主题",
    "common.dark": "深色",
    "common.light": "浅色",
    "common.system": "跟随系统",
    "common.noData": "暂无数据",
    "common.transactions": "笔交易",
    "common.noTransactions": "暂无交易记录",
    "common.budgetAlerts": "预算提醒",
  },
  en: {
    // Navigation
    "nav.dashboard": "Dashboard",
    "nav.transactions": "Transactions",
    "nav.budgets": "Budgets",
    "nav.savings": "Savings Goals",
    "nav.heatmap": "Spending Map",
    "nav.stocks": "Stocks",
    "nav.chat": "AI Assistant",
    "nav.analysis": "Analysis",

    // Dashboard
    "dashboard.income": "Total Income",
    "dashboard.expense": "Total Expense",
    "dashboard.saving": "Net Saving",
    "dashboard.savingRate": "Saving Rate",
    "dashboard.trend": "Monthly Expense Trend",
    "dashboard.spending": "Spending Structure",
    "dashboard.byCategory": "Category Spending",
    "dashboard.recent": "Recent Transactions",
    "dashboard.goals": "Savings Goals",

    // Transactions
    "txn.title": "Transactions",
    "txn.add": "Add",
    "txn.placeholder": "Record a transaction... e.g. lunch 35",
    "txn.hint": "Supports natural language input, e.g. \"lunch 35\", \"taxi 28\", \"salary 8000\"",
    "txn.list": "This Month",
  "txn.all": "All Transactions",
    "txn.empty": "No transactions yet",
    "txn.date": "Date",
    "txn.category": "Category",
    "txn.desc": "Description",
    "txn.amount": "Amount",
    "txn.alerts": "Budget Alerts",
    "txn.budgetAlerts": "Budget Alerts",

    // Budget
    "budget.title": "Budget Management",
    "budget.monthly": "Monthly Budget",
    "budget.add": "Add Budget",
    "budget.category": "Category",
    "budget.categoryBudgets": "Category Budgets",
    "budget.amount": "Amount",
    "budget.save": "Save",
    "budget.remaining": "Remaining",
    "budget.normal": "Normal",
    "budget.warning": "Warning",
    "budget.overspent": "Overspent",
    "budget.empty": "No category budgets yet",
    "budget.totalBudget": "Total Budget",

    // Savings Goals
    "savings.title": "Savings Goals",
    "savings.add": "New Goal",
    "savings.target": "Target Amount",
    "savings.current": "Current Progress",
    "savings.deadline": "Deadline",
    "savings.monthly": "Monthly Needed",
    "savings.empty": "No savings goals yet",
    "savings.complete": "Goal reached!",
    "savings.goalName": "Goal Name",
    "savings.currentAmount": "Current Amount",
    "savings.editGoal": "Edit Goal",
    "savings.newGoal": "New Savings Goal",
    "savings.create": "Create",
    "savings.update": "Update",
    "savings.cancel": "Cancel",
    "savings.noGoals": "No savings goals yet. Create one to start tracking!",
    "savings.need": "Need",
    "savings.perMonth": "/mo",
    "savings.color": "Color",

    // Heatmap
    "heatmap.title": "Spending Heatmap",
    "heatmap.clickDay": "Click to view transactions",
    "heatmap.total": "Total",
    "heatmap.avg": "Daily Avg",
    "heatmap.peak": "Peak Day",
    "heatmap.less": "Less",
    "heatmap.more": "More",
    "heatmap.txnOn": "Transactions on ",
    "heatmap.noTxnOnDay": "No transactions on this day",

    // Report
    "report.title": "Monthly Financial Report",
    "report.income": "Total Income",
    "report.expense": "Total Expenses",
    "report.saving": "Net Savings",
    "report.rate": "Savings Rate",
    "report.advice": "Financial Advice",
    "report.anomaly": "Anomalies",
    "report.budget": "Budget Execution",
    "report.anomalies": "Spending Anomalies",
    "report.financialAdvice": "Financial Advice",
    "report.noReport": "No report data yet",

    // Stock Portfolio
    "stocks.title": "Stock Portfolio",
    "stocks.add": "Add Holding",
    "stocks.ticker": "Ticker",
    "stocks.name": "Name",
    "stocks.buyPrice": "Buy Price",
    "stocks.currentPrice": "Current Price",
    "stocks.quantity": "Quantity",
    "stocks.buyDate": "Buy Date",
    "stocks.pnl": "P&L",
    "stocks.pnlPct": "P&L %",
    "stocks.cost": "Cost",
    "stocks.value": "Value",
    "stocks.totalAssets": "Total Assets",
    "stocks.totalPnl": "Total P&L",
    "stocks.refresh": "Refresh Prices",
    "stocks.refreshing": "Refreshing...",
    "stocks.empty": "No holdings yet. Add a stock to start tracking!",
    "stocks.confirmDelete": "Delete this holding?",
    "stocks.addSuccess": "Holding added",
    "stocks.deleteSuccess": "Holding deleted",
    "stocks.refreshSuccess": "Prices updated",
    "stocks.tickerPlaceholder": "e.g. AAPL, 600519.SS",
    "stocks.namePlaceholder": "e.g. Apple",

    // Chat
    "chat.title": "AI Finance Assistant",
    "chat.placeholder": "Type a message",
    "chat.send": "Send",
    "chat.clear": "Clear",
    "chat.loading": "Thinking...",
    "chat.welcome": "Hello! I'm your AI financial assistant.",
    "chat.hint": "Try saying \"lunch 35\" or click a quick command above",
    "chat.cmd.record": "Record",
    "chat.cmd.query": "Query",
    "chat.cmd.budget": "Budget",
    "chat.cmd.report": "Report",
    "chat.cmd.advice": "Advice",

    // Common
    "common.loading": "Loading...",
    "common.empty": "No data yet",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.confirm": "Confirm",
    "common.export": "Export",
    "common.search": "Search transactions...",
    "common.theme": "Theme",
    "common.dark": "Dark",
    "common.light": "Light",
    "common.system": "System",
    "common.noData": "No data yet",
    "common.transactions": "transactions",
    "common.noTransactions": "No transactions yet",
    "common.budgetAlerts": "Budget Alerts",

    // Analysis
    "analysis.title": "Financial Analysis",
    "analysis.monthlyComparison": "Monthly Income vs Expense",
    "analysis.categoryBreakdown": "Expense by Category",
    "analysis.savingsTrend": "Savings Rate Trend",
    "analysis.vsLastMonth": "vs Last Month",
    "analysis.income": "Income",
    "analysis.expense": "Expense",
    "analysis.savings": "Net Savings",
    "analysis.current": "This Month",
    "analysis.previous": "Last Month",
    "analysis.noData": "No data yet",
  },
};

// Context shape
interface I18nContextValue {
  t: (key: string) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// Provider component
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    return (localStorage.getItem("smart-ledger-locale") as Locale) || "zh";
  });

  const t = useCallback(
    (key: string): string => {
      return translations[locale]?.[key] || translations.zh[key] || key;
    },
    [locale]
  );

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("smart-ledger-locale", newLocale);
  }, []);

  const toggleLocale = useCallback(() => {
    const newLocale = locale === "zh" ? "en" : "zh";
    setLocaleState(newLocale);
    localStorage.setItem("smart-ledger-locale", newLocale);
  }, [locale]);

  return (
    <I18nContext.Provider value={{ t, locale, setLocale, toggleLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

// Hook to consume the i18n context
export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return ctx;
}
