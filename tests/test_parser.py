"""Tests for the parser module."""

import unittest
from datetime import datetime

from smart_ledger.parser import parse_input, parse_query_params


class TestParseInput(unittest.TestCase):
    """Test natural language transaction parsing."""

    def test_simple_expense(self):
        txn = parse_input("午饭35")
        self.assertEqual(txn.amount, -35.0)
        self.assertEqual(txn.category, "餐饮")
        self.assertEqual(txn.subcategory, "午餐")

    def test_expense_with_yuan(self):
        txn = parse_input("早饭12元")
        self.assertEqual(txn.amount, -12.0)
        self.assertEqual(txn.category, "餐饮")

    def test_expense_with_kuai(self):
        txn = parse_input("打车25块")
        self.assertEqual(txn.amount, -25.0)
        self.assertEqual(txn.category, "交通")

    def test_income(self):
        txn = parse_input("收到工资8000")
        self.assertEqual(txn.amount, 8000.0)
        self.assertIn("工资", txn.category)

    def test_income_bonus(self):
        txn = parse_input("奖金5000")
        self.assertEqual(txn.amount, 5000.0)
        self.assertEqual(txn.category, "奖金")

    def test_date_yesterday(self):
        txn = parse_input("昨天午饭35")
        from datetime import timedelta
        expected = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        self.assertEqual(txn.date, expected)

    def test_date_today(self):
        txn = parse_input("今天咖啡15")
        self.assertEqual(txn.date, datetime.now().strftime("%Y-%m-%d"))

    def test_date_specific(self):
        txn = parse_input("2024-01-15 午饭30")
        self.assertEqual(txn.date, "2024-01-15")

    def test_date_md_format(self):
        txn = parse_input("3月8日 买花200")
        self.assertEqual(txn.date, f"{datetime.now().year}-03-08")

    def test_decimal_amount(self):
        txn = parse_input("咖啡15.5")
        self.assertEqual(txn.amount, -15.5)

    def test_yuan_sign(self):
        txn = parse_input("午饭¥25")
        self.assertEqual(txn.amount, -25.0)

    def test_dollar_sign(self):
        txn = parse_input("lunch $12")
        self.assertEqual(txn.amount, -12.0)

    def test_empty_input(self):
        txn = parse_input("")
        self.assertEqual(txn.amount, 0.0)

    def test_no_amount(self):
        txn = parse_input("吃饭了")
        self.assertEqual(txn.amount, 0.0)

    def test_category_transport(self):
        txn = parse_input("地铁5")
        self.assertEqual(txn.category, "交通")

    def test_category_shopping(self):
        txn = parse_input("买衣服200")
        self.assertEqual(txn.category, "购物")

    def test_category_housing(self):
        txn = parse_input("房租3000")
        self.assertEqual(txn.category, "住房")

    def test_category_entertainment(self):
        txn = parse_input("电影50")
        self.assertEqual(txn.category, "娱乐")

    def test_category_medical(self):
        txn = parse_input("看病200")
        self.assertEqual(txn.category, "医疗")

    def test_raw_input_preserved(self):
        txn = parse_input("昨天午饭35")
        self.assertEqual(txn.raw_input, "昨天午饭35")


class TestParseQueryParams(unittest.TestCase):
    """Test query parameter parsing."""

    def test_month_keyword(self):
        params = parse_query_params("上个月")
        self.assertIn("month", params)

    def test_category_keyword(self):
        params = parse_query_params("餐饮")
        self.assertEqual(params.get("category"), "餐饮")

    def test_month_and_category(self):
        params = parse_query_params("上个月 餐饮")
        self.assertIn("month", params)
        self.assertEqual(params.get("category"), "餐饮")

    def test_yyyy_mm_format(self):
        params = parse_query_params("2024-03")
        self.assertEqual(params.get("month"), "2024-03")

    def test_unknown_text(self):
        params = parse_query_params("something random")
        self.assertIn("keyword", params)


if __name__ == "__main__":
    unittest.main()
