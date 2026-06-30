"""Flask REST API for Smart Ledger.

Run: python api.py  (or flask --app api run --port 5050)
"""

from datetime import datetime
import re as _re
import threading
import time as _time
from flask import Flask, request, jsonify
from flask_cors import CORS

import csv
import os
import io
import json as json_mod
import requests as http_requests
from smart_ledger.storage import Storage
from smart_ledger.parser import parse_input, parse_query_params
from smart_ledger.budget import BudgetManager
from smart_ledger.report import ReportGenerator
from smart_ledger.currency import CurrencyManager, DEFAULT_RATES, SUPPORTED_CURRENCIES
from smart_ledger.chat import ChatManager
from smart_ledger.models import SavingsGoal, StockHolding, Asset, Liability, ASSET_CATEGORIES, ASSET_SUBCATEGORIES, LIABILITY_CATEGORIES, LIABILITY_SUBCATEGORIES
from openai import OpenAI

app = Flask(__name__)
CORS(app)

storage = Storage()
budget_mgr = BudgetManager(storage)
report_gen = ReportGenerator(storage)
currency_mgr = CurrencyManager(storage)
chat_mgr = ChatManager(storage, budget_mgr, report_gen)

def _convert_to_cny(amount: float, currency: str, rates: dict) -> float:
    """Convert an amount to CNY using provided rates."""
    currency = currency.upper()
    if currency == "CNY":
        return amount
    rate = rates.get(currency, 0)
    if rate:
        # get_realtime_rates() returns CNY-based rates (1 CNY = X foreign)
        # so foreign->CNY conversion requires division.
        return round(amount / rate, 2)
    # Fallback to DEFAULT_RATES
    fallback = DEFAULT_RATES.get("CNY", {}).get(currency)
    if fallback:
        # DEFAULT_RATES CNY->X means 1 CNY = X foreign, so foreign->CNY = 1/X
        return round(amount / fallback, 2) if fallback else amount
    return amount


# In-memory cache for exchange rates (avoid hitting external API on every call)
_rates_cache: dict | None = None
_rates_cache_ts: float = 0
_RATES_CACHE_TTL = 300  # 5 minutes


def get_realtime_rates() -> dict:
    """Fetch real-time exchange rates from free API, with 5-min in-memory cache."""
    global _rates_cache, _rates_cache_ts
    import time
    now = time.time()
    if _rates_cache is not None and (now - _rates_cache_ts) < _RATES_CACHE_TTL:
        return _rates_cache
    try:
        resp = http_requests.get("https://open.er-api.com/v6/latest/CNY", timeout=5)
        data = resp.json()
        if data.get("result") == "success":
            _rates_cache = data["rates"]
            _rates_cache_ts = now
            return _rates_cache
    except Exception:
        pass
    return DEFAULT_RATES.get("CNY", {})


def _get_goal_with_currencies(goal, storage):
    """Attach currencies list to a goal dict."""
    d = goal.to_dict()
    currencies = storage.get_savings_goal_currencies(goal.id)
    d["currencies"] = [c.to_dict() for c in currencies]
    return d


# ── Stock Price Cache ───────────────────────────────────────────
_price_cache: dict = {}  # ticker -> {"price": float, "prev_close": float, "ts": float}
_price_cache_lock = threading.Lock()
_PRICE_CACHE_TTL = 300  # 5 minutes


def _get_cached_price(ticker: str) -> tuple:
    """Return (price, prev_close) from cache if fresh, else (0, 0)."""
    with _price_cache_lock:
        entry = _price_cache.get(ticker)
        if entry and (_time.time() - entry["ts"]) < _PRICE_CACHE_TTL:
            return entry["price"], entry["prev_close"]
    return 0.0, 0.0


def _set_cached_price(ticker: str, price: float, prev_close: float):
    """Update price cache for a ticker."""
    with _price_cache_lock:
        _price_cache[ticker] = {"price": price, "prev_close": prev_close, "ts": _time.time()}


# Model mapping: frontend model id -> (base_url, model_name)
MODEL_MAP = {
    "xiaomi": ("https://api.xiaomimimo.com/v1", "mimo-v2.5-pro"),
    "ollama": ("http://localhost:11434/v1", "qwen2.5"),
    "openai": ("https://api.openai.com/v1", "gpt-4o-mini"),
    "deepseek": ("https://api.deepseek.com/v1", "deepseek-chat"),
}


# ── Chat ─────────────────────────────────────────────────────────

@app.route("/api/chat", methods=["POST"])
def chat():
    """Chat with AI assistant."""
    data = request.get_json(force=True)
    message = data.get("message", "").strip()
    model = data.get("model")
    if not message:
        return jsonify({"error": "message is required"}), 400

    # Switch model if frontend sends a model id
    if model and model in MODEL_MAP:
        base_url, model_name = MODEL_MAP[model]
        chat_mgr.base_url = base_url
        chat_mgr.model = model_name
        chat_mgr.client = OpenAI(base_url=base_url, api_key=chat_mgr.api_key)

    result = chat_mgr.chat(message)
    return jsonify(result)


@app.route("/api/chat/history", methods=["GET"])
def chat_history():
    """Get chat history."""
    limit = request.args.get("limit", 50, type=int)
    return jsonify(chat_mgr.history[-limit:])


@app.route("/api/chat/history", methods=["DELETE"])
def clear_chat_history():
    """Clear chat history."""
    chat_mgr.clear_history()
    return jsonify({"ok": True})


# ── Transactions ──────────────────────────────────────────────────

@app.route("/api/transactions", methods=["GET"])
def list_transactions():
    """List transactions with optional filters."""
    month = request.args.get("month")
    category = request.args.get("category")
    keyword = request.args.get("keyword")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    txns = storage.get_transactions(
        month=month,
        category=category,
        keyword=keyword,
        start_date=start_date,
        end_date=end_date,
    )
    return jsonify([t.to_dict() for t in txns])


@app.route("/api/transactions", methods=["POST"])
def add_transaction():
    """Record a new transaction from natural language input."""
    data = request.get_json(force=True)
    raw_input = data.get("raw_input", "").strip()
    if not raw_input:
        return jsonify({"error": "raw_input is required"}), 400

    # Get optional type override from frontend
    txn_type = data.get("type")  # "expense" or "income"
    category_override = data.get("category")  # explicit category from frontend

    txn = parse_input(raw_input, txn_type=txn_type)
    if txn.amount == 0:
        return jsonify({"error": "Could not parse amount from input"}), 400

    # Override category if explicitly provided by frontend (custom categories etc.)
    if category_override:
        # Remove the category name from description to avoid duplication
        if category_override in txn.description:
            txn.description = txn.description.replace(category_override, "", 1).strip()
        txn.category = category_override
        # Try to find subcategory from keyword match on the category name
        from smart_ledger.parser import _match_category
        _, sub = _match_category(category_override)
        txn.subcategory = sub

    # Override date and time if provided
    if "date" in data and data["date"]:
        txn.date = data["date"]
    if "time" in data and data["time"]:
        txn.time = data["time"]

    txn = storage.add_transaction(txn)
    return jsonify({"transaction": txn.to_dict(), "alerts": []}), 201


@app.route("/api/transactions/<int:txn_id>", methods=["DELETE"])
def delete_transaction(txn_id: int):
    """Delete a transaction by ID."""
    if storage.delete_transaction(txn_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Transaction not found"}), 404


@app.route("/api/transactions/<int:txn_id>", methods=["PUT"])
def update_transaction(txn_id: int):
    """Update a transaction by ID."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    from smart_ledger.models import Transaction
    txn = Transaction(
        id=txn_id,
        date=data.get("date", ""),
        amount=float(data.get("amount", 0)),
        currency=data.get("currency", "CNY"),
        category=data.get("category", "其他"),
        subcategory=data.get("subcategory", ""),
        description=data.get("description", ""),
        raw_input=data.get("raw_input", ""),
    )
    if storage.update_transaction(txn):
        return jsonify({"ok": True})
    return jsonify({"error": "Transaction not found"}), 404


@app.route("/api/transactions/trend", methods=["GET"])
def transaction_trend():
    """Get income/expense trend with configurable period."""
    period = request.args.get("period", "month")  # day, month, year
    count = request.args.get("count", 6, type=int)
    result = []
    now = datetime.now()

    if period == "day":
        # Daily trend for current month (1 to 28/29/30/31)
        import calendar
        days_in_month = calendar.monthrange(now.year, now.month)[1]
        for day in range(1, days_in_month + 1):
            date_str = f"{now.year:04d}-{now.month:02d}-{day:02d}"
            cur = storage.conn.cursor()
            cur.execute(
                "SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as income, "
                "COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as expense "
                "FROM transactions WHERE date = ?",
                (date_str,)
            )
            row = cur.fetchone()
            result.append({
                "label": f"{day}日",
                "income": row[0],
                "expense": row[1],
            })
    elif period == "year":
        # Yearly trend for last N years
        for i in range(count - 1, -1, -1):
            y = now.year - i
            cur = storage.conn.cursor()
            cur.execute(
                "SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as income, "
                "COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as expense "
                "FROM transactions WHERE strftime('%Y', date) = ?",
                (str(y),)
            )
            row = cur.fetchone()
            result.append({
                "label": str(y),
                "income": row[0],
                "expense": row[1],
            })
    else:  # month
        # Monthly trend for current year (1-12)
        target_year = now.year if count == 12 else now.year
        for m in range(1, 13):
            summary = storage.get_monthly_summary(target_year, m)
            result.append({
                "label": f"{m:02d}月",
                "income": summary["total_income"],
                "expense": summary["total_expense"],
            })

    return jsonify(result)


@app.route("/api/transactions/summary", methods=["GET"])
def transactions_summary():
    """Get summary by period: day, month (default), or year."""
    period = request.args.get("period", "month")
    now = datetime.now()

    if period == "day":
        day = request.args.get("day", now.strftime("%Y-%m-%d"))
        try:
            parts = day.split("-")
            year, month_num, day_num = int(parts[0]), int(parts[1]), int(parts[2])
        except (ValueError, IndexError):
            return jsonify({"error": "Invalid day format. Use YYYY-MM-DD."}), 400
        summary = storage.get_daily_summary(year, month_num, day_num)
    elif period == "year":
        year = request.args.get("year", str(now.year), type=int)
        summary = storage.get_yearly_summary(year)
    else:  # month
        month = request.args.get("month", now.strftime("%Y-%m"))
        try:
            y, m = month.split("-")
            year, month_num = int(y), int(m)
        except (ValueError, AttributeError):
            return jsonify({"error": "Invalid month format. Use YYYY-MM."}), 400
        summary = storage.get_monthly_summary(year, month_num)

    return jsonify(summary)


@app.route("/api/transactions/summary/all", methods=["GET"])
def transactions_summary_all():
    """Get all-time summary with per-category breakdown."""
    cur = storage.conn.cursor()

    # Totals
    cur.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_income,
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_expense
        FROM transactions
    """)
    row = cur.fetchone()
    total_income = row[0]
    total_expense = row[1]

    # Per-category breakdown
    cur.execute("""
        SELECT
            category,
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_expense,
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_income,
            COUNT(*) AS txn_count
        FROM transactions
        GROUP BY category
        ORDER BY total_expense DESC
    """)
    categories = [dict(r) for r in cur.fetchall()]

    return jsonify({
        "total_income": total_income,
        "total_expense": total_expense,
        "net_saving": total_income - total_expense,
        "categories": categories,
    })


# ── Budgets ───────────────────────────────────────────────────────

@app.route("/api/budgets", methods=["GET"])
def list_budgets():
    """List budgets for a given month."""
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))
    try:
        y, m = month.split("-")
        year, month_num = int(y), int(m)
    except (ValueError, AttributeError):
        return jsonify({"error": "Invalid month format. Use YYYY-MM."}), 400

    budgets = budget_mgr.get_budgets(year, month_num)
    return jsonify(budgets)


