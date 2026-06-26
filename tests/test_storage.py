"""Tests for the storage module."""

import os
import tempfile
import unittest

from smart_ledger.models import Transaction, Budget, ExchangeRate, Category
from smart_ledger.storage import Storage


class TestStorage(unittest.TestCase):
    """Test SQLite storage operations."""

    def setUp(self):
        # Use a temporary database for each test
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.storage = Storage(db_path=self.tmp.name, seed_categories=False)

    def tearDown(self):
        self.storage.close()
        os.unlink(self.tmp.name)

    # ── Transactions ──────────────────────────────────────────────

    def test_add_and_get_transaction(self):
        txn = Transaction(date="2024-01-15", amount=-35.0, category="餐饮", subcategory="午餐",
                          description="午饭", raw_input="午饭35")
        txn = self.storage.add_transaction(txn)
        self.assertIsNotNone(txn.id)

        fetched = self.storage.get_transaction(txn.id)
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched.amount, -35.0)
        self.assertEqual(fetched.category, "餐饮")

    def test_get_transactions_by_month(self):
        self.storage.add_transaction(Transaction(date="2024-01-15", amount=-35.0, category="餐饮"))
        self.storage.add_transaction(Transaction(date="2024-01-20", amount=-50.0, category="交通"))
        self.storage.add_transaction(Transaction(date="2024-02-10", amount=-20.0, category="餐饮"))

        jan = self.storage.get_transactions(month="2024-01")
        self.assertEqual(len(jan), 2)

        feb = self.storage.get_transactions(month="2024-02")
        self.assertEqual(len(feb), 1)

    def test_get_transactions_by_category(self):
        self.storage.add_transaction(Transaction(date="2024-01-15", amount=-35.0, category="餐饮"))
        self.storage.add_transaction(Transaction(date="2024-01-20", amount=-50.0, category="交通"))

        food = self.storage.get_transactions(category="餐饮")
        self.assertEqual(len(food), 1)

    def test_get_transactions_by_keyword(self):
        self.storage.add_transaction(Transaction(date="2024-01-15", amount=-35.0, description="午饭"))
        self.storage.add_transaction(Transaction(date="2024-01-20", amount=-50.0, description="打车"))

        results = self.storage.get_transactions(keyword="午饭")
        self.assertEqual(len(results), 1)

    def test_delete_transaction(self):
        txn = self.storage.add_transaction(Transaction(date="2024-01-15", amount=-35.0))
        self.assertTrue(self.storage.delete_transaction(txn.id))
        self.assertIsNone(self.storage.get_transaction(txn.id))

    def test_update_transaction(self):
        txn = self.storage.add_transaction(Transaction(date="2024-01-15", amount=-35.0, category="餐饮"))
        txn.amount = -45.0
        txn.category = "交通"
        self.assertTrue(self.storage.update_transaction(txn))

        fetched = self.storage.get_transaction(txn.id)
        self.assertEqual(fetched.amount, -45.0)
        self.assertEqual(fetched.category, "交通")

    # ── Budgets ───────────────────────────────────────────────────

    def test_add_and_get_budget(self):
        b = Budget(category="餐饮", amount=2000.0, year=2024, month=1)
        b = self.storage.add_budget(b)
        self.assertIsNotNone(b.id)

        budgets = self.storage.get_budgets(2024, 1)
        self.assertEqual(len(budgets), 1)
        self.assertEqual(budgets[0].amount, 2000.0)

    def test_delete_budget(self):
        b = self.storage.add_budget(Budget(category="餐饮", amount=2000.0, year=2024, month=1))
        self.assertTrue(self.storage.delete_budget(b.id))
        self.assertEqual(len(self.storage.get_budgets(2024, 1)), 0)

    # ── Exchange Rates ────────────────────────────────────────────

    def test_add_and_get_exchange_rate(self):
        er = ExchangeRate(from_currency="CNY", to_currency="USD", rate=0.138, date="2024-01-15")
        er = self.storage.add_exchange_rate(er)
        self.assertIsNotNone(er.id)

        rates = self.storage.get_exchange_rates()
        self.assertEqual(len(rates), 1)

    def test_get_latest_rate(self):
        self.storage.add_exchange_rate(ExchangeRate(from_currency="CNY", to_currency="USD", rate=0.13, date="2024-01-01"))
        self.storage.add_exchange_rate(ExchangeRate(from_currency="CNY", to_currency="USD", rate=0.14, date="2024-01-15"))

        latest = self.storage.get_latest_rate("CNY", "USD")
        self.assertEqual(latest.rate, 0.14)

    # ── Categories ────────────────────────────────────────────────

    def test_add_and_get_category(self):
        cat = Category(name="餐饮", keywords="吃饭,午饭", icon="🍜")
        cat = self.storage.add_category(cat)
        self.assertIsNotNone(cat.id)

        cats = self.storage.get_categories()
        self.assertEqual(len(cats), 1)

    # ── Monthly Summary ───────────────────────────────────────────

    def test_monthly_summary(self):
        self.storage.add_transaction(Transaction(date="2024-01-15", amount=8000.0, category="工资"))
        self.storage.add_transaction(Transaction(date="2024-01-20", amount=-35.0, category="餐饮"))
        self.storage.add_transaction(Transaction(date="2024-01-25", amount=-50.0, category="交通"))

        summary = self.storage.get_monthly_summary(2024, 1)
        self.assertEqual(summary["total_income"], 8000.0)
        self.assertEqual(summary["total_expense"], 85.0)
        self.assertEqual(summary["net_saving"], 7915.0)
        self.assertEqual(len(summary["categories"]), 3)


if __name__ == "__main__":
    unittest.main()
