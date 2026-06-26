"""Budget management for Smart Ledger."""

from datetime import datetime
from typing import List, Dict, Any, Optional

from .models import Budget
from .storage import Storage


class BudgetManager:
    """Manage monthly budgets and alert on overspending."""

    def __init__(self, storage: Storage):
        self.storage = storage

    def set_budget(self, category: str, amount: float, currency: str = "CNY",
                   year: Optional[int] = None, month: Optional[int] = None,
                   period: str = "month") -> Budget:
        """Set or update a budget for a category."""
        now = datetime.now()
        year = year or now.year
        month = month or now.month

        budget = Budget(
            category=category,
            amount=amount,
            currency=currency,
            year=year,
            month=month,
            period=period,
        )
        return self.storage.add_budget(budget)

    def get_budgets(self, year: int, month: int) -> List[Dict[str, Any]]:
        """Return budgets with usage percentage and status."""
        # Get all budgets (not filtered by period)
        budgets = self.storage.get_all_budgets()

        result = []
        for b in budgets:
            # Calculate actual expense based on period
            if b.period == "day":
                # Get today's expense
                today = datetime.now().strftime("%Y-%m-%d")
                actual = self._get_category_expense_for_date(b.category, today)
            elif b.period == "month":
                # Get this month's expense
                actual = self._get_category_expense_for_month(b.category, year, month)
            elif b.period == "year":
                # Get this year's expense
                actual = self._get_category_expense_for_year(b.category, year)
            else:  # "all"
                if b.category == "ALL":
                    cur = self.storage.conn.cursor()
                    cur.execute(
                        "SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE amount < 0"
                    )
                    actual = cur.fetchone()[0]
                else:
                    actual = self.storage.get_category_total_expense(b.category)
            usage_pct = (actual / b.amount * 100) if b.amount > 0 else 0.0

            # Determine status
            if usage_pct >= 100:
                status = "overspent"
            elif usage_pct >= 80:
                status = "warning"
            else:
                status = "ok"

            result.append({
                **b.to_dict(),
                "spent": actual,
                "remaining": b.amount - actual,
                "usage_pct": round(usage_pct, 1),
                "status": "normal" if status == "ok" else status,
            })

        return result

    def delete_budget(self, budget_id: int) -> bool:
        """Delete a budget by ID."""
        return self.storage.delete_budget(budget_id)

    def _get_category_expense_for_date(self, category: str, date: str) -> float:
        """Get total expense for a category on a specific date."""
        cur = self.storage.conn.cursor()
        if category == "ALL":
            cur.execute(
                "SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE date = ? AND amount < 0",
                (date,),
            )
        else:
            cur.execute(
                "SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE category = ? AND date = ? AND amount < 0",
                (category, date),
            )
        return cur.fetchone()[0]

    def _get_category_expense_for_month(self, category: str, year: int, month: int) -> float:
        """Get total expense for a category in a specific month."""
        cur = self.storage.conn.cursor()
        if category == "ALL":
            cur.execute(
                "SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ? AND amount < 0",
                (str(year), f"{month:02d}"),
            )
        else:
            cur.execute(
                "SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE category = ? AND strftime('%Y', date) = ? AND strftime('%m', date) = ? AND amount < 0",
                (category, str(year), f"{month:02d}"),
            )
        return cur.fetchone()[0]

    def _get_category_expense_for_year(self, category: str, year: int) -> float:
        """Get total expense for a category in a specific year."""
        cur = self.storage.conn.cursor()
        if category == "ALL":
            cur.execute(
                "SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE strftime('%Y', date) = ? AND amount < 0",
                (str(year),),
            )
        else:
            cur.execute(
                "SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE category = ? AND strftime('%Y', date) = ? AND amount < 0",
                (category, str(year)),
            )
        return cur.fetchone()[0]

    def check_budget_alerts(self) -> List[Dict[str, Any]]:
        """Check current month budgets and return alerts for those nearing or exceeding limits."""
        now = datetime.now()
        budgets_with_usage = self.get_budgets(now.year, now.month)

        alerts = []
        for b in budgets_with_usage:
            if b["status"] in ("warning", "overspent"):
                alerts.append({
                    "budget_id": b["id"],
                    "category": b["category"],
                    "budget_amount": b["amount"],
                    "actual_expense": b["spent"],
                    "usage_pct": b["usage_pct"],
                    "status": b["status"],
                    "message": (
                        f"⚠️ {b['category']} budget {b['usage_pct']}% used "
                        f"({b['spent']:.0f}/{b['amount']:.0f})"
                        if b["status"] == "warning"
                        else f"🚨 {b['category']} budget exceeded! "
                             f"({b['spent']:.0f}/{b['amount']:.0f})"
                    ),
                })

        return alerts
