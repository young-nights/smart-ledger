"""Multi-currency support for Smart Ledger."""

from datetime import datetime
from typing import Dict, List, Optional

from .models import ExchangeRate
from .storage import Storage


# Default rates (approximate, as of 2024)
DEFAULT_RATES: Dict[str, Dict[str, float]] = {
    "CNY": {"USD": 0.138, "EUR": 0.127, "GBP": 0.109, "JPY": 20.5, "HKD": 1.08},
    "USD": {"CNY": 7.25, "EUR": 0.92, "GBP": 0.79, "JPY": 149.0, "HKD": 7.82},
    "EUR": {"CNY": 7.87, "USD": 1.087, "GBP": 0.86, "JPY": 162.0, "HKD": 8.51},
    "GBP": {"CNY": 9.18, "USD": 1.27, "EUR": 1.17, "JPY": 189.0, "HKD": 9.92},
    "JPY": {"CNY": 0.049, "USD": 0.0067, "EUR": 0.0062, "GBP": 0.0053, "HKD": 0.052},
    "HKD": {"CNY": 0.93, "USD": 0.128, "EUR": 0.118, "GBP": 0.101, "JPY": 19.1},
}

SUPPORTED_CURRENCIES = ["CNY", "USD", "EUR", "GBP", "JPY", "HKD"]


class CurrencyManager:
    """Handle multi-currency conversion and rate management."""

    def __init__(self, storage: Optional[Storage] = None):
        self.storage = storage
        # In-memory default rates (used when no DB rate exists)
        self._default_rates = DEFAULT_RATES

    def convert(self, amount: float, from_currency: str, to_currency: str) -> float:
        """Convert amount between currencies.

        Checks DB first for stored rates, falls back to built-in defaults.
        Returns rounded result.
        """
        from_currency = from_currency.upper()
        to_currency = to_currency.upper()

        if from_currency == to_currency:
            return amount

        # Try DB-stored rate
        rate = self._get_rate_from_db(from_currency, to_currency)
        if rate is not None:
            return round(amount * rate, 2)

        # Try default rates
        rate = self._get_default_rate(from_currency, to_currency)
        if rate is not None:
            return round(amount * rate, 2)

        # Try inverse
        inv_rate = self._get_default_rate(to_currency, from_currency)
        if inv_rate is not None and inv_rate != 0:
            return round(amount / inv_rate, 2)

        # Cannot convert
        raise ValueError(f"No exchange rate available for {from_currency} → {to_currency}")

    def get_rates(self, base_currency: str = "CNY") -> Dict[str, float]:
        """Return all rates relative to base_currency."""
        base_currency = base_currency.upper()
        rates: Dict[str, float] = {}

        for cur in SUPPORTED_CURRENCIES:
            if cur == base_currency:
                rates[cur] = 1.0
            else:
                try:
                    rates[cur] = self.convert(1.0, base_currency, cur)
                except ValueError:
                    rates[cur] = 0.0

        return rates

    def set_rate(self, from_currency: str, to_currency: str, rate: float) -> ExchangeRate:
        """Store a custom exchange rate in the database."""
        if self.storage is None:
            raise RuntimeError("Storage not initialized")

        er = ExchangeRate(
            from_currency=from_currency.upper(),
            to_currency=to_currency.upper(),
            rate=rate,
            date=datetime.now().strftime("%Y-%m-%d"),
        )
        return self.storage.add_exchange_rate(er)

    def get_supported_currencies(self) -> List[str]:
        """Return list of supported currency codes."""
        return SUPPORTED_CURRENCIES.copy()

    def _get_rate_from_db(self, from_cur: str, to_cur: str) -> Optional[float]:
        """Look up rate from database."""
        if self.storage is None:
            return None
        er = self.storage.get_latest_rate(from_cur, to_cur)
        return er.rate if er else None

    def _get_default_rate(self, from_cur: str, to_cur: str) -> Optional[float]:
        """Look up rate from built-in defaults."""
        return self._default_rates.get(from_cur, {}).get(to_cur)
