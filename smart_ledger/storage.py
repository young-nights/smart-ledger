"""SQLite storage layer for Smart Ledger."""

import os
import sqlite3
from datetime import datetime
from typing import List, Optional, Dict, Any

from .models import Transaction, Budget, ExchangeRate, Category, SavingsGoal, SavingsGoalCurrency, StockHolding, Asset, Liability, ASSET_CATEGORIES, LIABILITY_CATEGORIES

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

        # Migration: add savings_goal_currencies table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS savings_goal_currencies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                goal_id INTEGER NOT NULL,
                currency TEXT NOT NULL DEFAULT 'CNY',
                amount REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (goal_id) REFERENCES savings_goals(id) ON DELETE CASCADE
            );
        """)

        # Migration: add stock_holdings table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS stock_holdings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                buy_price REAL NOT NULL DEFAULT 0,
                current_price REAL NOT NULL DEFAULT 0,
                previous_close REAL NOT NULL DEFAULT 0,
                quantity REAL NOT NULL DEFAULT 0,
                buy_date TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
        ")

        # Day trades table for T-trading records
        cur.execute("""
            CREATE TABLE IF NOT EXISTS day_trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                trade_type TEXT NOT NULL DEFAULT 'sell',
                price REAL NOT NULL DEFAULT 0,
                quantity REAL NOT NULL DEFAULT 0,
                trade_date TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                notes TEXT NOT NULL DEFAULT ''
            );
        """)

        # Migration: add assets and liabilities tables
        cur.execute("""
            CREATE TABLE IF NOT EXISTS assets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                amount REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS liabilities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                amount REAL NOT NULL DEFAULT 0,
                interest_rate REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
        """)

        # Migration: add FIRE framework columns to assets
        self._migrate_add_column(cur, "assets", "subcategory", "TEXT NOT NULL DEFAULT ''")
        self._migrate_add_column(cur, "assets", "is_investable", "INTEGER NOT NULL DEFAULT 1")

        # Migration: add FIRE framework columns to liabilities
        self._migrate_add_column(cur, "liabilities", "subcategory", "TEXT NOT NULL DEFAULT ''")
        self._migrate_add_column(cur, "liabilities", "monthly_payment", "REAL NOT NULL DEFAULT 0")
        self._migrate_add_column(cur, "liabilities", "is_high_interest", "INTEGER NOT NULL DEFAULT 0")

        # Migration: add stock_pnl column to savings_goals
        self._migrate_add_column(cur, "savings_goals", "stock_pnl", "REAL NOT NULL DEFAULT 0")

        # Migration: add previous_close column to stock_holdings
        self._migrate_add_column(cur, "stock_holdings", "previous_close", "REAL NOT NULL DEFAULT 0")

        self.conn.commit()
        self._seed_categories()

    def _migrate_add_column(self, cur, table: str, column: str, col_def: str):
        """Add a column to a table if it does not already exist."""
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")
        except Exception:
            pass  # Column already exists

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
        limit: int = 0,
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
        if limit and limit > 0:
            sql = f"SELECT * FROM transactions{where} ORDER BY date DESC, id DESC LIMIT ?"
        else:
            sql = f"SELECT * FROM transactions{where} ORDER BY date DESC, id DESC"
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
               stock_pnl=?, deadline=?, color=? WHERE id=?""",
            (goal.name, goal.target_amount, goal.current_amount, goal.stock_pnl, goal.deadline, goal.color, goal.id),
        )
        # Record history if amount changed (upsert by day)
        if goal.current_amount != old_amount:
            from datetime import datetime
            now_str = datetime.now().isoformat()
            day_str = now_str[:10]
            cur.execute(
                "SELECT id FROM savings_history WHERE goal_id = ? AND recorded_at LIKE ?",
                (goal.id, day_str + "%"),
            )
            existing = cur.fetchone()
            if existing:
                cur.execute(
                    "UPDATE savings_history SET amount = ?, recorded_at = ? WHERE id = ?",
                    (goal.current_amount, now_str, existing[0]),
                )
            else:
                cur.execute(
                    "INSERT INTO savings_history (goal_id, amount, recorded_at) VALUES (?, ?, ?)",
                    (goal.id, goal.current_amount, now_str),
                )
        self.conn.commit()
        return cur.rowcount > 0

    def add_savings_history(self, goal_id: int, amount: float, recorded_at: str = None):
        """Record a savings history entry.

        If a record already exists for the same goal and same day (YYYY-MM-DD),
        it is updated in place instead of inserting a new row.
        """
        from datetime import datetime
        if recorded_at is None:
            recorded_at = datetime.now().isoformat()
        # Extract date portion for upsert-by-day logic
        day_str = recorded_at[:10]  # YYYY-MM-DD
        cur = self.conn.cursor()
        cur.execute(
            "SELECT id FROM savings_history WHERE goal_id = ? AND recorded_at LIKE ?",
            (goal_id, day_str + "%"),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute(
                "UPDATE savings_history SET amount = ?, recorded_at = ? WHERE id = ?",
                (amount, recorded_at, existing[0]),
            )
        else:
            cur.execute(
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

    # ── Savings Goal Currencies ─────────────────────────────────

    def add_savings_goal_currency(self, goal_id: int, currency: str, amount: float) -> SavingsGoalCurrency:
        """Add a currency entry to a savings goal."""
        cur = self.conn.cursor()
        cur.execute(
            "INSERT INTO savings_goal_currencies (goal_id, currency, amount) VALUES (?, ?, ?)",
            (goal_id, currency, amount),
        )
        self.conn.commit()
        item = SavingsGoalCurrency(id=cur.lastrowid, goal_id=goal_id, currency=currency, amount=amount)
        return item

    def get_savings_goal_currencies(self, goal_id: int) -> List[SavingsGoalCurrency]:
        """Get all currency entries for a savings goal."""
        cur = self.conn.cursor()
        cur.execute(
            "SELECT * FROM savings_goal_currencies WHERE goal_id = ? ORDER BY id",
            (goal_id,),
        )
        return [SavingsGoalCurrency.from_dict(dict(r)) for r in cur.fetchall()]

    def update_savings_goal_currency(self, item_id: int, currency: str, amount: float) -> bool:
        """Update a currency entry."""
        cur = self.conn.cursor()
        cur.execute(
            "UPDATE savings_goal_currencies SET currency=?, amount=? WHERE id=?",
            (currency, amount, item_id),
        )
        self.conn.commit()
        return cur.rowcount > 0

    def delete_savings_goal_currency(self, item_id: int) -> bool:
        """Delete a single currency entry."""
        cur = self.conn.cursor()
        cur.execute("DELETE FROM savings_goal_currencies WHERE id = ?", (item_id,))
        self.conn.commit()
        return cur.rowcount > 0

    def delete_all_savings_goal_currencies(self, goal_id: int):
        """Delete all currency entries for a savings goal."""
        cur = self.conn.cursor()
        cur.execute("DELETE FROM savings_goal_currencies WHERE goal_id = ?", (goal_id,))
        self.conn.commit()

    # ── Stock Holdings ──────────────────────────────────────────────

    def add_stock_holding(self, holding: StockHolding) -> StockHolding:
        """Add a new stock holding."""
        cur = self.conn.cursor()
        cur.execute(
            """INSERT INTO stock_holdings (ticker, name, buy_price, current_price, quantity, buy_date)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (holding.ticker, holding.name, holding.buy_price, holding.current_price,
             holding.quantity, holding.buy_date),
        )
        self.conn.commit()
        holding.id = cur.lastrowid
        return holding

    def get_stock_holdings(self) -> List[StockHolding]:
        """Get all stock holdings."""
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM stock_holdings ORDER BY created_at DESC")
        return [StockHolding.from_dict(dict(r)) for r in cur.fetchall()]

    def get_stock_holding(self, holding_id: int) -> Optional[StockHolding]:
        """Get a single stock holding by ID."""
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM stock_holdings WHERE id = ?", (holding_id,))
        row = cur.fetchone()
        return StockHolding.from_dict(dict(row)) if row else None

    def update_stock_holding(self, holding: StockHolding) -> bool:
        """Update a stock holding's current price and previous close."""
        if holding.id is None:
            return False
        cur = self.conn.cursor()
        cur.execute(
            """UPDATE stock_holdings SET current_price = ?, previous_close = ? WHERE id = ?""",
            (holding.current_price, holding.previous_close, holding.id),
        )
        self.conn.commit()
        return cur.rowcount > 0

    def update_stock_holding_full(self, holding: StockHolding) -> bool:
        """Update all fields of a stock holding (for user edits)."""
        if holding.id is None:
            return False
        cur = self.conn.cursor()
        cur.execute(
            """UPDATE stock_holdings SET name = ?, buy_price = ?, current_price = ?,
               previous_close = ?, quantity = ?, buy_date = ? WHERE id = ?""",
            (holding.name, holding.buy_price, holding.current_price,
             holding.previous_close, holding.quantity, holding.buy_date, holding.id),
        )
        self.conn.commit()
        return cur.rowcount > 0

    def delete_stock_holding(self, holding_id: int) -> bool:
        """Delete a stock holding by ID."""
        cur = self.conn.cursor()
        cur.execute("DELETE FROM stock_holdings WHERE id = ?", (holding_id,))
        self.conn.commit()
        return cur.rowcount > 0

    # ── Day Trades (T-trading) ─────────────────────────────────────

    def add_day_trade(self, trade: "DayTrade") -> "DayTrade":
        """Add a new day trade record."""
        from .models import DayTrade
        cur = self.conn.cursor()
        cur.execute(
            """INSERT INTO day_trades (ticker, trade_type, price, quantity, trade_date, notes)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (trade.ticker, trade.trade_type, trade.price, trade.quantity,
             trade.trade_date or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
             trade.notes),
        )
        self.conn.commit()
        trade.id = cur.lastrowid
        return trade

    def get_day_trades(self, ticker: str = None) -> list:
        """Get day trades, optionally filtered by ticker."""
        from .models import DayTrade
        cur = self.conn.cursor()
        if ticker:
            cur.execute("SELECT * FROM day_trades WHERE ticker = ? ORDER BY trade_date DESC", (ticker,))
        else:
            cur.execute("SELECT * FROM day_trades ORDER BY trade_date DESC")
        return [DayTrade.from_dict(dict(r)) for r in cur.fetchall()]

    def delete_day_trade(self, trade_id: int) -> bool:
        """Delete a day trade by ID."""
        cur = self.conn.cursor()
        cur.execute("DELETE FROM day_trades WHERE id = ?", (trade_id,))
        self.conn.commit()
        return cur.rowcount > 0

    # ── Assets ──────────────────────────────────────────────────────

    def add_asset(self, asset: Asset) -> Asset:
        """Add a new asset entry."""
        cur = self.conn.cursor()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # Auto-set is_investable from category if not explicitly provided
        if asset.category in ASSET_CATEGORIES:
            asset.is_investable = ASSET_CATEGORIES[asset.category]
        cur.execute(
            """INSERT INTO assets (name, category, subcategory, amount, is_investable, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (asset.name, asset.category, asset.subcategory, asset.amount,
             1 if asset.is_investable else 0, now, now),
        )
        self.conn.commit()
        asset.id = cur.lastrowid
        asset.created_at = now
        asset.updated_at = now
        return asset

    def get_assets(self) -> List[Asset]:
        """Get all assets."""
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM assets ORDER BY created_at DESC")
        results = []
        for r in cur.fetchall():
            d = dict(r)
            # Convert is_investable from int to bool for legacy rows
            d["is_investable"] = bool(d.get("is_investable", 1))
            results.append(Asset.from_dict(d))
        return results

    def get_asset(self, asset_id: int) -> Optional[Asset]:
        """Get a single asset by ID."""
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM assets WHERE id = ?", (asset_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["is_investable"] = bool(d.get("is_investable", 1))
        return Asset.from_dict(d)

    def update_asset(self, asset: Asset) -> bool:
        """Update an asset entry."""
        if asset.id is None:
            return False
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur = self.conn.cursor()
        cur.execute(
            """UPDATE assets SET name=?, category=?, subcategory=?, amount=?,
               is_investable=?, updated_at=?
               WHERE id=?""",
            (asset.name, asset.category, asset.subcategory, asset.amount,
             1 if asset.is_investable else 0, now, asset.id),
        )
        self.conn.commit()
        return cur.rowcount > 0

    def delete_asset(self, asset_id: int) -> bool:
        """Delete an asset by ID."""
        cur = self.conn.cursor()
        cur.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
        self.conn.commit()
        return cur.rowcount > 0

    # ── Liabilities ──────────────────────────────────────────────────

    def add_liability(self, liability: Liability) -> Liability:
        """Add a new liability entry."""
        cur = self.conn.cursor()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # Auto-set is_high_interest from category or rate
        if liability.category in LIABILITY_CATEGORIES:
            liability.is_high_interest = LIABILITY_CATEGORIES[liability.category]
        if liability.interest_rate > 10:
            liability.is_high_interest = True
        cur.execute(
            """INSERT INTO liabilities (name, category, subcategory, amount, interest_rate,
               monthly_payment, is_high_interest, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (liability.name, liability.category, liability.subcategory, liability.amount,
             liability.interest_rate, liability.monthly_payment,
             1 if liability.is_high_interest else 0, now, now),
        )
        self.conn.commit()
        liability.id = cur.lastrowid
        liability.created_at = now
        liability.updated_at = now
        return liability

    def get_liabilities(self) -> List[Liability]:
        """Get all liabilities."""
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM liabilities ORDER BY created_at DESC")
        results = []
        for r in cur.fetchall():
            d = dict(r)
            d["is_high_interest"] = bool(d.get("is_high_interest", 0))
            results.append(Liability.from_dict(d))
        return results

    def get_liability(self, liability_id: int) -> Optional[Liability]:
        """Get a single liability by ID."""
        cur = self.conn.cursor()
        cur.execute("SELECT * FROM liabilities WHERE id = ?", (liability_id,))
        row = cur.fetchone()
        if not row:
            return None
        d = dict(row)
        d["is_high_interest"] = bool(d.get("is_high_interest", 0))
        return Liability.from_dict(d)

    def update_liability(self, liability: Liability) -> bool:
        """Update a liability entry."""
        if liability.id is None:
            return False
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # Auto-set is_high_interest from rate
        if liability.interest_rate > 10:
            liability.is_high_interest = True
        cur = self.conn.cursor()
        cur.execute(
            """UPDATE liabilities SET name=?, category=?, subcategory=?, amount=?,
               interest_rate=?, monthly_payment=?, is_high_interest=?, updated_at=?
               WHERE id=?""",
            (liability.name, liability.category, liability.subcategory, liability.amount,
             liability.interest_rate, liability.monthly_payment,
             1 if liability.is_high_interest else 0, now, liability.id),
        )
        self.conn.commit()
        return cur.rowcount > 0

    def delete_liability(self, liability_id: int) -> bool:
        """Delete a liability by ID."""
        cur = self.conn.cursor()
        cur.execute("DELETE FROM liabilities WHERE id = ?", (liability_id,))
        self.conn.commit()
        return cur.rowcount > 0

    def get_net_worth(self) -> Dict[str, Any]:
        """Calculate net worth from assets and liabilities."""
        cur = self.conn.cursor()
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM assets")
        total_assets = cur.fetchone()[0]
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM liabilities")
        total_liabilities = cur.fetchone()[0]
        return {
            "total_assets": round(total_assets, 2),
            "total_liabilities": round(total_liabilities, 2),
            "net_worth": round(total_assets - total_liabilities, 2),
        }

    # ── FIRE Analysis Helpers ───────────────────────────────────

    def get_investable_assets(self) -> float:
        """Sum all assets where is_investable=True."""
        cur = self.conn.cursor()
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM assets WHERE is_investable = 1")
        return cur.fetchone()[0]

    def get_asset_allocation(self) -> List[Dict[str, Any]]:
        """Group assets by category with totals and percentages."""
        cur = self.conn.cursor()
        cur.execute("""
            SELECT category, SUM(amount) AS amount,
                   MAX(is_investable) AS is_investable
            FROM assets
            GROUP BY category
            ORDER BY amount DESC
        """)
        rows = cur.fetchall()
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM assets")
        total = cur.fetchone()[0] or 1
        result = []
        for r in rows:
            amt = r["amount"]
            result.append({
                "category": r["category"],
                "amount": round(amt, 2),
                "percentage": round(amt / total * 100, 1),
                "is_investable": bool(r["is_investable"]),
            })
        return result

    def get_liability_breakdown(self) -> List[Dict[str, Any]]:
        """Group liabilities by category with totals and percentages."""
        cur = self.conn.cursor()
        cur.execute("""
            SELECT category, SUM(amount) AS amount,
                   MAX(is_high_interest) AS is_high_interest
            FROM liabilities
            GROUP BY category
            ORDER BY amount DESC
        """)
        rows = cur.fetchall()
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM liabilities")
        total = cur.fetchone()[0] or 1
        result = []
        for r in rows:
            amt = r["amount"]
            result.append({
                "category": r["category"],
                "amount": round(amt, 2),
                "percentage": round(amt / total * 100, 1),
                "is_high_interest": bool(r["is_high_interest"]),
            })
        return result

    def get_stock_metrics(self, monthly_avg_saving: float = 0) -> Dict[str, Any]:
        """Compute FIRE stock (balance sheet) metrics."""
        cur = self.conn.cursor()
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM assets")
        total_assets = cur.fetchone()[0]
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM liabilities")
        total_liabilities = cur.fetchone()[0]
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM assets WHERE is_investable = 1")
        investable_assets = cur.fetchone()[0]
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM liabilities WHERE interest_rate > 0")
        interest_bearing_debt = cur.fetchone()[0]

        net_worth = total_assets - total_liabilities
        net_financial_assets = investable_assets - interest_bearing_debt
        investable_ratio = round(investable_assets / total_assets * 100, 1) if total_assets > 0 else 0
        debt_ratio = round(total_liabilities / total_assets * 100, 1) if total_assets > 0 else 0

        # Asset growth rate = monthly_avg_saving * 12 / net_worth (annualized)
        asset_growth_rate = 0.0
        if net_worth > 0:
            asset_growth_rate = round(monthly_avg_saving * 12 / net_worth * 100, 1)

        return {
            "total_assets": round(total_assets, 2),
            "total_liabilities": round(total_liabilities, 2),
            "net_worth": round(net_worth, 2),
            "investable_assets": round(investable_assets, 2),
            "net_financial_assets": round(net_financial_assets, 2),
            "asset_growth_rate": asset_growth_rate,
            "investable_ratio": investable_ratio,
            "debt_ratio": debt_ratio,
            "debt_to_income": 0.0,  # filled by caller with monthly income
        }

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