@app.route("/api/budgets", methods=["POST"])
def add_budget():
    """Create or update a budget."""
    data = request.get_json(force=True)
    category = data.get("category", "").strip()
    amount = data.get("amount")

    if not category or amount is None:
        return jsonify({"error": "category and amount are required"}), 400

    currency = data.get("currency", "CNY")
    year = data.get("year", datetime.now().year)
    month = data.get("month", datetime.now().month)
    period = data.get("period", "month")

    budget = budget_mgr.set_budget(category, float(amount), currency, int(year), int(month), period)
    return jsonify({"budget": budget.to_dict()}), 201


@app.route("/api/budgets/<int:budget_id>", methods=["DELETE"])
def delete_budget(budget_id: int):
    """Delete a budget by ID."""
    if budget_mgr.delete_budget(budget_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Budget not found"}), 404


# ── Reports ───────────────────────────────────────────────────────

@app.route("/api/report", methods=["GET"])
def get_report():
    """Generate monthly report."""
    month = request.args.get("month", datetime.now().strftime("%Y-%m"))
    try:
        y, m = month.split("-")
        year, month_num = int(y), int(m)
    except (ValueError, AttributeError):
        return jsonify({"error": "Invalid month format. Use YYYY-MM."}), 400

    report = report_gen.generate(year, month_num)
    
    # Transform to match frontend expected format
    summary = report.get("summary", {})
    
    # Convert anomalies from objects to strings
    raw_anomalies = report.get("anomaly_detection", [])
    anomalies = []
    for a in raw_anomalies:
        if isinstance(a, dict):
            anomalies.append(a.get("message", str(a)))
        else:
            anomalies.append(str(a))
    
    # Convert advice from objects to strings
    raw_advice = report.get("advice", [])
    advice = []
    for a in raw_advice:
        if isinstance(a, dict):
            advice.append(a.get("message", str(a)))
        else:
            advice.append(str(a))
    
    return jsonify({
        "month": report.get("period", month),
        "total_income": summary.get("total_income", 0),
        "total_expense": summary.get("total_expense", 0),
        "net_saving": summary.get("net_saving", 0),
        "saving_rate": report.get("savings_rate", 0),
        "saving_grade": "优秀" if report.get("savings_rate", 0) >= 40 else "良好" if report.get("savings_rate", 0) >= 20 else "警告" if report.get("savings_rate", 0) >= 10 else "危险",
        "txn_count": sum(c.get("txn_count", 0) for c in report.get("top_categories", [])),
        "categories": report.get("top_categories", []),
        "budgets": report.get("budget_status", []),
        "anomalies": anomalies,
        "advice": advice,
    })


# ── Categories ────────────────────────────────────────────────────

@app.route("/api/categories", methods=["GET"])
def list_categories():
    """List all categories."""
    cats = storage.get_categories()
    return jsonify({"categories": [c.to_dict() for c in cats]})


# ── Currencies ────────────────────────────────────────────────────

@app.route("/api/currencies", methods=["GET"])
def list_currencies():
    """List supported currencies and exchange rates."""
    base = request.args.get("base", "CNY").upper()
    rates = currency_mgr.get_rates(base)
    return jsonify({
        "base": base,
        "currencies": currency_mgr.get_supported_currencies(),
        "rates": rates,
    })


@app.route("/api/currencies", methods=["POST"])
def set_currency_rate():
    """Set a custom exchange rate."""
    data = request.get_json(force=True)
    from_cur = data.get("from_currency", "").upper()
    to_cur = data.get("to_currency", "").upper()
    rate = data.get("rate")

    if not from_cur or not to_cur or rate is None:
        return jsonify({"error": "from_currency, to_currency, and rate are required"}), 400

    er = currency_mgr.set_rate(from_cur, to_cur, float(rate))
    return jsonify({"exchange_rate": er.to_dict()}), 201


@app.route("/api/exchange-rates", methods=["GET"])
def get_exchange_rates():
    """Get real-time exchange rates as foreign->CNY multipliers.

    The upstream API (open.er-api.com) returns rates with CNY as base
    (1 CNY = X foreign). We invert them so the frontend can simply
    multiply: foreign_amount * rate = CNY amount.
    """
    raw = get_realtime_rates()  # {"USD": 0.147, "EUR": 0.127, ...}
    inverted = {}
    for cur, rate in raw.items():
        if cur == "CNY":
            inverted[cur] = 1.0
        elif rate and rate > 0:
            inverted[cur] = round(1.0 / rate, 6)
        else:
            inverted[cur] = 0.0
    return jsonify({"base": "CNY", "rates": inverted})


# ── Search ────────────────────────────────────────────────────────

@app.route("/api/search", methods=["GET"])
def search_transactions():
    """Search transactions by keyword."""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "q parameter is required"}), 400

    params = parse_query_params(q)
    txns = storage.get_transactions(**params)
    return jsonify([t.to_dict() for t in txns])


# ── Savings Goals ────────────────────────────────────────────────

@app.route("/api/savings-goals", methods=["GET"])
def list_savings_goals():
    """List all savings goals with currency breakdowns."""
    goals = storage.get_savings_goals()
    result = [_get_goal_with_currencies(g, storage) for g in goals]
    return jsonify(result)


@app.route("/api/savings-goals", methods=["POST"])
def add_savings_goal():
    """Create a new savings goal, optionally with multi-currency breakdown."""
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    currencies_data = data.get("currencies", [])
    rates = get_realtime_rates()

    # User enters gross saved total (incl. investment gains); store principal only
    if "gross_total" in data:
        gross_total = float(data["gross_total"])
    elif currencies_data:
        gross_total = sum(
            _convert_to_cny(c.get("amount", 0), c.get("currency", "CNY"), rates)
            for c in currencies_data
        )
    else:
        gross_total = float(data.get("current_amount", 0))

    current_amount = _split_principal_from_gross(gross_total, 0)

    goal = SavingsGoal(
        name=name,
        target_amount=float(data.get("target_amount", 0)),
        current_amount=current_amount,
        deadline=data.get("deadline", ""),
        color=data.get("color", "#0d7377"),
    )
    goal = storage.add_savings_goal(goal)

    # Insert currencies (principal share; equals gross when stock_pnl is 0)
    if currencies_data:
        ratio = current_amount / gross_total if gross_total > 0 else 1
        for c in currencies_data:
            storage.add_savings_goal_currency(
                goal.id,
                c.get("currency", "CNY"),
                round(c.get("amount", 0) * ratio, 2),
            )
        storage.add_savings_history(goal.id, storage.goal_gross_amount(goal))

    return jsonify(_get_goal_with_currencies(goal, storage)), 201


@app.route("/api/savings-goals/<int:goal_id>", methods=["PUT"])
def update_savings_goal(goal_id: int):
    """Update an existing savings goal, optionally with multi-currency breakdown."""
    data = request.get_json(force=True)
    existing = storage.get_savings_goal(goal_id)
    if not existing:
        return jsonify({"error": "Goal not found"}), 404

    currencies_data = data.get("currencies")
    rates = get_realtime_rates()

    if currencies_data is not None:
        gross_total = sum(
            _convert_to_cny(c.get("amount", 0), c.get("currency", "CNY"), rates)
            for c in currencies_data
        )
        current_amount = _split_principal_from_gross(
            gross_total,
            existing.stock_pnl or 0,
        )
        ratio = current_amount / gross_total if gross_total > 0 else 1
        storage.delete_all_savings_goal_currencies(goal_id)
        for c in currencies_data:
            storage.add_savings_goal_currency(
                goal_id,
                c.get("currency", "CNY"),
                round(c.get("amount", 0) * ratio, 2),
            )
    elif "gross_total" in data:
        current_amount = _split_principal_from_gross(
            float(data["gross_total"]),
            existing.stock_pnl or 0,
        )
    else:
        current_amount = float(data.get("current_amount", existing.current_amount))

    goal = SavingsGoal(
        id=goal_id,
        name=data.get("name", existing.name),
        target_amount=float(data.get("target_amount", existing.target_amount)),
        current_amount=round(current_amount, 2),
        stock_pnl=existing.stock_pnl or 0,
        deadline=data.get("deadline", existing.deadline),
        color=data.get("color", existing.color),
    )
    if storage.update_savings_goal(goal):
        return jsonify(_get_goal_with_currencies(goal, storage))
    return jsonify({"error": "Goal not found"}), 404


