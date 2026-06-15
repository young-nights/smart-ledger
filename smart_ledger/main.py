"""CLI entry point for Smart Ledger."""

import sys
from datetime import datetime

from .storage import Storage
from .parser import parse_input, parse_query_params
from .budget import BudgetManager
from .report import ReportGenerator
from .currency import CurrencyManager


def main():
    """Interactive CLI for Smart Ledger."""
    storage = Storage()
    budget_mgr = BudgetManager(storage)
    report_gen = ReportGenerator(storage)
    currency_mgr = CurrencyManager(storage)

    print("📒 Smart Ledger - Personal Finance Tracker")
    print("Type 'help' for commands, 'quit' to exit.\n")

    while True:
        try:
            raw = input("ledger> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break

        if not raw:
            continue

        cmd = raw.lower()

        if cmd in ("quit", "exit", "q"):
            print("Bye!")
            break

        elif cmd == "help":
            print("""
Commands:
  <text>              Record a transaction (e.g., "午饭35", "收到工资8000")
  list [month]        List transactions (e.g., "list 2024-01")
  summary [month]     Monthly summary
  budget set <cat> <amount>  Set monthly budget
  budget list [month] List budgets
  budget delete <id>  Delete a budget
  report [month]      Full monthly report
  search <keyword>    Search transactions
  rate                Show exchange rates
  convert <amt> <from> <to>  Convert currency
  categories          List categories
  help                Show this help
  quit                Exit
""")

        elif cmd.startswith("list"):
            parts = raw.split()
            month = parts[1] if len(parts) > 1 else datetime.now().strftime("%Y-%m")
            txns = storage.get_transactions(month=month)
            if not txns:
                print(f"No transactions for {month}.")
            else:
                print(f"\n{'ID':>4} {'Date':10} {'Category':10} {'Sub':12} {'Amount':>10} {'Description'}")
                print("-" * 70)
                for t in txns:
                    print(f"{t.id:>4} {t.date:10} {t.category:10} {t.subcategory:12} {t.amount:>10.2f} {t.description}")
                print()

        elif cmd.startswith("summary"):
            parts = raw.split()
            if len(parts) > 1:
                try:
                    y, m = parts[1].split("-")
                    year, month = int(y), int(m)
                except ValueError:
                    print("Invalid format. Use YYYY-MM.")
                    continue
            else:
                now = datetime.now()
                year, month = now.year, now.month

            s = storage.get_monthly_summary(year, month)
            print(f"\n📊 Summary for {year:04d}-{month:02d}")
            print(f"  Income:  {s['total_income']:>10.2f}")
            print(f"  Expense: {s['total_expense']:>10.2f}")
            print(f"  Saving:  {s['net_saving']:>10.2f}")
            if s["categories"]:
                print(f"\n  {'Category':12} {'Expense':>10} {'Income':>10} {'Txns':>5}")
                print("  " + "-" * 42)
                for c in s["categories"]:
                    print(f"  {c['category']:12} {c['total_expense']:>10.2f} {c['total_income']:>10.2f} {c['txn_count']:>5}")
            print()

        elif cmd.startswith("budget set"):
            parts = raw.split()
            if len(parts) < 4:
                print("Usage: budget set <category> <amount>")
                continue
            cat = parts[2]
            try:
                amount = float(parts[3])
            except ValueError:
                print("Invalid amount.")
                continue
            b = budget_mgr.set_budget(cat, amount)
            print(f"✅ Budget set: {cat} = {amount:.2f} for {b.year}-{b.month:02d}")

        elif cmd.startswith("budget list"):
            parts = raw.split()
            if len(parts) > 2:
                try:
                    y, m = parts[2].split("-")
                    year, month = int(y), int(m)
                except ValueError:
                    print("Invalid format. Use YYYY-MM.")
                    continue
            else:
                now = datetime.now()
                year, month = now.year, now.month

            budgets = budget_mgr.get_budgets(year, month)
            if not budgets:
                print(f"No budgets for {year:04d}-{month:02d}.")
            else:
                print(f"\n{'ID':>4} {'Category':12} {'Budget':>10} {'Actual':>10} {'Usage%':>7} {'Status'}")
                print("-" * 55)
                for b in budgets:
                    print(f"{b['id']:>4} {b['category']:12} {b['amount']:>10.2f} {b['actual_expense']:>10.2f} {b['usage_pct']:>6.1f}% {b['status']}")
                print()

        elif cmd.startswith("budget delete"):
            parts = raw.split()
            if len(parts) < 3:
                print("Usage: budget delete <id>")
                continue
            try:
                bid = int(parts[2])
            except ValueError:
                print("Invalid ID.")
                continue
            if budget_mgr.delete_budget(bid):
                print(f"✅ Budget {bid} deleted.")
            else:
                print(f"❌ Budget {bid} not found.")

        elif cmd.startswith("report"):
            parts = raw.split()
            if len(parts) > 1:
                try:
                    y, m = parts[1].split("-")
                    year, month = int(y), int(m)
                except ValueError:
                    print("Invalid format. Use YYYY-MM.")
                    continue
            else:
                now = datetime.now()
                year, month = now.year, now.month

            r = report_gen.generate(year, month)
            print(f"\n📋 Report for {r['period']}")
            s = r["summary"]
            print(f"  Income:     {s['total_income']:>10.2f}")
            print(f"  Expense:    {s['total_expense']:>10.2f}")
            print(f"  Saving:     {s['net_saving']:>10.2f}")
            print(f"  Savings %:  {r['savings_rate']:.1f}%")

            if r["top_categories"]:
                print(f"\n  Top Categories:")
                for c in r["top_categories"]:
                    print(f"    {c['category']:12} {c['total_expense']:>10.2f}")

            if r["advice"]:
                print(f"\n  💡 Advice:")
                for a in r["advice"]:
                    print(f"    {a['message']}")

            if r["anomaly_detection"]:
                print(f"\n  📊 Anomalies:")
                for a in r["anomaly_detection"]:
                    print(f"    {a['message']}")

            if r["budget_alerts"]:
                print(f"\n  ⚠️ Budget Alerts:")
                for a in r["budget_alerts"]:
                    print(f"    {a['message']}")
            print()

        elif cmd.startswith("search"):
            keyword = raw[6:].strip()
            if not keyword:
                print("Usage: search <keyword>")
                continue
            params = parse_query_params(keyword)
            txns = storage.get_transactions(**params)
            if not txns:
                print(f"No results for '{keyword}'.")
            else:
                print(f"\n{'ID':>4} {'Date':10} {'Category':10} {'Amount':>10} {'Description'}")
                print("-" * 60)
                for t in txns:
                    print(f"{t.id:>4} {t.date:10} {t.category:10} {t.amount:>10.2f} {t.description}")
                print()

        elif cmd == "rate":
            rates = currency_mgr.get_rates("CNY")
            print(f"\nExchange rates (base: CNY):")
            for cur, rate in rates.items():
                print(f"  1 CNY = {rate:.4f} {cur}")
            print()

        elif cmd.startswith("convert"):
            parts = raw.split()
            if len(parts) < 4:
                print("Usage: convert <amount> <from> <to>")
                continue
            try:
                amt = float(parts[1])
            except ValueError:
                print("Invalid amount.")
                continue
            from_cur = parts[2].upper()
            to_cur = parts[3].upper()
            try:
                result = currency_mgr.convert(amt, from_cur, to_cur)
                print(f"  {amt:.2f} {from_cur} = {result:.2f} {to_cur}")
            except ValueError as e:
                print(f"  ❌ {e}")

        elif cmd == "categories":
            cats = storage.get_categories()
            if not cats:
                print("No custom categories defined. Using built-in categories.")
            else:
                for c in cats:
                    print(f"  {c.id}: {c.name} (icon: {c.icon})")

        else:
            # Treat as a transaction input
            txn = parse_input(raw)
            if txn.amount == 0:
                print("Could not parse amount. Try: '午饭35' or '收到工资8000'")
            else:
                txn = storage.add_transaction(txn)
                sign = "+" if txn.amount > 0 else ""
                print(f"✅ Recorded: {txn.category}/{txn.subcategory} {sign}{txn.amount:.2f} ({txn.date})")


if __name__ == "__main__":
    main()
