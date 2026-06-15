"""SQLite storage layer for Smart Ledger."""

import os
import sqlite3
from datetime import datetime
from typing import List, Optional, Dict, Any

from .models import Transaction, Budget, ExchangeRate, Category, SavingsGoal

DEFAULT_DB_PATH = os.path.expanduser("~/.smart_ledger/ledger.db")


class Storage:
    """SQLite-backed persistent storage."""

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self):
        """Initialize schema and apply migrations."""
        cur = self.conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")

        cur.executescript("""
            CREATE TABLE IF NOT EXISTS savings_goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                target_amount REAL NOT NULL DEFAULT 0,
                current_amount REAL NOT NULL DEFAULT 0,
                deadline TEXT,
                color TEXT NOT NULL DEFAULT '#0d7377',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'CNY',
                category TEXT NOT NULL DEFAULT '',
                subcategory TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                raw_input TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL DEFAULT 'CNY',
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                period TEXT NOT NULL DEFAULT 'month',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                UNIQUE(category, year, month, period)
            );

            CREATE TABLE IF NOT EXISTS exchange_rates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_currency TEXT NOT NULL,
                to_currency TEXT NOT NULL,
                rate REAL NOT NULL,
                date TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                parent_id INTEGER,
                keywords TEXT NOT NULL DEFAULT '',
                icon TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS savings_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                goal_id INTEGER NOT NULL,
                amount REAL NOT NULL DEFAULT 0,
                recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
            CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category);
            CREATE INDEX IF NOT EXISTS idx_budgets_ym ON budgets(year, month);
        """)
        self.conn.commit()
        self._seed_categories()

    def _seed_categories(self):
        """Seed categories from parser keyword database if empty."""
        cur = self.conn.cursor()
        cur.execute("SELECT COUNT(*) FROM categories")
        if cur.fetchone()[0] > 0:
            return  # Already seeded

        # Import from parser to get the keyword database
        from .parser import CATEGORY_KEYWORDS, INCOME_KEYWORDS

        cat_id = 1
        for cat_name, subcats in CATEGORY_KEYWORDS.items():
            # Insert parent category
            cur.execute(
                "INSERT OR IGNORE INTO categories (id, name, keywords, icon) VALUES (?, ?, '', '')",
                (cat_id, cat_name),
            )
            parent_id = cat_id
            cat_id += 1

            # Insert subcategories
            for sub_name, keywords in subcats.items():
                kw_str = ",".join(keywords)
                cur.execute(
                    "INSERT OR IGNORE INTO categories (id, name, parent_id, keywords, icon) VALUES (?, ?, ?, '', '')",
                    (cat_id, sub_name, parent_id),
                )
                cat_id += 1

        # Insert income categories
        for inc_name, keywords in INCOME_KEYWORDS.items():
            kw_str = ",".join(keywords)
            cur.execute(
                "INSERT OR IGNORE INTO categories (id, name, keywords, icon) VALUES (?, ?, '', '')",
                (cat_id, inc_name),
            )
            cat_id += 1

        self.conn.commit()

    def close(self):
        self.conn.close()

    # ── Transactions ──────────────────────────────────────────────

    def add_transaction(self, txn: Transaction) -> Transaction:
        cur = self.conn.cursor()
        cur.execute(
            """INSERT INTO transactions (date, amount, currency, category, subcategory, description, raw_input)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (txn.date, txn.amount, txn.currency, txn.category, txn.subcategory, txn.description, txn.raw_input),
        )
        self.conn.commit()
        txn.id = cur.lastrowid
        return txn

    def get_transaction(self, txn_id: int) -> Optional[Transaction]:
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM transactions WHERE id = ?", (txn_id,))
        row = cur.fetchone()
        return Transaction.from_dict(dict(row)) if row else None

    def get_transactions(
        self,
        month: Optional[str] = None,
        category: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        keyword: Optional[str] = None,
        limit: int = 500,
    ) -> List[Transaction]:
        """Fetch transactions with optional filters.

        Args:
            month: 'YYYY-MM' format filter.
            category: exact category match.
            start_date / end_date: date range (inclusive).
            keyword: search in description and raw_input.
            limit: max rows returned.
        """
        clauses: List[str] = []
        params: List[Any] = []

        if month:
            clauses.append("strftime('%Y-%m', date) = ?")
            params.append(month)
        if category:
            clauses.append("category = ?")
            params.append(category)
        if start_date:
            clauses.append("date >= ?")
            params.append(start_date)
        if end_date:
            clauses.append("date <= ?")
            params.append(end_date)
        if keyword:
            clauses.append("(description LIKE ? OR raw_input LIKE ?)")
            like = f"%{keyword}%"
            params.extend([like, like])

        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM transactions{where} ORDER BY date DESC, id DESC LIMIT ?"
        params.append(limit)

        cur = self.conn.cursor()
        cur.execute(sql, params)
        return [Transaction.from_dict(dict(r)) for r in cur.fetchall()]

    def update_transaction(self, txn: Transaction) -> bool:
        if txn.id is None:
            return False
        cur = self.conn.cursor()
        cur.execute(
            """UPDATE transactions SET date=?, amount=?, currency=?, category=?, subcategory=?,
               description=?, raw_input=? WHERE id=?""",
            (txn.date, txn.amount, txn.currency, txn.category, txn.subcategory, txn.description, txn.raw_input, txn.id),
        )
        self.conn.commit()
        return cur.rowcount > 0

    def delete_transaction(self, txn_id: int) -> bool:
        cur = self.conn.cursor()
        cur.execute("DELETE FROM transactions WHERE id = ?", (txn_id,))
        self.conn.commit()
        return cur.rowcount > 0

    # ── Budgets ───────────────────────────────────────────────────

    def add_budget(self, budget: Budget) -> Budget:
        cur = self.conn.cursor()
        cur.execute(
            """INSERT OR REPLACE INTO budgets (category, amount, currency, year, month, period)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (budget.category, budget.amount, budget.currency, budget.year, budget.month, budget.period),
        )
        self.conn.commit()
        budget.id = cur.lastrowid
        return budget

    def get_budget(self, budget_id: int) -> Optional[Budget]:
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM budgets WHERE id = ?", (budget_id,))
        row = cur.fetchone()
        return Budget.from_dict(dict(row)) if row else None

    def get_budgets(self, year: int, month: int) -> List[Budget]:
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM budgets WHERE year = ? AND month = ?", (year, month))
        return [Budget.from_dict(dict(r)) for r in cur.fetchall()]

    def get_all_budgets(self) -> List[Budget]:
        """Get all budgets regardless of period."""
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM budgets")
        return [Budget.from_dict(dict(r)) for r in cur.fetchall()]

    def delete_budget(self, budget_id: int) -> bool:
        cur = self.conn.cursor()
        cur.execute("DELETE FROM budgets WHERE id = ?", (budget_id,))
        self.conn.commit()
        return cur.rowcount > 0

    # ── Exchange Rates ────────────────────────────────────────────

    def add_exchange_rate(self, rate: ExchangeRate) -> ExchangeRate:
        cur = self.conn.cursor()
        cur.execute(
            """INSERT INTO exchange_rates (from_currency, to_currency, rate, date)
               VALUES (?, ?, ?, ?)""",
            (rate.from_currency, rate.to_currency, rate.rate, rate.date),
        )
        self.conn.commit()
        rate.id = cur.lastrowid
        return rate

    def get_exchange_rates(self) -> List[ExchangeRate]:
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM exchange_rates ORDER BY date DESC")
        return [ExchangeRate.from_dict(dict(r)) for r in cur.fetchall()]

    def get_latest_rate(self, from_currency: str, to_currency: str) -> Optional[ExchangeRate]:
        cur = self.conn.cursor()
        cur.execute(
            """SELECT * FROM exchange_rates
               WHERE from_currency = ? AND to_currency = ?
               ORDER BY date DESC LIMIT 1""",
            (from_currency, to_currency),
        )
        row = cur.fetchone()
        return ExchangeRate.from_dict(dict(row)) if row else None

    # ── Categories ────────────────────────────────────────────────

    def add_category(self, cat: Category) -> Category:
        cur = self.conn.cursor()
        cur.execute(
            "INSERT OR IGNORE INTO categories (name, parent_id, keywords, icon) VALUES (?, ?, ?, ?)",
            (cat.name, cat.parent_id, cat.keywords, cat.icon),
        )
        self.conn.commit()
        cat.id = cur.lastrowid
        return cat

    def get_categories(self) -> List[Category]:
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM categories ORDER BY id")
        return [Category.from_dict(dict(r)) for r in cur.fetchall()]

    def delete_category(self, cat_id: int) -> bool:
        cur = self.conn.cursor()
        cur.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
        self.conn.commit()
        return cur.rowcount > 0

    # ── Savings Goals ──────────────────────────────────────────────

    def add_savings_goal(self, goal: SavingsGoal) -> SavingsGoal:
        from datetime import datetime
        cur = self.conn.cursor()
        cur.execute(
            """INSERT INTO savings_goals (name, target_amount, current_amount, deadline, color)
               VALUES (?, ?, ?, ?, ?)""",
            (goal.name, goal.target_amount, goal.current_amount, goal.deadline, goal.color),
        )
        goal.id = cur.lastrowid
        # Record initial history entry
        cur.execute(
            "INSERT INTO savings_history (goal_id, amount, recorded_at) VALUES (?, ?, ?)",
            (goal.id, goal.current_amount, datetime.now().isoformat()),
        )
        self.conn.commit()
        return goal

    def get_savings_goals(self) -> List[SavingsGoal]:
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM savings_goals ORDER BY created_at DESC")
        return [SavingsGoal.from_dict(dict(r)) for r in cur.fetchall()]

    def get_savings_goal(self, goal_id: int) -> Optional[SavingsGoal]:
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM savings_goals WHERE id = ?", (goal_id,))
        row = cur.fetchone()
        return SavingsGoal.from_dict(dict(row)) if row else None

    def update_savings_goal(self, goal: SavingsGoal) -> bool:
        if goal.id is None:
            return False
        # Get old amount for comparison
        cur = self.conn.cursor()
        cur.execute("SELECT current_amount FROM savings_goals WHERE id=?", (goal.id,))
        row = cur.fetchone()
        old_amount = row[0] if row else 0

        cur.execute(
            """UPDATE savings_goals SET name=?, target_amount=?, current_amount=?,
               deadline=?, color=? WHERE id=?""",
            (goal.name, goal.target_amount, goal.current_amount, goal.deadline, goal.color, goal.id),
        )
        # Record history if amount changed
        if goal.current_amount != old_amount:
            from datetime import datetime
            cur.execute(
                "INSERT INTO savings_history (goal_id, amount, recorded_at) VALUES (?, ?, ?)",
                (goal.id, goal.current_amount, datetime.now().isoformat()),
            )
        self.conn.commit()
        return cur.rowcount > 0

    def add_savings_history(self, goal_id: int, amount: float, recorded_at: str = None):
        """Record a savings history entry."""
        from datetime import datetime
        if recorded_at is None:
            recorded_at = datetime.now().isoformat()
        self.conn.cursor().execute(
            "INSERT INTO savings_history (goal_id, amount, recorded_at) VALUES (?, ?, ?)",
            (goal_id, amount, recorded_at),
        )
        self.conn.commit()

    def get_savings_history(self, goal_id: int) -> list:
        """Get all history entries for a savings goal."""
        cur = self.conn.cursor()
        cur.execute(
            "SELECT id, goal_id, amount, recorded_at FROM savings_history WHERE goal_id = ? ORDER BY recorded_at ASC",
            (goal_id,)
        )
        return cur.fetchall()

    def delete_savings_goal(self, goal_id: int) -> bool:
        cur = self.conn.cursor()
        cur.execute("DELETE FROM savings_goals WHERE id = ?", (goal_id,))
        self.conn.commit()
        return cur.rowcount > 0

    def get_daily_expenses(self, start_date: str, end_date: str) -> List[Dict[str, Any]]:
        """Get daily expense totals for heatmap."""
        cur = self.conn.cursor()
        cur.execute(
            """SELECT date, SUM(ABS(amount)) as total
               FROM transactions
               WHERE amount < 0 AND date >= ? AND date <= ?
               GROUP BY date
               ORDER BY date""",
            (start_date, end_date),
        )
        return [dict(r) for r in cur.fetchall()]

    def get_recurring_transactions(self) -> List[Dict[str, Any]]:
        """Detect recurring transactions by matching description patterns."""
        cur = self.conn.cursor()
        cur.execute(
            """SELECT description, category, subcategory,
                      COUNT(*) as frequency,
                      AVG(amount) as avg_amount,
                      MIN(date) as first_seen,
                      MAX(date) as last_seen
               FROM transactions
               WHERE description != ''
               GROUP BY description, category
               HAVING COUNT(*) >= 2
               ORDER BY frequency DESC
               LIMIT 20"""
        )
        return [dict(r) for r in cur.fetchall()]

    # ── Aggregation ───────────────────────────────────────────────

    def get_category_total_expense(self, category: str) -> float:
        """Get total expense for a category across all months."""
        cur = self.conn.cursor()
        cur.execute(
            "SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE category = ? AND amount < 0",
            (category,)
        )
        return cur.fetchone()[0]

    def get_daily_summary(self, year: int, month: int, day: int) -> Dict[str, Any]:
        """Return daily summary: total_income, total_expense, net_saving, per-category breakdown."""
        date_str = f"{year:04d}-{month:02d}-{day:02d}"
        cur = self.conn.cursor()

        # Totals
        cur.execute(
            """SELECT
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_income,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_expense
            FROM transactions
            WHERE date = ?""",
            (date_str,),
        )
        row = cur.fetchone()
        total_income = row["total_income"]
        total_expense = row["total_expense"]
        net_saving = total_income - total_expense

        # Per-category breakdown
        cur.execute(
            """SELECT
                category,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_expense,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_income,
                COUNT(*) AS txn_count
            FROM transactions
            WHERE date = ?
            GROUP BY category
            ORDER BY total_expense DESC""",
            (date_str,),
        )
        categories = [dict(r) for r in cur.fetchall()]

        cur.execute("""SELECT COUNT(*) AS txn_count FROM transactions WHERE date = ?""", (date_str,))
        txn_count = cur.fetchone()["txn_count"]

        return {
            "date": date_str,
            "total_income": total_income,
            "total_expense": total_expense,
            "net_saving": net_saving,
            "txn_count": txn_count,
            "categories": categories,
        }

    def get_yearly_summary(self, year: int) -> Dict[str, Any]:
        """Return yearly summary: total_income, total_expense, net_saving, per-category breakdown."""
        year_str = str(year)
        cur = self.conn.cursor()

        # Totals
        cur.execute(
            """SELECT
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_income,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_expense
            FROM transactions
            WHERE strftime('%Y', date) = ?""",
            (year_str,),
        )
        row = cur.fetchone()
        total_income = row["total_income"]
        total_expense = row["total_expense"]
        net_saving = total_income - total_expense

        # Per-category breakdown
        cur.execute(
            """SELECT
                category,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_expense,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_income,
                COUNT(*) AS txn_count
            FROM transactions
            WHERE strftime('%Y', date) = ?
            GROUP BY category
            ORDER BY total_expense DESC""",
            (year_str,),
        )
        categories = [dict(r) for r in cur.fetchall()]

        cur.execute("""SELECT COUNT(*) AS txn_count FROM transactions WHERE strftime('%Y', date) = ?""", (year_str,))
        txn_count = cur.fetchone()["txn_count"]

        return {
            "year": year_str,
            "total_income": total_income,
            "total_expense": total_expense,
            "net_saving": net_saving,
            "txn_count": txn_count,
            "categories": categories,
        }

    def get_monthly_summary(self, year: int, month: int) -> Dict[str, Any]:
        """Return monthly summary: total_income, total_expense, net_saving, per-category breakdown."""
        month_str = f"{year:04d}-{month:02d}"
        cur = self.conn.cursor()

        # Totals
        cur.execute(
            """SELECT
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_income,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_expense
            FROM transactions
            WHERE strftime('%Y-%m', date) = ?""",
            (month_str,),
        )
        row = cur.fetchone()
        total_income = row["total_income"]
        total_expense = row["total_expense"]
        net_saving = total_income - total_expense

        # Per-category breakdown
        cur.execute(
            """SELECT
                category,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_expense,
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_income,
                COUNT(*) AS txn_count
            FROM transactions
            WHERE strftime('%Y-%m', date) = ?
            GROUP BY category
            ORDER BY total_expense DESC""",
            (month_str,),
        )
        categories = [dict(r) for r in cur.fetchall()]

        # Total transaction count
        cur.execute(
            """SELECT COUNT(*) AS txn_count FROM transactions WHERE strftime('%Y-%m', date) = ?""",
            (month_str,),
        )
        txn_count = cur.fetchone()["txn_count"]

        return {
            "month": month_str,
            "total_income": total_income,
            "total_expense": total_expense,
            "net_saving": net_saving,
            "txn_count": txn_count,
            "categories": categories,
        }