@app.route("/api/savings-goals/<int:goal_id>", methods=["DELETE"])
def delete_savings_goal(goal_id: int):
    """Delete a savings goal by ID."""
    if storage.delete_savings_goal(goal_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Goal not found"}), 404


@app.route("/api/savings-goals/<int:goal_id>/history", methods=["GET"])
def get_savings_history(goal_id: int):
    """Get savings history for a goal."""
    history = storage.get_savings_history(goal_id)
    return jsonify([
        {"id": h[0], "goal_id": h[1], "amount": h[2], "recorded_at": h[3]}
        for h in history
    ])


@app.route("/api/savings-goals/<int:goal_id>/history", methods=["POST"])
def add_savings_history(goal_id: int):
    """Add a savings history entry."""
    data = request.get_json(force=True)
    amount = data.get("amount", 0)
    recorded_at = data.get("recorded_at")
    storage.add_savings_history(goal_id, amount, recorded_at)
    return jsonify({"ok": True}), 201


# ── Savings Goal Currencies ──────────────────────────────────────

@app.route("/api/savings-goals/<int:goal_id>/currencies", methods=["GET"])
def list_savings_goal_currencies(goal_id: int):
    """List all currency entries for a savings goal."""
    currencies = storage.get_savings_goal_currencies(goal_id)
    return jsonify([c.to_dict() for c in currencies])


@app.route("/api/savings-goals/<int:goal_id>/currencies", methods=["POST"])
def add_savings_goal_currency(goal_id: int):
    """Add a currency entry to a savings goal."""
    data = request.get_json(force=True)
    currency = data.get("currency", "CNY").upper()
    amount = float(data.get("amount", 0))
    if currency not in SUPPORTED_CURRENCIES:
        return jsonify({"error": f"Unsupported currency: {currency}"}), 400
    item = storage.add_savings_goal_currency(goal_id, currency, amount)
    # Recalculate goal current_amount
    _recalc_goal_amount(goal_id)
    return jsonify(item.to_dict()), 201


@app.route("/api/savings-goals/<int:goal_id>/currencies/<int:item_id>", methods=["PUT"])
def update_savings_goal_currency(goal_id: int, item_id: int):
    """Update a currency entry."""
    data = request.get_json(force=True)
    currency = data.get("currency", "CNY").upper()
    amount = float(data.get("amount", 0))
    if storage.update_savings_goal_currency(item_id, currency, amount):
        _recalc_goal_amount(goal_id)
        return jsonify({"ok": True})
    return jsonify({"error": "Currency entry not found"}), 404


@app.route("/api/savings-goals/<int:goal_id>/currencies/<int:item_id>", methods=["DELETE"])
def delete_savings_goal_currency(goal_id: int, item_id: int):
    """Delete a currency entry."""
    if storage.delete_savings_goal_currency(item_id):
        _recalc_goal_amount(goal_id)
        return jsonify({"ok": True})
    return jsonify({"error": "Currency entry not found"}), 404


# ── Assets ────────────────────────────────────────────────────────

@app.route("/api/assets", methods=["GET"])
def list_assets():
    """List all assets."""
    assets = storage.get_assets()
    return jsonify([a.to_dict() for a in assets])


@app.route("/api/assets", methods=["POST"])
def add_asset():
    """Add a new asset entry."""
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    asset = Asset(
        name=name,
        category=data.get("category", ""),
        subcategory=data.get("subcategory", ""),
        amount=float(data.get("amount", 0)),
    )
    asset = storage.add_asset(asset)
    return jsonify(asset.to_dict()), 201


@app.route("/api/assets/<int:asset_id>", methods=["PUT"])
def update_asset(asset_id: int):
    """Update an asset entry."""
    data = request.get_json(force=True)
    existing = storage.get_asset(asset_id)
    if not existing:
        return jsonify({"error": "Asset not found"}), 404

    asset = Asset(
        id=asset_id,
        name=data.get("name", existing.name),
        category=data.get("category", existing.category),
        subcategory=data.get("subcategory", existing.subcategory),
        amount=float(data.get("amount", existing.amount)),
        is_investable=data.get("is_investable", existing.is_investable),
    )
    if storage.update_asset(asset):
        return jsonify(asset.to_dict())
    return jsonify({"error": "Asset not found"}), 404


@app.route("/api/assets/<int:asset_id>", methods=["DELETE"])
def delete_asset(asset_id: int):
    """Delete an asset by ID."""
    if storage.delete_asset(asset_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Asset not found"}), 404


# ── Liabilities ──────────────────────────────────────────────────

@app.route("/api/liabilities", methods=["GET"])
def list_liabilities():
    """List all liabilities."""
    liabilities = storage.get_liabilities()
    return jsonify([l.to_dict() for l in liabilities])


@app.route("/api/liabilities", methods=["POST"])
def add_liability():
    """Add a new liability entry."""
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    liability = Liability(
        name=name,
        category=data.get("category", ""),
        subcategory=data.get("subcategory", ""),
        amount=float(data.get("amount", 0)),
        interest_rate=float(data.get("interest_rate", 0)),
        monthly_payment=float(data.get("monthly_payment", 0)),
    )
    liability = storage.add_liability(liability)
    return jsonify(liability.to_dict()), 201


@app.route("/api/liabilities/<int:liability_id>", methods=["PUT"])
def update_liability(liability_id: int):
    """Update a liability entry."""
    data = request.get_json(force=True)
    existing = storage.get_liability(liability_id)
    if not existing:
        return jsonify({"error": "Liability not found"}), 404

    liability = Liability(
        id=liability_id,
        name=data.get("name", existing.name),
        category=data.get("category", existing.category),
        subcategory=data.get("subcategory", existing.subcategory),
        amount=float(data.get("amount", existing.amount)),
        interest_rate=float(data.get("interest_rate", existing.interest_rate)),
        monthly_payment=float(data.get("monthly_payment", existing.monthly_payment)),
        is_high_interest=data.get("is_high_interest", existing.is_high_interest),
    )
    if storage.update_liability(liability):
        return jsonify(liability.to_dict())
    return jsonify({"error": "Liability not found"}), 404


@app.route("/api/liabilities/<int:liability_id>", methods=["DELETE"])
def delete_liability(liability_id: int):
    """Delete a liability by ID."""
    if storage.delete_liability(liability_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Liability not found"}), 404


@app.route("/api/net-worth", methods=["GET"])
def get_net_worth():
    """Get net worth summary (assets - liabilities)."""
    return jsonify(storage.get_net_worth())


def _recalc_goal_amount(goal_id: int):
    """Recalculate and update a goal's current_amount from its currency entries."""
    goal = storage.get_savings_goal(goal_id)
    if not goal:
        return
    currencies = storage.get_savings_goal_currencies(goal_id)
    if currencies:
        rates = get_realtime_rates()
        total = sum(_convert_to_cny(c.amount, c.currency, rates) for c in currencies)
        goal.current_amount = round(total, 2)
        storage.update_savings_goal(goal)


# ── Export ────────────────────────────────────────────────────────

@app.route("/api/export/csv", methods=["GET"])
def export_csv():
    """Export transactions as CSV."""
    month = request.args.get("month")
    category = request.args.get("category")
    txns = storage.get_transactions(month=month, category=category, limit=0)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "date", "amount", "currency", "category", "subcategory", "description"])
    for t in txns:
        writer.writerow([t.id, t.date, t.amount, t.currency, t.category, t.subcategory, t.description])

    return output.getvalue(), 200, {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=transactions.csv",
    }


@app.route("/api/export/json", methods=["GET"])
def export_json():
    """Export transactions as JSON."""
    month = request.args.get("month")
    category = request.args.get("category")
    txns = storage.get_transactions(month=month, category=category, limit=0)

    data = [t.to_dict() for t in txns]
    return json_mod.dumps(data, ensure_ascii=False, indent=2), 200, {
        "Content-Type": "application/json",
        "Content-Disposition": "attachment; filename=transactions.json",
    }


# ── Heatmap ───────────────────────────────────────────────────────

@app.route("/api/heatmap", methods=["GET"])
def get_heatmap():
    """Get daily expense data for heatmap visualization."""
    year = request.args.get("year", datetime.now().year, type=int)
    start_date = f"{year:04d}-01-01"
    end_date = f"{year:04d}-12-31"
    daily = storage.get_daily_expenses(start_date, end_date)
    return jsonify(daily)


# ── Recurring ─────────────────────────────────────────────────────

@app.route("/api/recurring", methods=["GET"])
def get_recurring():
    """Detect recurring transactions."""
    recurring = storage.get_recurring_transactions()
    return jsonify(recurring)


# ── Stock Holdings ───────────────────────────────────────────────

@app.route("/api/stocks", methods=["GET"])
def list_stocks():
    """List all stock holdings with day trade P&L.

    Uses cached prices from the last refresh to avoid blocking on external API calls.
    """
    holdings = storage.get_stock_holdings()
    result = []
    for h in holdings:
        d = h.to_dict()
        cached_price, cached_prev = _get_cached_price(h.ticker)
        if cached_price > 0:
            d["current_price"] = cached_price
            d["previous_close"] = cached_prev
        trades = storage.get_day_trades(h.ticker)
        d["day_trade_pnl"] = round(_calculate_day_trade_pnl(trades), 3)
        qty_info = _calculate_day_trade_matched_qty(trades)
        d["day_trade_matched_buy_qty"] = qty_info["matched_buy_qty"]
        d["day_trade_matched_sell_qty"] = qty_info["matched_sell_qty"]
        d["effective_qty"] = h.quantity + qty_info["net_qty"]
        # Effective cost: user override > T-trade calculation > original buy_price
        if h.user_cost > 0:
            d["effective_cost"] = round(h.user_cost, 3)
            d["cost_compensation"] = round(h.cost_compensation, 3)
        else:
            net_t_cash = sum(t.price * t.quantity for t in trades if t.trade_type == "sell") \
                - sum(t.price * t.quantity for t in trades if t.trade_type == "buy")
            eff_qty = d["effective_qty"]
            original_cost = h.buy_price * h.quantity
            if eff_qty > 0:
                d["effective_cost"] = round((original_cost - net_t_cash) / eff_qty, 3)
            else:
                d["effective_cost"] = 0
            d["cost_compensation"] = 0.0
        # Effective qty: user override > T-trade calculation
        if h.user_qty > 0:
            d["effective_qty"] = round(h.user_qty, 3)
        # Recalculate P&L using effective cost and effective qty
        eff_cost = d["effective_cost"]
        eff_qty = d["effective_qty"]
        d["value"] = round(d["current_price"] * eff_qty, 3)
        d["cost"] = round(eff_cost * eff_qty, 3)
        d["pnl"] = round(d["value"] - d["cost"], 3)
        d["pnl_pct"] = round((d["pnl"] / d["cost"] * 100) if d["cost"] > 0 else 0, 3)
        d["total_pnl"] = round(d["pnl"], 3)
        # Today's P&L
        today_str = datetime.now().strftime("%Y-%m-%d")
        # Check if position was created today
        is_new_today = h.created_at and h.created_at[:10] == today_str
        
        # Get today's trades only
        today_trades = [t for t in trades if t.trade_date[:10] == today_str]
        
        if today_trades:
            # Has trades today: calculate using today's trades
            today_sells = [t for t in today_trades if t.trade_type == "sell"]
            today_buys = [t for t in today_trades if t.trade_type == "buy"]
            sell_float = sum((t.price - d["previous_close"]) * t.quantity for t in today_sells)
            buy_float = sum((t.price - d["current_price"]) * t.quantity for t in today_buys if t.price > d["current_price"])
            today_fees = 0.0
            for t in today_trades:
                try:
                    import json as _j
                    today_fees += _j.loads(t.notes).get("fee", 0) if t.notes else 0
                except Exception:
                    pass
            d["daily_pnl"] = round(sell_float - buy_float - today_fees, 2)
        elif is_new_today:
            # New position today, no trades: daily P&L = (current - buy_price) * qty
            d["daily_pnl"] = round((d["current_price"] - h.buy_price) * eff_qty, 2)
        else:
            # No trades today: daily P&L = (current - previous_close) * qty
            d["daily_pnl"] = round((d["current_price"] - d["previous_close"]) * eff_qty, 2)
        d["daily_pnl_pct"] = round((d["daily_pnl"] / d["cost"] * 100) if d["cost"] > 0 else 0, 2)
        result.append(d)
    return jsonify(result)


@app.route("/api/stocks/search", methods=["GET"])
def search_stocks():
    """Search stocks by ticker or name.
    A-shares (starts with digits): use Sina Finance API for Chinese names.
    US/HK stocks: use Yahoo Finance API.
    """
    import requests as req
    import re
    query = request.args.get("q", "").strip()
    if not query or len(query) < 1:
        return jsonify([])

    # Detect if query looks like A-share (starts with digits or contains Chinese characters)
    is_a_share = bool(re.match(r'^\d', query)) or bool(re.search(r'[\u4e00-\u9fff]', query))

    if is_a_share:
        # Use Tencent Finance API for A-share Chinese names
        try:
            url = f"https://smartbox.gtimg.cn/s3/?v=2&q={query}&t=gp"
            headers = {"User-Agent": "Mozilla/5.0"}
            resp = req.get(url, headers=headers, timeout=5)
            if resp.status_code != 200:
                return jsonify([])
            text = resp.text
            # Format: v_hint="sh~code~name~pinyin~type;sh~code~name~pinyin~type"
            match = re.search(r'"(.+?)"', text)
            if not match:
                return jsonify([])
            raw = match.group(1)
            # Decode Unicode escape sequences (e.g. \u8d35\u5dde -> 贵州)
            try:
                import codecs
                raw = codecs.decode(raw, 'unicode_escape')
            except Exception:
                pass
            entries = raw.split(";")
            results = []
            for entry in entries:
                parts = entry.split("~")
                if len(parts) >= 3:
                    market = parts[0].strip()  # sh or sz
                    code = parts[1].strip()
                    name = parts[2].strip()
                    exchange_map = {"sh": "SSE", "sz": "SZSE"}
                    exchange = exchange_map.get(market, market.upper())
                    if code and name:
                        results.append({
                            "symbol": code,
                            "name": name,
                            "exchange": exchange,
                        })
            return jsonify(results[:10])
        except Exception:
            return jsonify([])
    else:
        # Use Yahoo Finance for US/HK stocks
        try:
            results = []
            # Try search first
            url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotes_count=10&news_count=0"
            headers = {"User-Agent": "Mozilla/5.0"}
            resp = req.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                for q in data.get("quotes", []):
                    symbol = q.get("symbol", "")
                    name = q.get("shortname") or q.get("longname") or ""
                    exchange = q.get("exchange") or ""
                    quote_type = q.get("quoteType") or ""
                    if quote_type == "EQUITY" and symbol:
                        results.append({
                            "symbol": symbol,
                            "name": name,
                            "exchange": exchange,
                        })
            # If search returned few results, try direct quote lookup
            if len(results) < 3 and query.upper() == query and len(query) <= 6:
                try:
                    quote_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{query.upper()}?interval=1d&range=1d"
                    quote_resp = req.get(quote_url, headers=headers, timeout=5)
                    if quote_resp.status_code == 200:
                        quote_data = quote_resp.json()
                        meta = quote_data["chart"]["result"][0]["meta"]
                        name = meta.get("shortName") or meta.get("longName") or ""
                        exchange = meta.get("exchangeName") or ""
                        symbol = query.upper()
                        # Avoid duplicates
                        if not any(r["symbol"] == symbol for r in results):
                            results.insert(0, {
                                "symbol": symbol,
                                "name": name,
                                "exchange": exchange,
                            })
                except Exception:
                    pass
            return jsonify(results[:10])
        except Exception:
            return jsonify([])


@app.route("/api/stocks", methods=["POST"])
def add_stock():
    """Add a new stock holding."""
    data = request.get_json(force=True)
    ticker = data.get("ticker", "").strip().upper()
    if not ticker:
        return jsonify({"error": "ticker is required"}), 400

    holding = StockHolding(
        ticker=ticker,
        name=data.get("name", "").strip(),
        buy_price=float(data.get("buy_price", 0)),
        current_price=float(data.get("buy_price", 0)),
        quantity=float(data.get("quantity", 0)),
        buy_date=data.get("buy_date", datetime.now().strftime("%Y-%m-%d")),
    )
    holding = storage.add_stock_holding(holding)
    return jsonify(holding.to_dict()), 201


@app.route("/api/stocks/<int:holding_id>", methods=["DELETE"])
def delete_stock(holding_id: int):  # noqa: F811
    """Delete a stock holding by ID."""
    if storage.delete_stock_holding(holding_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Holding not found"}), 404


@app.route("/api/stocks/<int:holding_id>", methods=["PUT"])
def update_stock(holding_id: int):
    """Update a stock holding's buy price, quantity, and buy date."""
    data = request.get_json(force=True)
    holdings = storage.get_stock_holdings()
    holding = next((h for h in holdings if h.id == holding_id), None)
    if not holding:
        return jsonify({"error": "Holding not found"}), 404

    # Update fields if provided
    if "buy_price" in data:
        holding.buy_price = float(data["buy_price"])
    if "quantity" in data:
        holding.quantity = float(data["quantity"])
    if "buy_date" in data:
        holding.buy_date = data["buy_date"]
    if "name" in data:
        holding.name = data["name"]
    if "user_cost" in data:
        holding.user_cost = float(data["user_cost"])
        # Calculate compensation: user_cost - calculated_cost
        trades = storage.get_day_trades(holding.ticker)
        qty_info = _calculate_day_trade_matched_qty(trades)
        eff_qty = holding.quantity + qty_info["net_qty"]
        if holding.user_qty > 0:
            eff_qty = holding.user_qty
        net_t_cash = sum(t.price * t.quantity for t in trades if t.trade_type == "sell") \
            - sum(t.price * t.quantity for t in trades if t.trade_type == "buy")
        original_cost = holding.buy_price * holding.quantity
        calculated_cost = (original_cost - net_t_cash) / eff_qty if eff_qty > 0 else 0
        holding.cost_compensation = holding.user_cost - calculated_cost
    if "user_qty" in data:
        holding.user_qty = float(data["user_qty"])

    storage.update_stock_holding_full(holding)
    # Return enriched data with effective cost/qty
    d = holding.to_dict()
    trades = storage.get_day_trades(holding.ticker)
    d["day_trade_pnl"] = round(_calculate_day_trade_pnl(trades), 3)
    qty_info = _calculate_day_trade_matched_qty(trades)
    d["day_trade_matched_buy_qty"] = qty_info["matched_buy_qty"]
    d["day_trade_matched_sell_qty"] = qty_info["matched_sell_qty"]
    d["effective_qty"] = holding.quantity + qty_info["net_qty"]
    if holding.user_cost > 0:
        d["effective_cost"] = round(holding.user_cost, 3)
    else:
        net_t_cash = sum(t.price * t.quantity for t in trades if t.trade_type == "sell") \
            - sum(t.price * t.quantity for t in trades if t.trade_type == "buy")
        eff_qty = d["effective_qty"]
        original_cost = holding.buy_price * holding.quantity
        d["effective_cost"] = round((original_cost - net_t_cash) / eff_qty, 3) if eff_qty > 0 else 0
    if holding.user_qty > 0:
        d["effective_qty"] = round(holding.user_qty, 3)
    eff_cost = d["effective_cost"]
    eff_qty = d["effective_qty"]
    d["value"] = round(d["current_price"] * eff_qty, 3)
    d["cost"] = round(eff_cost * eff_qty, 3)
    d["pnl"] = round(d["value"] - d["cost"], 3)
    d["pnl_pct"] = round((d["pnl"] / d["cost"] * 100) if d["cost"] > 0 else 0, 3)
    d["total_pnl"] = round(d["pnl"], 3)
    return jsonify(d)


@app.route("/api/stocks/day-trades", methods=["GET"])
def list_day_trades():
    """List day trades, optionally filtered by ticker."""
    ticker = request.args.get("ticker")
    trades = storage.get_day_trades(ticker)
    return jsonify([t.to_dict() for t in trades])


@app.route("/api/stocks/day-trades", methods=["POST"])
def add_day_trade():
    """Add a new day trade record."""
    from smart_ledger.models import DayTrade
    data = request.get_json(force=True)
    trade = DayTrade(
        ticker=data.get("ticker", ""),
        trade_type=data.get("trade_type", "sell"),
        price=float(data.get("price", 0)),
        quantity=float(data.get("quantity", 0)),
        trade_date=data.get("trade_date", ""),
        notes=data.get("notes", ""),
    )
    trade = storage.add_day_trade(trade)
    return jsonify(trade.to_dict())


@app.route("/api/stocks/day-trades/batch", methods=["POST"])
def add_day_trade_batch():
    """Create one sell + multiple buy trades atomically.

    Request body:
    {
        "ticker": "002202",
        "sell": { "price": 10.0, "quantity": 900, "trade_date": "2026-06-29" },
        "buys": [
            { "price": 9.5, "quantity": 100, "trade_date": "2026-06-29" },
            { "price": 9.4, "quantity": 200, "trade_date": "2026-06-29" },
            ...
        ]
    }
    """
    from smart_ledger.models import DayTrade
    data = request.get_json(force=True)
    ticker = data.get("ticker", "").strip()
    if not ticker:
        return jsonify({"error": "ticker is required"}), 400

    sell_data = data.get("sell")
    buys_data = data.get("buys", [])
    if not sell_data:
        return jsonify({"error": "sell data is required"}), 400
    if not buys_data:
        return jsonify({"error": "at least one buy is required"}), 400

    sell_price = float(sell_data.get("price", 0))
    sell_qty = float(sell_data.get("quantity", 0))
    sell_date = sell_data.get("trade_date", "")
    if sell_price <= 0 or sell_qty <= 0:
        return jsonify({"error": "sell price and quantity must be positive"}), 400

    # Estimate sell fee once
    sell_fee_est = _estimate_fee_internal("sell", sell_price, sell_qty)
    sell_notes = json_mod.dumps({"fee": sell_fee_est["total_fee"]})

    created = []

    # Create sell record
    sell_trade = DayTrade(
        ticker=ticker,
        trade_type="sell",
        price=sell_price,
        quantity=sell_qty,
        trade_date=sell_date,
        notes=sell_notes,
    )
    sell_trade = storage.add_day_trade(sell_trade)
    created.append(sell_trade.to_dict())

    # Create buy records
    for b in buys_data:
        buy_price = float(b.get("price", 0))
        buy_qty = float(b.get("quantity", 0))
        buy_date = b.get("trade_date", sell_date)
        if buy_price <= 0 or buy_qty <= 0:
            continue
        buy_fee_est = _estimate_fee_internal("buy", buy_price, buy_qty)
        buy_notes = json_mod.dumps({"fee": buy_fee_est["total_fee"]})
        buy_trade = DayTrade(
            ticker=ticker,
            trade_type="buy",
            price=buy_price,
            quantity=buy_qty,
            trade_date=buy_date,
            notes=buy_notes,
        )
        buy_trade = storage.add_day_trade(buy_trade)
        created.append(buy_trade.to_dict())

    return jsonify(created), 201


@app.route("/api/stocks/day-trades/<int:trade_id>", methods=["PUT"])
def update_day_trade(trade_id: int):
    """Update a day trade by ID."""
    data = request.get_json(force=True)
    update_data = {}
    if "price" in data:
        update_data["price"] = float(data["price"])
    if "quantity" in data:
        update_data["quantity"] = float(data["quantity"])
    if "trade_date" in data:
        update_data["trade_date"] = data["trade_date"]
    if "notes" in data:
        update_data["notes"] = data["notes"]
    # Auto-recalculate fee if price or quantity changed
    if "price" in update_data or "quantity" in update_data:
        trade = storage.get_day_trade(trade_id)
        if trade:
            price = update_data.get("price", trade.price)
            qty = update_data.get("quantity", trade.quantity)
            fee_est = _estimate_fee_internal(trade.trade_type, price, qty)
            import json as _json
            update_data["notes"] = _json.dumps({"fee": fee_est["total_fee"]})
    if storage.update_day_trade(trade_id, update_data):
        return jsonify({"ok": True})
    return jsonify({"error": "trade not found"}), 404


@app.route("/api/stocks/day-trades/<int:trade_id>", methods=["DELETE"])
def delete_day_trade(trade_id: int):
    """Delete a day trade by ID."""
    if storage.delete_day_trade(trade_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Trade not found"}), 404


@app.route("/api/stocks/closed", methods=["GET"])
def list_closed_stocks():
    """List all closed stock holdings with realized P&L."""
    holdings = storage.get_closed_stock_holdings()
    result = []
    for h in holdings:
        d = h.to_dict()
        # Calculate realized P&L: (sell_price - buy_price) * quantity
        cost = h.buy_price * h.quantity
        sell_value = h.sell_price * h.quantity
        realized_pnl = sell_value - cost
        d["realized_pnl"] = round(realized_pnl, 3)
        # Also include day trade P&L
        trades = storage.get_day_trades(h.ticker)
        day_trade_pnl = _calculate_day_trade_pnl(trades)
        d["day_trade_pnl"] = round(day_trade_pnl, 3)
        d["total_pnl"] = round(realized_pnl, 3)
        result.append(d)
    return jsonify(result)


@app.route("/api/stocks/<int:holding_id>/close", methods=["POST"])
def close_stock(holding_id: int):
    """Close (liquidate) a stock holding."""
    data = request.get_json(force=True)
    sell_price = float(data.get("sell_price", 0))
    sell_date = data.get("sell_date", datetime.now().strftime("%Y-%m-%d"))
    if sell_price <= 0:
        return jsonify({"error": "sell_price must be positive"}), 400
    holding = storage.get_stock_holding(holding_id)
    if not holding:
        return jsonify({"error": "Holding not found"}), 404
    if holding.is_closed:
        return jsonify({"error": "Holding is already closed"}), 400
    
    # Calculate sell quantity (use effective_qty if user_qty is set)
    trades = storage.get_day_trades(holding.ticker)
    qty_info = _calculate_day_trade_matched_qty(trades)
    eff_qty = holding.quantity + qty_info["net_qty"]
    if holding.user_qty > 0:
        eff_qty = holding.user_qty
    
    # Calculate fee
    fee_est = _estimate_fee_internal("sell", sell_price, eff_qty)
    fee = fee_est["total_fee"]
    
    storage.close_stock_holding(holding_id, sell_price, sell_date)
    return jsonify({"ok": True, "id": holding_id, "fee": fee, "sell_qty": eff_qty})


@app.route("/api/stocks/<int:holding_id>/sell", methods=["POST"])
def partial_sell_stock(holding_id: int):
    """Partially sell shares from a stock holding (reduces quantity, does not close)."""
    data = request.get_json(force=True)
    sell_price = float(data.get("sell_price", 0))
    sell_qty = float(data.get("sell_qty", 0))
    sell_date = data.get("sell_date", datetime.now().strftime("%Y-%m-%d"))
    fee = float(data.get("fee", 0))
    
    if sell_price <= 0:
        return jsonify({"error": "sell_price must be positive"}), 400
    if sell_qty <= 0:
        return jsonify({"error": "sell_qty must be positive"}), 400
    
    holding = storage.get_stock_holding(holding_id)
    if not holding:
        return jsonify({"error": "Holding not found"}), 404
    if holding.is_closed:
        return jsonify({"error": "Holding is already closed"}), 400
    
    # Use effective_qty (considering T-trades)
    trades = storage.get_day_trades(holding.ticker)
    qty_info = _calculate_day_trade_matched_qty(trades)
    eff_qty = holding.quantity + qty_info["net_qty"]
    if holding.user_qty > 0:
        eff_qty = holding.user_qty
    
    if sell_qty > eff_qty:
        return jsonify({"error": f"Sell qty ({sell_qty}) exceeds holding qty ({eff_qty})"}), 400
    
    # Calculate fee if not provided
    if fee <= 0:
        fee_est = _estimate_fee_internal("sell", sell_price, sell_qty)
        fee = fee_est["total_fee"]
    
    # Record the sell
    import sqlite3 as _sqlite3
    conn = _sqlite3.connect(storage.db_path)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO stock_sells (ticker, sell_price, sell_qty, sell_date, fee) VALUES (?, ?, ?, ?, ?)",
        (holding.ticker, sell_price, sell_qty, sell_date, fee)
    )
    conn.commit()
    conn.close()
    
    # Update holding quantity
    # If user_qty is set, reduce from user_qty; otherwise reduce from original quantity
    if holding.user_qty > 0:
        new_user_qty = holding.user_qty - sell_qty
        if new_user_qty <= 0:
            # All effective shares sold, close the holding
            storage.close_stock_holding(holding_id, sell_price, sell_date)
        else:
            holding.user_qty = new_user_qty
            # Also reduce original quantity proportionally
            holding.quantity = holding.quantity - sell_qty
            storage.update_stock_holding_full(holding)
    else:
        new_qty = holding.quantity - sell_qty
        if new_qty <= 0:
            storage.close_stock_holding(holding_id, sell_price, sell_date)
        else:
            holding.quantity = new_qty
            storage.update_stock_holding_full(holding)
    
    # Calculate remaining effective quantity
    remaining_eff = holding.user_qty if holding.user_qty > 0 else holding.quantity
    
    return jsonify({
        "ok": True,
        "id": holding_id,
        "sell_price": sell_price,
        "sell_qty": sell_qty,
        "sell_date": sell_date,
        "fee": fee,
        "remaining_qty": max(0, remaining_eff),
    })


@app.route("/api/stocks/<int:holding_id>/sells", methods=["GET"])
def list_stock_sells(holding_id: int):
    """List all partial sells for a stock holding."""
    holding = storage.get_stock_holding(holding_id)
    if not holding:
        return jsonify({"error": "Holding not found"}), 404
    
    import sqlite3 as _sqlite3
    conn = _sqlite3.connect(storage.db_path)
    conn.row_factory = _sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM stock_sells WHERE ticker = ? ORDER BY sell_date DESC", (holding.ticker,))
    sells = [dict(r) for r in cur.fetchall()]
    conn.close()
    
    return jsonify(sells)


@app.route("/api/stocks/position-currencies", methods=["GET"])
def get_position_currencies():
    """Get all position currency entries."""
    cur = storage.conn.cursor()
    cur.execute("SELECT id, currency, amount FROM stock_position_currencies ORDER BY id")
    rows = [{"id": r[0], "currency": r[1], "amount": r[2]} for r in cur.fetchall()]
    return jsonify(rows)


@app.route("/api/stocks/position-currencies", methods=["POST"])
def add_position_currency():
    """Add a new position currency entry."""
    data = request.get_json(force=True)
    currency = data.get("currency", "CNY").upper()
    amount = float(data.get("amount", 0))
    cur = storage.conn.cursor()
    cur.execute("INSERT INTO stock_position_currencies (currency, amount) VALUES (?, ?)", (currency, amount))
    storage.conn.commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


@app.route("/api/stocks/position-currencies/<int:item_id>", methods=["PUT"])
def update_position_currency(item_id: int):
    """Update a position currency entry."""
    data = request.get_json(force=True)
    amount = float(data.get("amount", 0))
    cur = storage.conn.cursor()
    cur.execute("UPDATE stock_position_currencies SET amount = ?, updated_at = datetime('now') WHERE id = ?", (amount, item_id))
    storage.conn.commit()
    return jsonify({"ok": True})


@app.route("/api/stocks/position-currencies/<int:item_id>", methods=["DELETE"])
def delete_position_currency(item_id: int):
    """Delete a position currency entry."""
    cur = storage.conn.cursor()
    cur.execute("DELETE FROM stock_position_currencies WHERE id = ?", (item_id,))
    storage.conn.commit()
    return jsonify({"ok": True})


@app.route("/api/stocks/position-summary", methods=["GET"])
def get_position_summary():
    """Get position management summary."""
    holdings = storage.get_stock_holdings()
    
    # Get total position amount from currencies table
    cur = storage.conn.cursor()
    cur.execute("SELECT id, currency, amount FROM stock_position_currencies ORDER BY id")
    currencies = [{"id": r[0], "currency": r[1], "amount": r[2]} for r in cur.fetchall()]
    
    # Get exchange rates for conversion
    cur.execute("SELECT from_currency, rate FROM exchange_rates WHERE to_currency = 'CNY'")
    rates = {r[0]: r[1] for r in cur.fetchall()}
    
    # Calculate total position in CNY
    total_position = 0
    for c in currencies:
        if c["currency"] == "CNY":
            total_position += c["amount"]
        else:
            rate = rates.get(c["currency"], 0)
            if rate > 0:
                total_position += c["amount"] * rate
            else:
                total_position += c["amount"]  # fallback
    
    # Calculate invested amount (total cost of all holdings in CNY)
    total_cost = 0
    total_value = 0
    total_pnl = 0
    for h in holdings:
        if h.is_closed:
            continue
        trades = storage.get_day_trades(h.ticker)
        qty_info = _calculate_day_trade_matched_qty(trades)
        eff_qty = h.quantity + qty_info["net_qty"]
        if h.user_qty > 0:
            eff_qty = h.user_qty
        eff_cost = h.user_cost if h.user_cost > 0 else h.buy_price
        cost = eff_cost * eff_qty
        value = h.current_price * eff_qty
        # Convert to CNY if not A-share
        currency = _get_stock_currency(h.ticker)
        if currency != 'CNY':
            rate = rates.get(currency, 0)
            if rate > 0:
                cost = cost * rate
                value = value * rate
        pnl = value - cost
        total_cost += cost
        total_value += value
        total_pnl += pnl
    
    # Cash balance = manually set idle cash (from currencies table)
    cash_balance = total_position
    
    # Total position = cash balance + total market value (dynamic)
    total_position = cash_balance + total_value
    
    # Get closed positions P&L (converted to CNY)
    closed_holdings = storage.get_closed_stock_holdings()
    realized_pnl = 0
    for h in closed_holdings:
        pnl = (h.sell_price - h.buy_price) * h.quantity
        currency = _get_stock_currency(h.ticker)
        if currency != 'CNY':
            rate = rates.get(currency, 0)
            if rate > 0:
                pnl = pnl * rate
        realized_pnl += pnl
    
    # Get total T-trade P&L (converted to CNY)
    all_tickers = set(h.ticker for h in holdings if not h.is_closed)
    all_tickers.update(h.ticker for h in closed_holdings)
    total_t_pnl = 0
    for ticker in all_tickers:
        trades = storage.get_day_trades(ticker)
        t_pnl = _calculate_day_trade_pnl(trades)
        currency = _get_stock_currency(ticker)
        if currency != 'CNY':
            rate = rates.get(currency, 0)
            if rate > 0:
                t_pnl = t_pnl * rate
        total_t_pnl += t_pnl
    
    # Get transfers
    cur.execute("SELECT transfer_type, SUM(amount) FROM stock_transfers GROUP BY transfer_type")
    transfers = {r[0]: r[1] for r in cur.fetchall()}
    total_transfer_in = transfers.get('in', 0) or 0
    total_transfer_out = transfers.get('out', 0) or 0
    
    # Calculate total P&L (A-shares + US + HK)
    total_pnl_all = total_pnl + realized_pnl + total_t_pnl
    
    # Calculate loss: (Transfer In - Transfer Out) - Current Value
    net_invested = total_transfer_in - total_transfer_out
    loss_amount = max(0, net_invested - total_value)
    
    # Calculate total return rate: Total P&L / (Transfer In - Transfer Out)
    total_return_rate = 0
    if net_invested > 0:
        total_return_rate = (total_pnl_all / net_invested) * 100
    
    # Calculate market breakdown
    market_breakdown = {'A': {'cost': 0, 'value': 0}, 'US': {'cost': 0, 'value': 0}, 'HK': {'cost': 0, 'value': 0}}
    for h in holdings:
        if h.is_closed:
            continue
        ticker = h.ticker
        if ticker[0].isdigit():
            market = 'A'
        elif ticker.endswith('.HK'):
            market = 'HK'
        else:
            market = 'US'
        trades = storage.get_day_trades(h.ticker)
        qty_info = _calculate_day_trade_matched_qty(trades)
        eff_qty = h.quantity + qty_info["net_qty"]
        if h.user_qty > 0:
            eff_qty = h.user_qty
        eff_cost = h.user_cost if h.user_cost > 0 else h.buy_price
        cost = eff_cost * eff_qty
        value = h.current_price * eff_qty
        market_breakdown[market]['cost'] += cost
        market_breakdown[market]['value'] += value
    
    return jsonify({
        "total_position_amount": round(total_position, 2),
        "currencies": currencies,
        "invested_amount": round(total_cost, 2),
        "cash_balance": round(cash_balance, 2),
        "current_value": round(total_value, 2),
        "market_breakdown": {
            "A": {"cost": round(market_breakdown['A']['cost'], 2), "value": round(market_breakdown['A']['value'], 2)},
            "US": {"cost": round(market_breakdown['US']['cost'], 2), "value": round(market_breakdown['US']['value'], 2)},
            "HK": {"cost": round(market_breakdown['HK']['cost'], 2), "value": round(market_breakdown['HK']['value'], 2)},
        },
        "cash_balance": round(cash_balance, 2),
        "current_value": round(total_value, 2),
        "unrealized_pnl": round(total_pnl, 2),
        "realized_pnl": round(realized_pnl, 2),
        "total_t_pnl": round(total_t_pnl, 2),
        "total_pnl": round(total_pnl_all, 2),
        "transfer_in": round(total_transfer_in, 2),
        "transfer_out": round(total_transfer_out, 2),
        "loss_amount": round(loss_amount, 2),
        "total_return_rate": round(total_return_rate, 2),
    })


@app.route("/api/stocks/transfers", methods=["GET"])
def get_stock_transfers():
    """Get all stock transfers."""
    cur = storage.conn.cursor()
    cur.execute("SELECT id, transfer_type, amount, transfer_date, notes FROM stock_transfers ORDER BY transfer_date DESC")
    rows = [{"id": r[0], "transfer_type": r[1], "amount": r[2], "transfer_date": r[3], "notes": r[4]} for r in cur.fetchall()]
    return jsonify(rows)


@app.route("/api/stocks/transfers", methods=["POST"])
def add_stock_transfer():
    """Add a new stock transfer."""
    data = request.get_json(force=True)
    transfer_type = data.get("transfer_type", "in")
    amount = float(data.get("amount", 0))
    transfer_date = data.get("transfer_date", datetime.now().strftime("%Y-%m-%d"))
    notes = data.get("notes", "")
    cur = storage.conn.cursor()
    cur.execute("INSERT INTO stock_transfers (transfer_type, amount, transfer_date, notes) VALUES (?, ?, ?, ?)",
                (transfer_type, amount, transfer_date, notes))
    storage.conn.commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


@app.route("/api/stocks/transfers/<int:transfer_id>", methods=["DELETE"])
def delete_stock_transfer(transfer_id: int):
    """Delete a stock transfer."""
    cur = storage.conn.cursor()
    cur.execute("DELETE FROM stock_transfers WHERE id = ?", (transfer_id,))
    storage.conn.commit()
    return jsonify({"ok": True})


@app.route("/api/stocks/fee-settings", methods=["GET"])
def get_fee_settings():
    """Get current fee settings."""
    return jsonify(storage.get_fee_settings())


@app.route("/api/stocks/fee-settings", methods=["PUT"])
def update_fee_settings():
    """Update fee settings."""
    data = request.get_json(force=True)
    result = storage.update_fee_settings(
        commission_rate=float(data.get("commission_rate", 0.00025)),
        min_commission=float(data.get("min_commission", 5.0)),
        waive_min_commission=bool(data.get("waive_min_commission", False)),
    )
    return jsonify(result)


@app.route("/api/stocks/estimate-fees", methods=["POST"])
def estimate_fees():
    """Estimate trading fees for a given trade.
    
    A-share fees:
    - Commission: amount * commission_rate (min 5 yuan if 不免五)
    - Stamp duty: amount * 0.0005 (sell only, as of 2023-08-28)
    - Transfer fee: amount * 0.00001 (both sides)
    """
    data = request.get_json(force=True)
    trade_type = data.get("trade_type", "sell")  # 'buy' or 'sell'
    price = float(data.get("price", 0))
    quantity = float(data.get("quantity", 0))
    market = data.get("market", "CN")  # 'CN', 'US', 'HK'
    
    amount = price * quantity
    settings = storage.get_fee_settings()
    commission_rate = settings["commission_rate"]
    min_commission = settings["min_commission"]
    waive_min = bool(settings["waive_min_commission"])
    
    # Commission calculation
    commission = amount * commission_rate
    if not waive_min and commission < min_commission and commission > 0:
        commission = min_commission
    
    # Stamp duty (sell only for A-shares)
    stamp_duty = 0.0
    if market == "CN" and trade_type == "sell":
        stamp_duty = amount * 0.0005  # 0.05%
    
    # Transfer fee (both sides for A-shares)
    transfer_fee = 0.0
    if market == "CN":
        transfer_fee = amount * 0.00001  # 0.001%
    
    total_fee = commission + stamp_duty + transfer_fee
    
    return jsonify({
        "amount": round(amount, 2),
        "commission": round(commission, 2),
        "commission_rate": commission_rate,
        "min_commission": min_commission,
        "waive_min_commission": waive_min,
        "stamp_duty": round(stamp_duty, 2),
        "transfer_fee": round(transfer_fee, 2),
        "total_fee": round(total_fee, 2),
        "net_amount": round(amount - total_fee if trade_type == "sell" else amount + total_fee, 2),
        "market": market,
    })


@app.route("/api/stocks/refresh", methods=["POST"])
def refresh_stocks():
    """Refresh current prices for all stock holdings via Yahoo Finance."""
    holdings = storage.get_stock_holdings()
    updated = []
    for h in holdings:
        try:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{h.ticker}?interval=1d&range=1d"
            resp = http_requests.get(url, timeout=8, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            if resp.status_code == 200:
                meta = resp.json()["chart"]["result"][0]["meta"]
                price = meta.get("regularMarketPrice", 0)
                if price:
                    h.current_price = float(price)
                    storage.update_stock_holding(h)
        except Exception:
            # Keep existing price on failure
            pass
        d = h.to_dict()
        trades = storage.get_day_trades(h.ticker)
        d["day_trade_pnl"] = round(_calculate_day_trade_pnl(trades), 3)
        d["total_pnl"] = round(d["pnl"], 3)
        updated.append(d)
    return jsonify(updated)


@app.route("/api/stocks/refresh-prices", methods=["POST"])
def refresh_stock_prices():
    """Refresh prices for all holdings. A-shares use Tencent Finance, others use Yahoo Finance.

    Also syncs stock P&L to the '投资收益' savings goal after refresh.
    Updates price cache for subsequent GET /api/stocks calls.
    Returns updated holdings list.
    """
    updated = _refresh_all_stock_prices()
    # Auto-sync P&L to savings goal
    _sync_stock_pnl_to_savings_goal()
    return jsonify(updated)


@app.route("/api/stocks/refresh-prices/async", methods=["POST"])
def refresh_stock_prices_async():
    """Refresh prices in background thread, return immediately with current data."""
    def _bg_refresh():
        _refresh_all_stock_prices()
        _sync_stock_pnl_to_savings_goal()

    threading.Thread(target=_bg_refresh, daemon=True).start()
    # Return current holdings immediately (using cached prices)
    return jsonify(_get_holdings_with_cache())


# ── Stock P&L Sync to Savings Goals ─────────────────────────────

@app.route("/api/savings-goals/sync-stock-pnl", methods=["POST"])
def sync_stock_pnl():
    """Refresh holdings prices, then sync P&L to the configured savings goal."""
    _refresh_all_stock_prices()
    goal_dict = _sync_stock_pnl_to_savings_goal()
    if goal_dict is None:
        return jsonify({"error": "No savings goal matched STOCK_PNL_GOAL_ID"}), 404
    goal = storage.get_savings_goal(goal_dict["id"])
    return jsonify(_get_goal_with_currencies(goal, storage))


def _is_a_share(ticker: str) -> bool:
    """Detect if a ticker is an A-share (starts with digits or contains Chinese)."""
    return bool(_re.match(r'^\d', ticker)) or bool(_re.search(r'[\u4e00-\u9fff]', ticker))


def _get_stock_currency(ticker: str) -> str:
    """Get the currency for a stock ticker."""
    if _is_a_share(ticker):
        return 'CNY'
    elif ticker.endswith('.HK'):
        return 'HKD'
    else:
        return 'USD'  # Default to USD for US stocks


def _fetch_a_share_price(ticker: str) -> tuple:
    """Fetch real-time A-share price from Tencent Finance API.

    Args:
        ticker: Stock code like '600519' or '000001'.
    Returns:
        Tuple of (current_price, previous_close) or (0.0, 0.0) on failure.
    """
    # Determine market prefix: sh for 6xxxxx, sz for 0xxxxx/3xxxxx
    if ticker.startswith('6'):
        qt_code = f'sh{ticker}'
    else:
        qt_code = f'sz{ticker}'
    try:
        url = f'https://qt.gtimg.cn/q={qt_code}'
        resp = http_requests.get(url, timeout=5, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        if resp.status_code != 200:
            return (0.0, 0.0)
        # Response: v_sh600519="1~贵州茅台~600519~1800.00~1790.00~..."
        text = resp.text
        match = _re.search(r'"(.+?)"', text)
        if not match:
            return (0.0, 0.0)
        parts = match.group(1).split('~')
        if len(parts) > 4:
            price = float(parts[3]) if parts[3] else 0
            prev_close = float(parts[4]) if parts[4] else 0
            return (price if price > 0 else 0.0, prev_close if prev_close > 0 else 0.0)
    except Exception:
        pass
    return (0.0, 0.0)


def _fetch_yahoo_price(ticker: str) -> tuple:
    """Fetch price and previous close from Yahoo Finance (US/HK stocks).

    Args:
        ticker: Stock ticker like 'AAPL' or '0700.HK'.
    Returns:
        Tuple of (current_price, previous_close) or (0.0, 0.0) on failure.
    """
    try:
        url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d'
        resp = http_requests.get(url, timeout=8, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        if resp.status_code == 200:
            meta = resp.json()['chart']['result'][0]['meta']
            price = meta.get('regularMarketPrice', 0)
            prev_close = meta.get('chartPreviousClose', 0)
            return (float(price) if price else 0.0, float(prev_close) if prev_close else 0.0)
    except Exception:
        pass
    return (0.0, 0.0)


def _get_holdings_with_cache() -> list:
    """Build holdings list using cached prices (no external API calls)."""
    holdings = storage.get_stock_holdings()
    result = []
    for h in holdings:
        d = h.to_dict()
        cached_price, cached_prev = _get_cached_price(h.ticker)
        if cached_price > 0:
            d["current_price"] = cached_price
            d["previous_close"] = cached_prev
            d["value"] = round(cached_price * h.quantity, 3)
            d["pnl"] = round(d["value"] - d["cost"], 3)
            d["pnl_pct"] = round((d["pnl"] / d["cost"] * 100) if d["cost"] > 0 else 0, 3)
        trades = storage.get_day_trades(h.ticker)
        d["day_trade_pnl"] = round(_calculate_day_trade_pnl(trades), 3)
        d["total_pnl"] = round(d["pnl"], 3)
        qty_info = _calculate_day_trade_matched_qty(trades)
        d["day_trade_matched_buy_qty"] = qty_info["matched_buy_qty"]
        d["day_trade_matched_sell_qty"] = qty_info["matched_sell_qty"]
        d["effective_qty"] = h.quantity + qty_info["net_qty"]
        # Effective cost: use user-set values if available, otherwise calculate from T-trades
        if h.user_cost > 0:
            d["effective_cost"] = round(h.user_cost, 3)
        else:
            net_t_cash = sum(t.price * t.quantity for t in trades if t.trade_type == "sell") \
                - sum(t.price * t.quantity for t in trades if t.trade_type == "buy")
            eff_qty = d["effective_qty"]
            original_cost = h.buy_price * h.quantity
            if eff_qty > 0:
                d["effective_cost"] = round((original_cost - net_t_cash) / eff_qty, 3)
            else:
                d["effective_cost"] = 0
        # Effective qty: use user-set value if available
        if h.user_qty > 0:
            d["effective_qty"] = round(h.user_qty, 3)
        result.append(d)
    return result


def _refresh_all_stock_prices() -> list:
    """Refresh prices for all stock holdings. Returns updated holdings list.

    Updates the in-memory price cache for each ticker.
    """
    holdings = storage.get_stock_holdings()
    updated = []
    for h in holdings:
        try:
            if _is_a_share(h.ticker):
                price, prev_close = _fetch_a_share_price(h.ticker)
            else:
                price, prev_close = _fetch_yahoo_price(h.ticker)
            if price > 0:
                h.current_price = price
                if prev_close > 0:
                    h.previous_close = prev_close
                storage.update_stock_holding(h)
                _set_cached_price(h.ticker, price, prev_close if prev_close > 0 else 0.0)
        except Exception:
            pass
        d = h.to_dict()
        # Calculate day trade P&L for this ticker
        trades = storage.get_day_trades(h.ticker)
        d["day_trade_pnl"] = round(_calculate_day_trade_pnl(trades), 3)
        d["total_pnl"] = round(d["pnl"], 3)
        updated.append(d)
    return updated


def _estimate_fee_internal(trade_type: str, price: float, quantity: float, market: str = "CN") -> dict:
    """Estimate trading fees (reused by batch endpoint)."""
    amount = price * quantity
    settings = storage.get_fee_settings()
    commission_rate = settings["commission_rate"]
    min_commission = settings["min_commission"]
    waive_min = bool(settings["waive_min_commission"])

    commission = amount * commission_rate
    if not waive_min and commission < min_commission and commission > 0:
        commission = min_commission

    stamp_duty = amount * 0.0005 if market == "CN" and trade_type == "sell" else 0.0
    transfer_fee = amount * 0.00001 if market == "CN" else 0.0
    total_fee = commission + stamp_duty + transfer_fee

    return {
        "amount": round(amount, 2),
        "commission": round(commission, 2),
        "commission_rate": commission_rate,
        "min_commission": min_commission,
        "waive_min_commission": waive_min,
        "stamp_duty": round(stamp_duty, 2),
        "transfer_fee": round(transfer_fee, 2),
        "total_fee": round(total_fee, 2),
        "net_amount": round(amount - total_fee if trade_type == "sell" else amount + total_fee, 2),
        "market": market,
    }


def _calculate_day_trade_pnl(trades: list) -> float:
    """Calculate total P&L from day trades (T-trading) for a ticker.

    Per-day matching: each day's sells and buys are matched independently.
    - PnL per matched pair = (sell_price - buy_price) * matched_qty - prorated_sell_fee - prorated_buy_fee
    - Cross-day FIFO is NOT used (T-trades are day-scoped)
    """
    if not trades:
        return 0.0

    from collections import defaultdict
    daily = defaultdict(lambda: {"sells": [], "buys": []})

    for trade in trades:
        day = trade.trade_date[:10]
        fee = 0.0
        try:
            import json as _json
            fee = _json.loads(trade.notes).get('fee', 0)
        except Exception:
            pass
        if trade.trade_type == "sell":
            daily[day]["sells"].append({"price": trade.price, "qty": trade.quantity, "fee": fee})
        else:
            daily[day]["buys"].append({"price": trade.price, "qty": trade.quantity, "fee": fee})

    total_pnl = 0.0

    for day in sorted(daily.keys()):
        sells = daily[day]["sells"]
        buys = daily[day]["buys"]
        sell_idx = 0
        buy_idx = 0
        sell_remaining = sells[0]["qty"] if sells else 0
        buy_remaining = buys[0]["qty"] if buys else 0

        while sell_idx < len(sells) and buy_idx < len(buys):
            s = sells[sell_idx]
            b = buys[buy_idx]
            match_qty = min(sell_remaining, buy_remaining)
            if match_qty <= 0:
                break
            # Brokerage formula: full buy fee, prorated sell fee only
            prorated_sell_fee = s["fee"] * (match_qty / s["qty"]) if s["qty"] > 0 else 0
            total_pnl += (s["price"] - b["price"]) * match_qty - prorated_sell_fee - b["fee"]
            sell_remaining -= match_qty
            buy_remaining -= match_qty
            if sell_remaining <= 0:
                sell_idx += 1
                if sell_idx < len(sells):
                    sell_remaining = sells[sell_idx]["qty"]
            if buy_remaining <= 0:
                buy_idx += 1
                if buy_idx < len(buys):
                    buy_remaining = buys[buy_idx]["qty"]

    return total_pnl


def _calculate_day_trade_matched_qty(trades: list) -> dict:
    """Calculate effective quantity change from T-trades, grouped by day.

    Each day's net = total_buy_qty - total_sell_qty.
    Cumulative net applied to original holding quantity.

    Returns dict with:
      - matched_buy_qty: total shares bought back across all days
      - matched_sell_qty: total shares sold across all days
      - net_qty: cumulative daily net (positive = more bought back)
    """
    if not trades:
        return {"matched_buy_qty": 0, "matched_sell_qty": 0, "net_qty": 0}

    from collections import defaultdict
    daily = defaultdict(lambda: {"buy": 0, "sell": 0})

    for trade in trades:
        day = trade.trade_date[:10]
        if trade.trade_type == "sell":
            daily[day]["sell"] += trade.quantity
        else:
            daily[day]["buy"] += trade.quantity

    total_buy = 0
    total_sell = 0
    for day_data in daily.values():
        total_buy += day_data["buy"]
        total_sell += day_data["sell"]

    return {
        "matched_buy_qty": total_buy,
        "matched_sell_qty": total_sell,
        "net_qty": total_buy - total_sell,
    }


def _holding_currency(ticker: str) -> str:
    """Detect quote currency from ticker (aligned with web/src/lib/market.ts)."""
    t = ticker.strip().upper()
    if _re.search(r"\.HK$", t) or _re.match(r"^\d{5}$", t):
        return "HKD"
    if _re.match(r"^\d", t) or _re.search(r"[\u4e00-\u9fff]", t):
        return "CNY"
    return "USD"


def _calculate_stock_pnl() -> float:
    """Calculate total floating P&L from all stock holdings (CNY)."""
    holdings = storage.get_stock_holdings()
    rates = get_realtime_rates()
    total_pnl = 0.0
    for h in holdings:
        native_pnl = (h.current_price * h.quantity) - (h.buy_price * h.quantity)
        total_pnl += _convert_to_cny(native_pnl, _holding_currency(h.ticker), rates)
    return round(total_pnl, 3)


def _goal_gross_total(goal: SavingsGoal) -> float:
    """Total saved = principal (current_amount) + investment gains (stock_pnl)."""
    return round(goal.current_amount + (goal.stock_pnl or 0), 2)


def _split_principal_from_gross(gross_total: float, stock_pnl: float) -> float:
    """Principal = total saved minus synced investment gains."""
    return round(max(gross_total - (stock_pnl or 0), 0), 2)


def _apply_stock_pnl_sync(goal: SavingsGoal, total_pnl: float) -> SavingsGoal:
    """Update holdings gains; gross total = principal + stock_pnl (principal unchanged)."""
    goal.stock_pnl = round(total_pnl, 3)
    storage.update_savings_goal(goal)
    return goal


def _resolve_stock_pnl_goal(goals: list) -> SavingsGoal | None:
    """Resolve which savings goal receives stock P&L updates."""
    if STOCK_PNL_GOAL_ID:
        return next((g for g in goals if str(g.id) == STOCK_PNL_GOAL_ID), None)
    if STOCK_PNL_GOAL_NAME:
        return next((g for g in goals if g.name == STOCK_PNL_GOAL_NAME), None)
    return None


def _sync_stock_pnl_to_savings_goal() -> dict | None:
    """Sync stock P&L into a configured savings goal.

    Configure via env:
      STOCK_PNL_GOAL_ID   — goal id (takes precedence; no auto-create)
      STOCK_PNL_GOAL_NAME — goal name to match or create (default below)
      STOCK_PNL_GOAL_TARGET / STOCK_PNL_GOAL_DEADLINE — used when creating

    current_amount stores principal only; stock_pnl stores A-share/US holdings gains.
    Gross saved total = current_amount + stock_pnl; history records gross totals.
    """
    total_pnl = _calculate_stock_pnl()
    goals = storage.get_savings_goals()

    # Remove legacy standalone goal only if it is not the configured sync target
    old_goal = next((g for g in goals if g.name == "投资收益"), None)
    if old_goal and old_goal.name != STOCK_PNL_GOAL_NAME and str(old_goal.id) != STOCK_PNL_GOAL_ID:
        storage.delete_savings_goal(old_goal.id)
        goals = [g for g in goals if g.id != old_goal.id]

    goal = _resolve_stock_pnl_goal(goals)
    if goal is None and STOCK_PNL_GOAL_ID:
        return None

    if goal is None:
        goal = SavingsGoal(
            name=STOCK_PNL_GOAL_NAME,
            target_amount=STOCK_PNL_GOAL_TARGET,
            current_amount=0,
            stock_pnl=total_pnl,
            deadline=STOCK_PNL_GOAL_DEADLINE,
            color=STOCK_PNL_GOAL_COLOR,
        )
        goal = storage.add_savings_goal(goal)
    else:
        goal = _apply_stock_pnl_sync(goal, total_pnl)
    return goal.to_dict()


def _get_stock_pnl() -> float:
    """Get the current stock P&L without modifying anything."""
    return _calculate_stock_pnl()


GOAL_TARGET = int(os.getenv("GOAL_TARGET", "1000000"))  # 百万存款目标
GOAL_DEADLINE = os.getenv("GOAL_DEADLINE", "2036-05")  # 目标截止日期 (YYYY-MM)
FIRE_ANNUAL_RETURN_PCT = float(os.getenv("FIRE_ANNUAL_RETURN_PCT", "7.0"))

# Stock P&L → savings goal sync (see _sync_stock_pnl_to_savings_goal)
STOCK_PNL_GOAL_ID = os.getenv("STOCK_PNL_GOAL_ID", "").strip()
STOCK_PNL_GOAL_NAME = os.getenv("STOCK_PNL_GOAL_NAME", "30岁之前赚到100万")
STOCK_PNL_GOAL_TARGET = float(os.getenv("STOCK_PNL_GOAL_TARGET", str(GOAL_TARGET)))
STOCK_PNL_GOAL_DEADLINE = os.getenv("STOCK_PNL_GOAL_DEADLINE", GOAL_DEADLINE)
STOCK_PNL_GOAL_COLOR = os.getenv("STOCK_PNL_GOAL_COLOR", "#0d7377")


def _month_range(now, count, step=1):
    """Yield (year, month, 'YYYY-MM') for the last *count* months."""
    for i in range(count * step - 1, -1, -step):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        while m > 12:
            m -= 12
            y += 1
        yield y, m, f"{y:04d}-{m:02d}"


FIRE_CATEGORY_COLORS = [
    "#00d4ff", "#ff4757", "#00ff88", "#ffa502", "#7c3aed",
    "#d946ef", "#0891b2", "#ea580c", "#16a34a", "#ca8a04",
]


def _compute_fire_metrics(
    cur,
    annual_expenses: float,
    monthly_avg_saving: float,
    current_assets: float,
    fire_number: float,
    annual_return_pct: float = 7.0,
) -> dict:
    """Compute FIRE-related metrics including estimated years."""
    progress_pct = round(current_assets / fire_number * 100, 2) if fire_number > 0 else 0
    remaining = max(fire_number - current_assets, 0)

    # Estimate years using compound growth simulation:
    # Each year: assets grow by return_rate, and savings are added monthly.
    if monthly_avg_saving > 0 and annual_return_pct > 0:
        monthly_rate = annual_return_pct / 100.0 / 12.0
        years = 0
        sim_assets = current_assets
        while sim_assets < fire_number and years < 100:
            for _ in range(12):
                sim_assets = sim_assets * (1 + monthly_rate) + monthly_avg_saving
            years += 1
        estimated_years = round(years + (fire_number - sim_assets) / (monthly_avg_saving * 12 + sim_assets * annual_return_pct / 100), 1) if sim_assets < fire_number else years
    elif monthly_avg_saving > 0:
        estimated_years = round(remaining / (monthly_avg_saving * 12), 1)
    else:
        estimated_years = 99.9

    # Estimated completion date
    now = datetime.now()
    est_total_months = now.month + int(estimated_years * 12)
    est_year = now.year + est_total_months // 12
    est_month = est_total_months % 12 + 1
    if est_month > 12:
        est_month -= 12
        est_year += 1
    estimated_date = f"{est_year:04d}-{est_month:02d}"

    # Savings per expense ratio
    savings_per_expense = round(monthly_avg_saving * 12 / annual_expenses, 2) if annual_expenses > 0 else 0

    # Emergency fund months: current_assets / monthly_expenses
    monthly_expenses = annual_expenses / 12.0
    emergency_fund_months = round(current_assets / monthly_expenses, 1) if monthly_expenses > 0 else 0

    return {
        "target": fire_number,
        "current_assets": round(current_assets, 2),
        "progress_pct": progress_pct,
        "annual_expenses": round(annual_expenses, 2),
        "fire_number": round(fire_number, 2),
        "remaining": round(remaining, 2),
        "monthly_avg_saving": round(monthly_avg_saving, 2),
        "estimated_years": estimated_years,
        "estimated_date": estimated_date,
        "savings_rate": 0,  # filled later
        "savings_per_expense": savings_per_expense,
        "emergency_fund_months": emergency_fund_months,
    }


@app.route("/api/analysis", methods=["GET"])
def get_analysis():
    """Return FIRE-focused financial analysis dashboard data (upgraded)."""
    now = datetime.now()
    cur = storage.conn.cursor()

    # ── helpers ──────────────────────────────────────────────────
    def _month_totals(year, month):
        ms = f"{year:04d}-{month:02d}"
        cur.execute(
            """SELECT
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expense
            FROM transactions WHERE strftime('%Y-%m', date) = ?""",
            (ms,),
        )
        r = cur.fetchone()
        return r["income"], r["expense"]

    # ── all-time totals ──────────────────────────────────────────
    cur.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_expense
        FROM transactions
    """)
    all_time = cur.fetchone()
    total_income_all = all_time["total_income"]
    total_expense_all = all_time["total_expense"]
    net_saving_all = total_income_all - total_expense_all

    # ── current assets (use savings goal's current_amount as primary source) ──
    holdings = storage.get_stock_holdings()
    stock_value = sum(h.current_price * h.quantity for h in holdings)
    cash_from_assets = sum(
        a.amount for a in storage.get_assets()
        if any(k in (a.category or "") for k in ("现金", "存款", "货币"))
    )
    cash_savings = cash_from_assets if cash_from_assets > 0 else max(net_saving_all, 0)
    net_worth_data = storage.get_net_worth()
    total_assets_from_table = net_worth_data["total_assets"]
    total_liabilities_from_table = net_worth_data["total_liabilities"]
    net_worth = net_worth_data["net_worth"]

    goals = storage.get_savings_goals()
    main_goal = _resolve_stock_pnl_goal(goals)
    if main_goal:
        goal_gross = storage.goal_gross_amount(main_goal)
        if goal_gross > 0:
            current_assets = goal_gross
    else:
        if total_assets_from_table > 0:
            current_assets = max(net_worth, 0)
        else:
            current_assets = cash_savings + stock_value

    # ── monthly avg saving (last 12 months) ──────────────────────
    monthly_savings_list = []
    for y, m, ms in _month_range(now, 12):
        inc, exp = _month_totals(y, m)
        monthly_savings_list.append(inc - exp)
    monthly_avg_saving = round(
        sum(monthly_savings_list) / max(len(monthly_savings_list), 1), 2
    )

    # ── annual expenses (last 12 months) ─────────────────────────
    annual_expenses = 0
    for y, m, ms in _month_range(now, 12):
        _, exp = _month_totals(y, m)
        annual_expenses += exp
    annual_expenses = round(annual_expenses, 2)
    if annual_expenses == 0:
        annual_expenses = 96000  # fallback default

    # FIRE number = annual expenses × 25
    fire_number = annual_expenses * 25

    # ── FIRE metrics ─────────────────────────────────────────────
    fire = _compute_fire_metrics(
        cur, annual_expenses, monthly_avg_saving,
        current_assets, fire_number, FIRE_ANNUAL_RETURN_PCT,
    )

    # Current month savings rate
    cur_inc, cur_exp = _month_totals(now.year, now.month)
    cur_saving = cur_inc - cur_exp
    fire["savings_rate"] = round(
        cur_saving / cur_exp * 100, 1
    ) if cur_exp > 0 else 0

    # Add net_worth and investable_assets to fire section
    fire["net_worth"] = round(net_worth, 2)
    investable_assets = storage.get_investable_assets()
    fire["investable_assets"] = round(investable_assets, 2)

    # ── flow metrics ─────────────────────────────────────────────
    monthly_income = round(cur_inc, 2)
    monthly_expense = round(cur_exp, 2)
    monthly_net_saving = round(cur_saving, 2)
    savings_rate = fire["savings_rate"]
    savings_per_expense = round(monthly_net_saving / monthly_expense, 3) if monthly_expense > 0 else 0

    flow_metrics = {
        "monthly_income": monthly_income,
        "monthly_expense": monthly_expense,
        "monthly_net_saving": monthly_net_saving,
        "savings_rate": savings_rate,
        "savings_per_expense": savings_per_expense,
    }

    # ── stock metrics (balance sheet) ────────────────────────────
    stock_metrics = storage.get_stock_metrics(monthly_avg_saving)
    # Fill debt_to_income: monthly liabilities / monthly income
    if monthly_income > 0:
        stock_metrics["debt_to_income"] = round(
            stock_metrics["total_liabilities"] / monthly_income * 100, 1
        )

    # ── asset allocation (from assets table) ─────────────────────
    asset_allocation = storage.get_asset_allocation()
    # Fallback: if no assets table data, derive from cash + stocks
    if not asset_allocation:
        total_portfolio = cash_savings + stock_value
        if total_portfolio > 0:
            if stock_value > 0:
                asset_allocation.append({"category": "可投资金融资产", "amount": round(stock_value, 2), "percentage": round(stock_value / total_portfolio * 100, 1), "is_investable": True})
            if cash_savings > 0:
                asset_allocation.append({"category": "现金及等价物", "amount": round(cash_savings, 2), "percentage": round(cash_savings / total_portfolio * 100, 1), "is_investable": True})

    # ── liability breakdown (from liabilities table) ──────────────
    liability_breakdown = storage.get_liability_breakdown()

    # ── asset growth (last 24 months, scaled to current assets) ───
    cumulative = 0.0
    month_rows = []
    for y, m, ms in _month_range(now, 24):
        inc, exp = _month_totals(y, m)
        cumulative += inc - exp
        month_rows.append((ms, cumulative))

    end_cumulative = month_rows[-1][1] if month_rows else 0.0
    scale = (current_assets / end_cumulative) if end_cumulative > 0 and current_assets > 0 else 1.0
    asset_growth = []
    for ms, cum in month_rows:
        actual = round(cum * scale, 2)
        asset_growth.append({
            "month": ms,
            "actual": actual,
            "target_optimistic": round(actual * 1.003, 2),
            "target_baseline": actual,
            "target_conservative": round(actual * 0.998, 2),
        })

    # ── monthly saving trend (last 12 months) ────────────────────
    deadline_dt = datetime.strptime(GOAL_DEADLINE, "%Y-%m")
    months_to_deadline = max(
        (deadline_dt.year - now.year) * 12 + (deadline_dt.month - now.month), 1
    )
    remaining_to_goal = max(GOAL_TARGET - current_assets, 0)
    monthly_target = round(
        remaining_to_goal / months_to_deadline, 2
    ) if months_to_deadline > 0 else 0

    monthly_saving_trend = []
    for y, m, ms in _month_range(now, 12):
        inc, exp = _month_totals(y, m)
        monthly_saving_trend.append({
            "month": ms,
            "saving": round(inc - exp, 2),
            "target": monthly_target,
        })

    # ── income breakdown (current month) ─────────────────────────
    current_month_str = now.strftime("%Y-%m")
    cur.execute(
        """SELECT category, SUM(amount) AS amount
        FROM transactions
        WHERE amount > 0 AND strftime('%Y-%m', date) = ?
        GROUP BY category
        ORDER BY amount DESC""",
        (current_month_str,),
    )
    inc_rows = cur.fetchall()
    total_inc = sum(r["amount"] for r in inc_rows) if inc_rows else 0
    income_breakdown = [
        {
            "category": r["category"],
            "amount": r["amount"],
            "percentage": round(
                r["amount"] / total_inc * 100, 1
            ) if total_inc > 0 else 0,
        }
        for r in inc_rows
    ]

    # ── expense breakdown (current month) ────────────────────────
    cur.execute(
        """SELECT category, SUM(ABS(amount)) AS amount
        FROM transactions
        WHERE amount < 0 AND strftime('%Y-%m', date) = ?
        GROUP BY category
        ORDER BY amount DESC""",
        (current_month_str,),
    )
    exp_rows = cur.fetchall()
    total_exp = sum(r["amount"] for r in exp_rows) if exp_rows else 0
    expense_breakdown = [
        {
            "category": r["category"],
            "amount": r["amount"],
            "percentage": round(
                r["amount"] / total_exp * 100, 1
            ) if total_exp > 0 else 0,
            "color": FIRE_CATEGORY_COLORS[
                i % len(FIRE_CATEGORY_COLORS)
            ],
        }
        for i, r in enumerate(exp_rows)
    ]

    # ── investment portfolio ─────────────────────────────────────
    def _is_us_ticker(ticker: str) -> bool:
        t = ticker.upper()
        if t.endswith(".HK"):
            return False
        return ".US" in t or t.startswith("$")

    a_holdings = [h for h in holdings if not _is_us_ticker(h.ticker)]
    us_holdings = [h for h in holdings if _is_us_ticker(h.ticker)]

    a_shares_value = sum(h.current_price * h.quantity for h in a_holdings)
    a_shares_pnl = sum((h.current_price - h.buy_price) * h.quantity for h in a_holdings)
    a_shares_cost = sum(h.buy_price * h.quantity for h in a_holdings)
    a_shares_pnl_pct = round(a_shares_pnl / a_shares_cost * 100, 1) if a_shares_cost > 0 else 0

    us_value = sum(h.current_price * h.quantity for h in us_holdings)
    us_pnl = sum((h.current_price - h.buy_price) * h.quantity for h in us_holdings)
    us_cost = sum(h.buy_price * h.quantity for h in us_holdings)
    us_pnl_pct = round(us_pnl / us_cost * 100, 1) if us_cost > 0 else 0

    total_stock_cost = a_shares_cost + us_cost
    total_pnl = a_shares_pnl + us_pnl
    total_return_pct = round(total_pnl / total_stock_cost * 100, 1) if total_stock_cost > 0 else 0

    total_portfolio = a_shares_value + us_value + cash_savings
    allocation = []
    if total_portfolio > 0:
        if a_shares_value > 0:
            allocation.append({"type": "权益-A股", "percentage": round(a_shares_value / total_portfolio * 100, 1), "color": "#ff4757"})
        if us_value > 0:
            allocation.append({"type": "权益-美股", "percentage": round(us_value / total_portfolio * 100, 1), "color": "#00d4ff"})
        if cash_savings > 0:
            allocation.append({"type": "现金/固收", "percentage": round(cash_savings / total_portfolio * 100, 1), "color": "#ffa502"})
    else:
        allocation.append({"type": "现金/固收", "percentage": 100, "color": "#ffa502"})

    investment_portfolio = {
        "a_shares": {"value": round(a_shares_value, 2), "pnl": round(a_shares_pnl, 2), "pnl_pct": a_shares_pnl_pct},
        "us_stocks": {"value": round(us_value, 2), "pnl": round(us_pnl, 2), "pnl_pct": us_pnl_pct},
        "cash": round(cash_savings, 2),
        "total_return_pct": total_return_pct,
        "allocation": allocation,
    }

    # ── current month ────────────────────────────────────────────
    current_month = {
        "income": round(cur_inc, 2),
        "expense": round(cur_exp, 2),
        "net_saving": round(cur_saving, 2),
        "savings_rate": fire["savings_rate"],
    }

    return jsonify({
        "fire": fire,
        "flow_metrics": flow_metrics,
        "stock_metrics": stock_metrics,
        "asset_allocation": asset_allocation,
        "liability_breakdown": liability_breakdown,
        "asset_growth": asset_growth,
        "monthly_saving_trend": monthly_saving_trend,
        "expense_breakdown": expense_breakdown,
        "income_breakdown": income_breakdown,
        "investment_portfolio": investment_portfolio,
        "current_month": current_month,
    })


@app.route("/api/fire/goal", methods=["POST"])
def update_fire_goal():
    """Update FIRE goal parameters."""
    global FIRE_ANNUAL_RETURN_PCT, GOAL_TARGET
    data = request.get_json(force=True)
    if "target_amount" in data:
        GOAL_TARGET = float(data["target_amount"])
    if "annual_return_pct" in data:
        FIRE_ANNUAL_RETURN_PCT = float(data["annual_return_pct"])
    return jsonify({"ok": True, "target": GOAL_TARGET, "annual_return_pct": FIRE_ANNUAL_RETURN_PCT})


# ── Health ────────────────────────────────────────────────────────

@app.route("/api/config/api-key", methods=["GET"])
def get_api_key():
    """Get current API key (masked)."""
    env_path = os.path.join(os.path.dirname(__file__), "smart_ledger", ".env")
    api_key = ""
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if line.startswith("LLM_API_KEY="):
                    api_key = line.strip().split("=", 1)[1]
                    break
    # Mask the key for display
    masked = api_key[:8] + "****" + api_key[-4:] if len(api_key) > 12 else "****"
    return jsonify({"api_key": masked, "configured": bool(api_key)})


@app.route("/api/config/api-key", methods=["PUT"])
def update_api_key():
    """Update API key in .env file."""
    data = request.get_json()
    new_key = data.get("api_key", "")
    if not new_key:
        return jsonify({"error": "api_key is required"}), 400
    
    env_path = os.path.join(os.path.dirname(__file__), "smart_ledger", ".env")
    
    # Read existing .env
    lines = []
    found = False
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if line.startswith("LLM_API_KEY="):
                    lines.append(f"LLM_API_KEY={new_key}\n")
                    found = True
                else:
                    lines.append(line)
    
    if not found:
        lines.append(f"LLM_API_KEY={new_key}\n")
    
    # Write back
    with open(env_path, "w") as f:
        f.writelines(lines)
    
    # Reload config in chat module
    try:
        from smart_ledger import chat
        chat._config_cache = None
    except Exception:
        pass
    
    return jsonify({"status": "ok", "message": "API key updated"})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "version": "1.0.0"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
