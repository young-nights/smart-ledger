"""Financial advice engine for Smart Ledger."""

from typing import Dict, Any, List


class FinancialAdvisor:
    """Generate personalized financial advice based on spending data."""

    # Ideal savings rate thresholds
    SAVINGS_EXCELLENT = 30  # >= 30%
    SAVINGS_GOOD = 20       # >= 20%
    SAVINGS_FAIR = 10       # >= 10%

    # Category-specific thresholds (% of total expense)
    CATEGORY_ALERT_PCT = 40  # Single category > 40% is concerning

    def get_advice(self, summary_data: Dict[str, Any]) -> List[Dict[str, str]]:
        """Analyze summary data and return actionable advice.

        Args:
            summary_data: Output of Storage.get_monthly_summary().

        Returns:
            List of { type, priority, message } dicts.
        """
        advice: List[Dict[str, str]] = []
        total_income = summary_data.get("total_income", 0)
        total_expense = summary_data.get("total_expense", 0)
        net_saving = summary_data.get("net_saving", 0)
        categories = summary_data.get("categories", [])

        # 1. Savings rate analysis
        advice.extend(self._analyze_savings(total_income, net_saving))

        # 2. Category spending analysis
        if total_expense > 0:
            advice.extend(self._analyze_categories(categories, total_expense))

        # 3. Expense-to-income ratio
        advice.extend(self._analyze_ratio(total_income, total_expense))

        return advice

    def _analyze_savings(self, income: float, saving: float) -> List[Dict[str, str]]:
        """Analyze savings rate and give advice."""
        result: List[Dict[str, str]] = []
        if income <= 0:
            return result

        rate = (saving / income) * 100

        if rate >= self.SAVINGS_EXCELLENT:
            result.append({
                "type": "savings",
                "priority": "info",
                "message": f"🌟 Great job! Your savings rate is {rate:.0f}%. Keep it up!",
            })
        elif rate >= self.SAVINGS_GOOD:
            result.append({
                "type": "savings",
                "priority": "info",
                "message": f"👍 Good savings rate of {rate:.0f}%. Aim for 30%+ for financial freedom.",
            })
        elif rate >= self.SAVINGS_FAIR:
            result.append({
                "type": "savings",
                "priority": "warning",
                "message": f"⚠️ Savings rate is only {rate:.0f}%. Try to cut discretionary spending to reach 20%.",
            })
        else:
            result.append({
                "type": "savings",
                "priority": "critical",
                "message": f"🚨 Savings rate is {rate:.0f}% — dangerously low. Review all non-essential expenses.",
            })

        return result

    def _analyze_categories(self, categories: List[Dict], total_expense: float) -> List[Dict[str, str]]:
        """Flag categories that consume too large a share of expenses."""
        result: List[Dict[str, str]] = []

        for cat_data in categories:
            cat = cat_data.get("category", "")
            expense = cat_data.get("total_expense", 0)
            if total_expense > 0:
                pct = (expense / total_expense) * 100
                if pct >= self.CATEGORY_ALERT_PCT:
                    result.append({
                        "type": "category",
                        "priority": "warning",
                        "message": (
                            f"⚠️ {cat} accounts for {pct:.0f}% of total spending. "
                            f"Consider if there are ways to reduce it."
                        ),
                    })

        return result

    def _analyze_ratio(self, income: float, expense: float) -> List[Dict[str, str]]:
        """Analyze expense-to-income ratio."""
        result: List[Dict[str, str]] = []

        if income <= 0:
            return result

        ratio = (expense / income) * 100

        if ratio > 100:
            result.append({
                "type": "ratio",
                "priority": "critical",
                "message": f"🚨 You're spending {ratio:.0f}% of your income — you're going into debt!",
            })
        elif ratio > 90:
            result.append({
                "type": "ratio",
                "priority": "warning",
                "message": f"⚠️ Spending {ratio:.0f}% of income. Very thin margin — build an emergency fund.",
            })
        elif ratio > 70:
            result.append({
                "type": "ratio",
                "priority": "info",
                "message": f"💡 Spending {ratio:.0f}% of income. Room for improvement — aim for under 70%.",
            })

        return result
