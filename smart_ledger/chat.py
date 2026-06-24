"""AI Chat manager for Smart Ledger.

Uses OpenAI-compatible API to provide a conversational financial assistant
that can parse natural language, query data, set budgets, and generate reports.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from openai import OpenAI

# Load .env file from smart_ledger directory (manual parser)
def _load_env():
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:  # Don't override existing env
                os.environ[key] = value

_load_env()

from .storage import Storage
from .budget import BudgetManager
from .report import ReportGenerator


class ChatManager:
    """AI chat manager using OpenAI-compatible API."""

    def __init__(self, storage: Storage, budget_mgr: BudgetManager, report_gen: ReportGenerator):
        self.storage = storage
        self.budget_mgr = budget_mgr
        self.report_gen = report_gen

        # LLM config — Xiaomi MiLM as default, fallback to Ollama
        self.base_url = os.getenv("LLM_BASE_URL", "https://api.xiaomi.com/v1")
        self.model = os.getenv("LLM_MODEL", "MiLM")
        self.api_key = os.getenv("LLM_API_KEY", "")

        self.client = OpenAI(base_url=self.base_url, api_key=self.api_key)
        self.history: List[Dict[str, str]] = []

    def _get_system_prompt(self) -> str:
        """Build system prompt with current financial context."""
        now = datetime.now()
        current_month = now.strftime("%Y-%m")

        # Get current financial data for context
        summary = self.storage.get_monthly_summary(now.year, now.month)

        return f"""你是 Smart Ledger 的 AI 财务助手，名叫「小账」。

当前时间：{now.strftime('%Y-%m-%d %H:%M')}
当前月份：{current_month}

本月概况：
- 总收入：¥{summary['total_income']:,.2f}
- 总支出：¥{summary['total_expense']:,.2f}
- 净储蓄：¥{summary['net_saving']:,.2f}

你可以帮用户：
1. 记账 - 解析自然语言，如「午饭35」「打车28块」「工资8000」
2. 查询 - 查询交易记录，如「这个月花了多少」「餐饮消费」
3. 预算 - 设置预算，如「餐饮预算2000」
4. 报告 - 生成月度报告，如「本月报告」
5. 建议 - 给出理财建议，如「给我建议」

当用户要记账时，回复 JSON 格式：
{{"action": "add_transaction", "raw_input": "原始输入"}}

当用户要查询时，回复 JSON 格式：
{{"action": "query", "month": "YYYY-MM", "category": "分类"}}

当用户要设置预算时，回复 JSON 格式：
{{"action": "set_budget", "category": "分类", "amount": 金额}}

当用户要报告时，回复 JSON 格式：
{{"action": "report", "month": "YYYY-MM"}}

否则直接用自然语言回复用户。

