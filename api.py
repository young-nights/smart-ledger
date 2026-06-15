"""Flask REST API for Smart Ledger.

Run: python api.py  (or flask --app api run --port 5050)
"""

from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

import csv
import os
import io
import json as json_mod
from smart_ledger.storage import Storage
from smart_ledger.parser import parse_input, parse_query_params
from smart_ledger.budget import BudgetManager
from smart_ledger.report import ReportGenerator
from smart_ledger.currency import CurrencyManager
from smart_ledger.chat import ChatManager
from smart_ledger.models import SavingsGoal
from openai import OpenAI

app = Flask(__name__)
CORS(app)

storage = Storage()
budget_mgr = BudgetManager(storage)
report_gen = ReportGenerator(storage)
currency_mgr = CurrencyManager(storage)
chat_mgr = ChatManager(storage, budget_mgr, report_gen)

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
    # Check budget alerts
    alerts = budget_mgr.check_budget_alerts()
    return jsonify({"transaction": txn.to_dict(), "alerts": [a.get("message", str(a)) if isinstance(a, dict) else str(a) for a in alerts]}), 201


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
    """Get all-time summary."""
    cur = storage.conn.cursor()
    cur.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_income,
            COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_expense
        FROM transactions
    """)
    row = cur.fetchone()
    return jsonify({
        "total_income": row[0],
        "total_expense": row[1],
        "net_saving": row[0] - row[1],
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
    """List all savings goals."""
    goals = storage.get_savings_goals()
    return jsonify([g.to_dict() for g in goals])


@app.route("/api/savings-goals", methods=["POST"])
def add_savings_goal():
    """Create a new savings goal."""
    data = request.get_json(force=True)
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    goal = SavingsGoal(
        name=name,
        target_amount=float(data.get("target_amount", 0)),
        current_amount=float(data.get("current_amount", 0)),
        deadline=data.get("deadline", ""),
        color=data.get("color", "#0d7377"),
    )
    goal = storage.add_savings_goal(goal)
    return jsonify(goal.to_dict()), 201


@app.route("/api/savings-goals/<int:goal_id>", methods=["PUT"])
def update_savings_goal(goal_id: int):
    """Update an existing savings goal."""
    data = request.get_json(force=True)
    # Fetch existing goal to merge fields
    existing = storage.get_savings_goal(goal_id)
    if not existing:
        return jsonify({"error": "Goal not found"}), 404
    goal = SavingsGoal(
        id=goal_id,
        name=data.get("name", existing.name),
        target_amount=float(data.get("target_amount", existing.target_amount)),
        current_amount=float(data.get("current_amount", existing.current_amount)),
        deadline=data.get("deadline", existing.deadline),
        color=data.get("color", existing.color),
    )
    if storage.update_savings_goal(goal):
        return jsonify(goal.to_dict())
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


# ── Export ────────────────────────────────────────────────────────

@app.route("/api/export/csv", methods=["GET"])
def export_csv():
    """Export transactions as CSV."""
    month = request.args.get("month")
    category = request.args.get("category")
    txns = storage.get_transactions(month=month, category=category, limit=10000)

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
    txns = storage.get_transactions(month=month, category=category, limit=10000)

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
