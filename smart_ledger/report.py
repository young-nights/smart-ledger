"""Monthly report generator for Smart Ledger."""

from datetime import datetime
from typing import Dict, Any, List

from .storage import Storage
from .budget import BudgetManager
from .advisor import FinancialAdvisor


class ReportGenerator:
    """Generate comprehensive monthly financial reports."""

    def __init__(self, storage: Storage):
        self.storage = storage
        self.budget_mgr = BudgetManager(storage)
        self.advisor = FinancialAdvisor()

    def generate(self, year: int, month: int) -> Dict[str, Any]:
        """Generate a full monthly report.

        Returns:
            {
                period: "YYYY-MM",
                summary: { total_income, total_expense, net_saving },
                savings_rate: float,
                top_categories: [...],  # top 5 by expense
                budget_status: [...],
                anomaly_detection: [...],
                advice: [...],
            }
        """
        summary = self.storage.get_monthly_summary(year, month)
        total_income = summary["total_income"]
        total_expense = summary["total_expense"]
        net_saving = summary["net_saving"]

        # Savings rate
        savings_rate = (net_saving / total_income * 100) if total_income > 0 else 0.0

        # Top 5 expense categories
        categories = summary.get("categories", [])
        top_categories = sorted(categories, key=lambda c: c["total_expense"], reverse=True)[:5]

        # Budget status
        budget_status = self.budget_mgr.get_budgets(year, month)
        budget_alerts = self.budget_mgr.check_budget_alerts()

        # Anomaly detection: compare with previous month
        anomalies = self._detect_anomalies(year, month, categories)

        # Financial advice
        advice = self.advisor.get_advice(summary)

        return {
            "period": f"{year:04d}-{month:02d}",
            "summary": {
                "total_income": total_income,
                "total_expense": total_expense,
                "net_saving": net_saving,
            },
            "savings_rate": round(savings_rate, 1),
            "top_categories": top_categories,
            "budget_status": budget_status,
            "budget_alerts": budget_alerts,
            "anomaly_detection": anomalies,
            "advice": advice,
        }

    def _detect_anomalies(self, year: int, month: int, current_categories: List[Dict]) -> List[Dict[str, Any]]:
        """Detect anomalies by comparing with previous month's spending."""
        anomalies: List[Dict[str, Any]] = []

        # Calculate previous month
        if month == 1:
            prev_year, prev_month = year - 1, 12
        else:
            prev_year, prev_month = year, month - 1

        prev_summary = self.storage.get_monthly_summary(prev_year, prev_month)
        prev_cats = {c["category"]: c for c in prev_summary.get("categories", [])}

        for cat_data in current_categories:
            cat = cat_data["category"]
            current_expense = cat_data["total_expense"]
            prev_expense = prev_cats.get(cat, {}).get("total_expense", 0)

            if prev_expense > 0:
                change_pct = ((current_expense - prev_expense) / prev_expense) * 100
                if abs(change_pct) >= 50:
                    anomalies.append({
                        "category": cat,
                        "current_expense": current_expense,
                        "previous_expense": prev_expense,
                        "change_pct": round(change_pct, 1),
                        "direction": "increase" if change_pct > 0 else "decrease",
                        "message": (
                            f"📊 {cat}: {'increased' if change_pct > 0 else 'decreased'} "
                            f"{abs(change_pct):.0f}% month-over-month"
                        ),
                    })
            elif current_expense > 0:
                # New category with no prior spending
                anomalies.append({
                    "category": cat,
                    "current_expense": current_expense,
                    "previous_expense": 0,
                    "change_pct": 100.0,
                    "direction": "new",
                    "message": f"🆕 {cat}: new spending category this month ({current_expense:.0f})",
                })

        return anomalies