重要：先理解用户意图，再决定是否需要调用工具。如果用户只是闲聊或问问题，直接回复即可。"""

    def chat(self, user_message: str) -> Dict[str, Any]:
        """Process a chat message and return response.

        Args:
            user_message: The user's input text.

        Returns:
            Dict with keys: reply (str), action (str|None), data (any|None).
        """
        self.history.append({"role": "user", "content": user_message})

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self._get_system_prompt()},
                    *self.history[-20:],  # Keep last 20 messages for context
                ],
                temperature=0.7,
                max_tokens=1024,
            )

            reply = response.choices[0].message.content.strip()
            self.history.append({"role": "assistant", "content": reply})

            # Try to parse as JSON action
            result = self._try_parse_action(reply)

            return {
                "reply": result.get("message", reply),
                "action": result.get("action"),
                "data": result.get("data"),
            }

        except Exception as e:
            return {
                "reply": f"抱歉，AI 服务暂时不可用：{str(e)}",
                "action": None,
                "data": None,
            }

    def _try_parse_action(self, reply: str) -> Dict[str, Any]:
        """Try to extract and execute a JSON action from LLM reply.

        If the reply contains a JSON object with an 'action' field,
        execute the corresponding handler and return the result.
        """
        try:
            # Try to extract JSON from reply
            if "{" in reply and "}" in reply:
                start = reply.index("{")
                end = reply.rindex("}") + 1
                json_str = reply[start:end]
                data = json.loads(json_str)

                action = data.get("action")

                if action == "add_transaction":
                    return self._handle_add_transaction(data)
                elif action == "query":
                    return self._handle_query(data)
                elif action == "set_budget":
                    return self._handle_set_budget(data)
                elif action == "report":
                    return self._handle_report(data)

            return {"message": reply}

        except (json.JSONDecodeError, ValueError):
            return {"message": reply}

    def _handle_add_transaction(self, data: Dict) -> Dict:
        """Handle add_transaction action by parsing and saving the transaction."""
        from .parser import parse_input

        raw_input = data.get("raw_input", "")
        txn = parse_input(raw_input)
        if txn.amount == 0:
            return {"message": "无法识别金额，请重新描述"}

        txn = self.storage.add_transaction(txn)
        sign = "+" if txn.amount > 0 else "-"
        return {
            "action": "add_transaction",
            "message": f"✅ 已记录：{txn.category}.{txn.subcategory} {sign}{abs(txn.amount):.2f} {txn.currency}",
            "data": txn.to_dict(),
        }

    def _handle_query(self, data: Dict) -> Dict:
        """Handle query action by fetching and summarizing transactions."""
        month = data.get("month", datetime.now().strftime("%Y-%m"))
        category = data.get("category")

        txns = self.storage.get_transactions(month=month, category=category)

        if not txns:
            return {"message": f"未找到 {month} 的交易记录"}

        total = sum(abs(t.amount) for t in txns)
        cat_summary: Dict[str, float] = {}
        for t in txns:
            cat = t.category
            if cat not in cat_summary:
                cat_summary[cat] = 0
            cat_summary[cat] += abs(t.amount)

        lines = [f"📊 {month} 交易记录（{len(txns)} 笔）"]
        lines.append(f"总金额：¥{total:,.2f}")
        lines.append("")
        lines.append("分类统计：")
        for cat, amount in sorted(cat_summary.items(), key=lambda x: -x[1]):
            lines.append(f"  {cat}: ¥{amount:,.2f}")

        return {
            "action": "query",
            "message": "\n".join(lines),
            "data": {"count": len(txns), "total": total, "categories": cat_summary},
        }

    def _handle_set_budget(self, data: Dict) -> Dict:
        """Handle set_budget action by creating/updating a budget."""
        category = data.get("category", "")
        amount = data.get("amount", 0)

        if not category or amount <= 0:
            return {"message": "请提供有效的分类和金额"}

        now = datetime.now()
        self.budget_mgr.set_budget(category, amount, "CNY", now.year, now.month)

        return {
            "action": "set_budget",
            "message": f"✅ 已设置 {now.month}月 {category} 预算 ¥{amount:,.2f}",
        }

    def _handle_report(self, data: Dict) -> Dict:
        """Handle report action by generating and formatting a monthly report."""
        now = datetime.now()
        month_str = data.get("month", now.strftime("%Y-%m"))
        y, m = month_str.split("-")
        report = self.report_gen.generate(int(y), int(m))

        summary = report.get("summary", {})
        saving_rate = report.get("savings_rate", 0)

        lines = [
            f"📊 {month_str} 财务报告",
            "",
            f"总收入：¥{summary['total_income']:,.2f}",
            f"总支出：¥{summary['total_expense']:,.2f}",
            f"净储蓄：¥{summary['net_saving']:,.2f}",
            f"储蓄杠杆比率：{saving_rate:.1f}%",
            "",
        ]

        # Add advice
        advice = report.get("advice", [])
        if advice:
            lines.append("💡 建议：")
            for a in advice[:3]:
                if isinstance(a, dict):
                    lines.append(f"  • {a.get('message', '')}")
                else:
                    lines.append(f"  • {a}")

        return {
            "action": "report",
            "message": "\n".join(lines),
            "data": report,
        }

    def clear_history(self) -> None:
        """Clear chat history."""
        self.history = []
