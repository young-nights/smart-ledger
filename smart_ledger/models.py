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
