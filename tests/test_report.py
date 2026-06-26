"""Tests for the report module."""

import os
import tempfile
import unittest

from smart_ledger.models import Transaction, Budget
from smart_ledger.storage import Storage
from smart_ledger.report import ReportGenerator


class TestReportGenerator(unittest.TestCase):
    """Test monthly report generation."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.tmp.close()
        self.storage = Storage(db_path=self.tmp.name, seed_categories=False)
        self.report_gen = ReportGenerator(self.storage)

    def tearDown(self):
        self.storage.close()
        os.unlink(self.tmp.name)

    def test_empty_report(self):
        report = self.report_gen.generate(2024, 1)
        self.assertEqual(report["period"], "2024-01")
        self.assertEqual(report["summary"]["total_income"], 0)
        self.assertEqual(report["summary"]["total_expense"], 0)
        self.assertEqual(report["summary"]["net_saving"], 0)
        self.assertEqual(report["savings_rate"], 0)

    def test_report_with_data(self):
        # Add income
        self.storage.add_transaction(Transaction(date="2024-01-15", amount=10000.0, category="工资"))
        # Add expenses
        self.storage.add_transaction(Transaction(date="2024-01-20", amount=-2000.0, category="住房"))
        self.storage.add_transaction(Transaction(date="2024-01-22", amount=-1500.0, category="餐饮"))
        self.storage.add_transaction(Transaction(date="2024-01-25", amount=-500.0, category="交通"))

        report = self.report_gen.generate(2024, 1)

        self.assertEqual(report["summary"]["total_income"], 10000.0)
        self.assertEqual(report["summary"]["total_expense"], 4000.0)
        self.assertEqual(report["summary"]["net_saving"], 6000.0)
        self.assertEqual(report["savings_rate"], 60.0)

        # Top categories should be sorted by expense descending
        top = report["top_categories"]
        self.assertGreaterEqual(len(top), 3)
        # First three should be expense categories
        self.assertEqual(top[0]["category"], "住房")
        self.assertEqual(top[1]["category"], "餐饮")
        self.assertEqual(top[2]["category"], "交通")

    def test_report_has_advice(self):
        # Low savings scenario
        self.storage.add_transaction(Transaction(date="2024-01-15", amount=5000.0, category="工资"))
        self.storage.add_transaction(Transaction(date="2024-01-20", amount=-4500.0, category="住房"))

        report = self.report_gen.generate(2024, 1)
        self.assertGreater(len(report["advice"]), 0)

    def test_report_has_budget_status(self):
        # Set a budget
        self.storage.add_budget(Budget(category="餐饮", amount=2000.0, year=2024, month=1))
        self.storage.add_transaction(Transaction(date="2024-01-20", amount=-2500.0, category="餐饮"))

        report = self.report_gen.generate(2024, 1)
        self.assertGreater(len(report["budget_status"]), 0)
        self.assertEqual(report["budget_status"][0]["status"], "overspent")

    def test_report_anomaly_detection(self):
        # Previous month data
        self.storage.add_transaction(Transaction(date="2023-12-20", amount=-1000.0, category="餐饮"))
        # Current month: 3x increase
        self.storage.add_transaction(Transaction(date="2024-01-20", amount=-3000.0, category="餐饮"))

        report = self.report_gen.generate(2024, 1)
        anomalies = report["anomaly_detection"]
        # Should detect the 200% increase
        self.assertTrue(any(a["category"] == "餐饮" for a in anomalies))


if __name__ == "__main__":
    unittest.main()
