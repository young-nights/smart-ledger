"""Flask REST API for Smart Ledger.

Run: python api.py  (or flask --app api run --port 5050)
"""

from datetime import datetime
import re as _re
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


def get_realtime_rates() -> dict:
    """Fetch real-time exchange rates from free API, fallback to defaults."""
    try:
        resp = http_requests.get("https://open.er-api.com/v6/latest/CNY", timeout=5)
        data = resp.json()
        if data.get("result") == "success":
            return data["rates"]
    except Exception:
        pass
    return DEFAULT_RATES.get("CNY", {})


def _get_goal_with_currencies(goal, storage):
    """Attach currencies list to a goal dict."""
    d = goal.to_dict()
    currencies = storage.get_savings_goal_currencies(goal.id)
    d["currencies"] = [c.to_dict() for c in currencies]
    return d


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
    """List all savings goals with currency breakdowns and stock P&L."""
    goals = storage.get_savings_goals()
    stock_pnl = _get_stock_pnl()
    result = [_get_goal_with_currencies(g, storage) for g in goals]
    # Attach stock_pnl to each goal for frontend convenience
    for g in result:
        g["stock_pnl"] = stock_pnl
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

    # Calculate current_amount from currencies if provided
    if currencies_data:
        current_amount = sum(
            _convert_to_cny(c.get("amount", 0), c.get("currency", "CNY"), rates)
            for c in currencies_data
        )
    else:
        current_amount = float(data.get("current_amount", 0))

    goal = SavingsGoal(
        name=name,
        target_amount=float(data.get("target_amount", 0)),
        current_amount=round(current_amount, 2),
        deadline=data.get("deadline", ""),
        color=data.get("color", "#0d7377"),
    )
    goal = storage.add_savings_goal(goal)

    # Insert currencies if provided
    if currencies_data:
        for c in currencies_data:
            storage.add_savings_goal_currency(
                goal.id, c.get("currency", "CNY"), c.get("amount", 0)
            )
        # Record history with converted CNY total
        storage.add_savings_history(goal.id, goal.current_amount)

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
        # Recalculate current_amount from currencies
        current_amount = sum(
            _convert_to_cny(c.get("amount", 0), c.get("currency", "CNY"), rates)
            for c in currencies_data
        )
        # Replace currencies
        storage.delete_all_savings_goal_currencies(goal_id)
        for c in currencies_data:
            storage.add_savings_goal_currency(
                goal_id, c.get("currency", "CNY"), c.get("amount", 0)
            )
    else:
        current_amount = float(data.get("current_amount", existing.current_amount))

    goal = SavingsGoal(
        id=goal_id,
        name=data.get("name", existing.name),
        target_amount=float(data.get("target_amount", existing.target_amount)),
        current_amount=round(current_amount, 2),
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
    """List all stock holdings."""
    holdings = storage.get_stock_holdings()
    return jsonify([h.to_dict() for h in holdings])


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
            url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotes_count=10&news_count=0"
            headers = {"User-Agent": "Mozilla/5.0"}
            resp = req.get(url, headers=headers, timeout=5)
            if resp.status_code != 200:
                return jsonify([])
            data = resp.json()
            results = []
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
        updated.append(h.to_dict())
    return jsonify(updated)


@app.route("/api/stocks/refresh-prices", methods=["POST"])
def refresh_stock_prices():
    """Refresh prices for all holdings. A-shares use Tencent Finance, others use Yahoo Finance.

    Also syncs stock P&L to the '投资收益' savings goal after refresh.
    Returns updated holdings list.
    """
    updated = _refresh_all_stock_prices()
    # Auto-sync P&L to savings goal
    _sync_stock_pnl_to_savings_goal()
    return jsonify(updated)


# ── Stock P&L Sync to Savings Goals ─────────────────────────────

@app.route("/api/savings-goals/sync-stock-pnl", methods=["POST"])
def sync_stock_pnl():
    """Sync total stock P&L to the '投资收益' savings goal."""
    goal = _sync_stock_pnl_to_savings_goal()
    return jsonify(goal)


def _is_a_share(ticker: str) -> bool:
    """Detect if a ticker is an A-share (starts with digits or contains Chinese)."""
    return bool(_re.match(r'^\d', ticker)) or bool(_re.search(r'[\u4e00-\u9fff]', ticker))


def _fetch_a_share_price(ticker: str) -> float:
    """Fetch real-time A-share price from Tencent Finance API.

    Args:
        ticker: Stock code like '600519' or '000001'.
    Returns:
        Current price or 0 on failure.
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
            return 0.0
        # Response: v_sh600519="1~贵州茅台~600519~1800.00~..."
        text = resp.text
        match = _re.search(r'"(.+?)"', text)
        if not match:
            return 0.0
        parts = match.group(1).split('~')
        if len(parts) > 3:
            price = float(parts[3])
            return price if price > 0 else 0.0
    except Exception:
        pass
    return 0.0


def _fetch_yahoo_price(ticker: str) -> float:
    """Fetch price from Yahoo Finance (US/HK stocks).

    Args:
        ticker: Stock ticker like 'AAPL' or '0700.HK'.
    Returns:
        Current price or 0 on failure.
    """
    try:
        url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d'
        resp = http_requests.get(url, timeout=8, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        if resp.status_code == 200:
            meta = resp.json()['chart']['result'][0]['meta']
            price = meta.get('regularMarketPrice', 0)
            return float(price) if price else 0.0
    except Exception:
        pass
    return 0.0


def _refresh_all_stock_prices() -> list:
    """Refresh prices for all stock holdings. Returns updated holdings list."""
    holdings = storage.get_stock_holdings()
    updated = []
    for h in holdings:
        try:
            if _is_a_share(h.ticker):
                price = _fetch_a_share_price(h.ticker)
            else:
                price = _fetch_yahoo_price(h.ticker)
            if price > 0:
                h.current_price = price
                storage.update_stock_holding(h)
        except Exception:
            pass
        updated.append(h.to_dict())
    return updated


def _calculate_stock_pnl() -> float:
    """Calculate total floating P&L from all stock holdings."""
    holdings = storage.get_stock_holdings()
    total_pnl = sum((h.current_price * h.quantity) - (h.buy_price * h.quantity) for h in holdings)
    return round(total_pnl, 2)


def _sync_stock_pnl_to_savings_goal() -> dict:
    """Sync stock P&L into the '30岁之前赚到100万' savings goal. Returns the goal dict."""
    total_pnl = _calculate_stock_pnl()
    goals = storage.get_savings_goals()
    
    # Remove old '投资收益' goal if it exists
    old_goal = next((g for g in goals if g.name == '投资收益'), None)
    if old_goal:
        storage.delete_savings_goal(old_goal.id)
        goals = [g for g in goals if g.name != '投资收益']
    
    # Find or create the main goal
    goal = next((g for g in goals if g.name == '30岁之前赚到100万'), None)
    if goal is None:
        goal = SavingsGoal(
            name='30岁之前赚到100万',
            target_amount=1000000,
            current_amount=total_pnl,
            deadline='2036-05',
            color='#0d7377',
        )
        goal = storage.add_savings_goal(goal)
    else:
        goal.current_amount = total_pnl
        storage.update_savings_goal(goal)
    return goal.to_dict()


def _get_stock_pnl() -> float:
    """Get the current stock P&L without modifying anything."""
    return _calculate_stock_pnl()


GOAL_TARGET = 1_000_000  # 百万存款目标
GOAL_DEADLINE = "2036-05"  # 目标截止日期 (YYYY-MM)
FIRE_ANNUAL_RETURN_PCT = 7.0  # 默认年化回报率假设


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

    # ── current assets (from assets/liabilities tables + stock holdings) ──
    holdings = storage.get_stock_holdings()
    stock_value = sum(h.value for h in holdings)
    cash_savings = max(net_saving_all, 0)

    # Get net worth from assets/liabilities tables
    net_worth_data = storage.get_net_worth()
    total_assets_from_table = net_worth_data["total_assets"]
    total_liabilities_from_table = net_worth_data["total_liabilities"]
    net_worth = net_worth_data["net_worth"]

    # Use net_worth as current_assets if assets table has data, otherwise fallback
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

    # ── asset growth (last 24 months with 3 scenario lines) ──────
    cumulative = 0.0
    asset_growth = []

    for y, m, ms in _month_range(now, 24):
        inc, exp = _month_totals(y, m)
        cumulative += inc - exp
        asset_growth.append({
            "month": ms,
            "actual": round(cumulative, 2),
            "target_optimistic": round(cumulative * (1 + 0.003), 2),
            "target_baseline": round(cumulative, 2),
            "target_conservative": round(cumulative * (1 - 0.002), 2),
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
    a_shares_value = sum(h.value for h in holdings if not h.ticker.upper().endswith(".HK") and ".US" not in h.ticker.upper() and not h.ticker.upper().startswith("$"))
    a_shares_pnl = sum(h.pnl for h in holdings if not h.ticker.upper().endswith(".HK") and ".US" not in h.ticker.upper() and not h.ticker.upper().startswith("$"))
    a_shares_cost = sum(h.cost for h in holdings if not h.ticker.upper().endswith(".HK") and ".US" not in h.ticker.upper() and not h.ticker.upper().startswith("$"))
    a_shares_pnl_pct = round(a_shares_pnl / a_shares_cost * 100, 1) if a_shares_cost > 0 else 0

    us_value = sum(h.value for h in holdings if h.ticker.upper().endswith(".HK") or ".US" in h.ticker.upper() or h.ticker.upper().startswith("$"))
    us_pnl = sum(h.pnl for h in holdings if h.ticker.upper().endswith(".HK") or ".US" in h.ticker.upper() or h.ticker.upper().startswith("$"))
    us_cost = sum(h.cost for h in holdings if h.ticker.upper().endswith(".HK") or ".US" in h.ticker.upper() or h.ticker.upper().startswith("$"))
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
    app.run(host="0.0.0.0", port=5050, debug=True)
