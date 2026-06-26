import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Budgets from "./pages/Budgets";
import SavingsGoals from "./pages/SavingsGoals";
import Heatmap from "./pages/Heatmap";
import StockPortfolio from "./pages/StockPortfolio";
import Chat from "./pages/Chat";
import Analysis from "./pages/Analysis";
import Assets from "./pages/Assets";
export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/savings" element={<SavingsGoals />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/heatmap" element={<Heatmap />} />
          <Route path="/stocks" element={<StockPortfolio />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
