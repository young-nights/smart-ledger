"""Data models for Smart Ledger."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Transaction:
    """A single financial transaction."""
    id: Optional[int] = None
    date: str = ""
    amount: float = 0.0
    currency: str = "CNY"
    category: str = ""
    subcategory: str = ""
    description: str = ""
    raw_input: str = ""
    created_at: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "date": self.date,
            "amount": self.amount,
            "currency": self.currency,
            "category": self.category,
            "subcategory": self.subcategory,
            "description": self.description,
            "raw_input": self.raw_input,
            "created_at": self.created_at,
            "is_income": self.amount > 0,
            "is_expense": self.amount < 0,
            "abs_amount": abs(self.amount),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Transaction":
        return cls(
            id=d.get("id"),
            date=d.get("date", ""),
            amount=d.get("amount", 0.0),
            currency=d.get("currency", "CNY"),
            category=d.get("category", ""),
            subcategory=d.get("subcategory", ""),
            description=d.get("description", ""),
            raw_input=d.get("raw_input", ""),
            created_at=d.get("created_at", ""),
        )


@dataclass
class Budget:
    """Budget for a category with configurable period."""
    id: Optional[int] = None
    category: str = ""
    amount: float = 0.0
    currency: str = "CNY"
    year: int = 0
    month: int = 0
    period: str = "month"  # day, month, year, all
    created_at: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "category": self.category,
            "amount": self.amount,
            "budget": self.amount,
            "currency": self.currency,
            "year": self.year,
            "month": self.month,
            "period": self.period,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Budget":
        return cls(
            id=d.get("id"),
            category=d.get("category", ""),
            amount=d.get("amount", 0.0),
            currency=d.get("currency", "CNY"),
            year=d.get("year", 0),
            month=d.get("month", 0),
            period=d.get("period", "month"),
            created_at=d.get("created_at", ""),
        )


@dataclass
class ExchangeRate:
    """Exchange rate between two currencies."""
    id: Optional[int] = None
    from_currency: str = ""
    to_currency: str = ""
    rate: float = 1.0
    date: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "from_currency": self.from_currency,
            "to_currency": self.to_currency,
            "rate": self.rate,
            "date": self.date,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "ExchangeRate":
        return cls(
            id=d.get("id"),
            from_currency=d.get("from_currency", ""),
            to_currency=d.get("to_currency", ""),
            rate=d.get("rate", 1.0),
            date=d.get("date", ""),
        )


@dataclass
class SavingsGoal:
    """A savings goal with target and current amount."""
    id: Optional[int] = None
    name: str = ""
    target_amount: float = 0.0
    current_amount: float = 0.0
    deadline: str = ""  # YYYY-MM-DD
    color: str = "#0d7377"
    created_at: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "target_amount": self.target_amount,
            "current_amount": self.current_amount,
            "deadline": self.deadline,
            "color": self.color,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "SavingsGoal":
        return cls(
            id=d.get("id"),
            name=d.get("name", ""),
            target_amount=d.get("target_amount", 0.0),
            current_amount=d.get("current_amount", 0.0),
            deadline=d.get("deadline", ""),
            color=d.get("color", "#0d7377"),
            created_at=d.get("created_at", ""),
        )


@dataclass
class SavingsGoalCurrency:
    """A currency entry for a savings goal (multi-currency support)."""
    id: Optional[int] = None
    goal_id: int = 0
    currency: str = "CNY"
    amount: float = 0.0
    created_at: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "goal_id": self.goal_id,
            "currency": self.currency,
            "amount": self.amount,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "SavingsGoalCurrency":
        return cls(
            id=d.get("id"),
            goal_id=d.get("goal_id", 0),
            currency=d.get("currency", "CNY"),
            amount=d.get("amount", 0.0),
            created_at=d.get("created_at", ""),
        )


@dataclass
class StockHolding:
    """A stock holding with buy info and current price."""
    id: Optional[int] = None
    ticker: str = ""
    name: str = ""
    buy_price: float = 0.0
    current_price: float = 0.0
    quantity: float = 0.0
    buy_date: str = ""
    created_at: str = ""

    def to_dict(self) -> dict:
        cost = self.buy_price * self.quantity
        value = self.current_price * self.quantity
        pnl = value - cost
        pnl_pct = (pnl / cost * 100) if cost > 0 else 0.0
        return {
            "id": self.id,
            "ticker": self.ticker,
            "name": self.name,
            "buy_price": self.buy_price,
            "current_price": self.current_price,
            "quantity": self.quantity,
            "buy_date": self.buy_date,
            "created_at": self.created_at,
            "cost": round(cost, 2),
            "value": round(value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
        }

    @classmethod
    def from_dict(cls, d: dict) -> "StockHolding":
        return cls(
            id=d.get("id"),
            ticker=d.get("ticker", ""),
            name=d.get("name", ""),
            buy_price=d.get("buy_price", 0.0),
            current_price=d.get("current_price", 0.0),
            quantity=d.get("quantity", 0.0),
            buy_date=d.get("buy_date", ""),
            created_at=d.get("created_at", ""),
        )


@dataclass
class Category:
    """Expense/income category with optional parent."""
    id: Optional[int] = None
    name: str = ""
    parent_id: Optional[int] = None
    keywords: str = ""
    icon: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "parent_id": self.parent_id,
            "keywords": self.keywords,
            "icon": self.icon,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Category":
        return cls(
            id=d.get("id"),
            name=d.get("name", ""),
            parent_id=d.get("parent_id"),
            keywords=d.get("keywords", ""),
            icon=d.get("icon", ""),
        )


# ── FIRE Asset/Liability Category Definitions ──────────────────────

ASSET_CATEGORIES = {
    "现金及等价物": True,
    "可投资金融资产": True,
    "自用房产": False,
    "投资性房产": True,
    "其他实物资产": False,
    "养老金/保险": False,
    "应收款/其他": False,
}

ASSET_SUBCATEGORIES = {
    "现金及等价物": ["银行存款", "货币基金", "应急现金"],
    "可投资金融资产": ["A股", "美股", "港股", "基金", "债券", "定增份额", "其他金融资产"],
    "自用房产": ["自住房产"],
    "投资性房产": ["出租房", "商铺", "其他投资房产"],
    "其他实物资产": ["车辆", "黄金", "收藏品"],
    "养老金/保险": ["企业年金", "商业养老保险"],
    "应收款/其他": ["借出款项", "未结算收入"],
}

LIABILITY_CATEGORIES = {
    "高息消费债": True,
    "房贷": False,
    "车贷": False,
    "其他低息债": False,
    "应付款": False,
}

LIABILITY_SUBCATEGORIES = {
    "高息消费债": ["信用卡", "消费贷", "网贷"],
    "房贷": ["住房抵押贷款"],
    "车贷": ["汽车贷款"],
    "其他低息债": ["教育贷", "亲友借款"],
    "应付款": ["待付账单"],
}


@dataclass
class Asset:
    """A personal asset entry (FIRE framework)."""
    id: Optional[int] = None
    name: str = ""
    category: str = ""       # top-level category
    subcategory: str = ""    # sub-category
    amount: float = 0.0      # current market value
    is_investable: bool = True  # FIRE core engine flag
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "subcategory": self.subcategory,
            "amount": self.amount,
            "is_investable": self.is_investable,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Asset":
        return cls(
            id=d.get("id"),
            name=d.get("name", ""),
            category=d.get("category", ""),
            subcategory=d.get("subcategory", ""),
            amount=d.get("amount", 0.0),
            is_investable=d.get("is_investable", True),
            created_at=d.get("created_at", ""),
            updated_at=d.get("updated_at", ""),
        )


@dataclass
class Liability:
    """A personal liability/debt entry (FIRE framework)."""
    id: Optional[int] = None
    name: str = ""
    category: str = ""       # top-level category
    subcategory: str = ""    # sub-category
    amount: float = 0.0      # outstanding debt amount
    interest_rate: float = 0.0  # annual interest rate
    monthly_payment: float = 0.0  # monthly payment
    is_high_interest: bool = False  # True if annual rate > 10%
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "subcategory": self.subcategory,
            "amount": self.amount,
            "interest_rate": self.interest_rate,
            "monthly_payment": self.monthly_payment,
            "is_high_interest": self.is_high_interest,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Liability":
        return cls(
            id=d.get("id"),
            name=d.get("name", ""),
            category=d.get("category", ""),
            subcategory=d.get("subcategory", ""),
            amount=d.get("amount", 0.0),
            interest_rate=d.get("interest_rate", 0.0),
            monthly_payment=d.get("monthly_payment", 0.0),
            is_high_interest=d.get("is_high_interest", False),
            created_at=d.get("created_at", ""),
            updated_at=d.get("updated_at", ""),
        )
