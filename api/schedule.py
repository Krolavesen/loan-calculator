"""Vercel Function backing the web frontend.

GET  /api/schedule -> the defaults from config.py
POST /api/schedule -> the projected schedules for a set of inputs

The maths lives in loan_calculator.py at the project root; this module only
parses, validates and serialises.
"""
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler

# The project root holds loan_calculator.py and config.py, and is not
# implicitly importable from inside api/.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from loan_calculator import Apartment, CustomerDividend, Loan, MonthlyCost  # noqa: E402
from config import (  # noqa: E402
    DEDUCTION_RATE,
    DIVIDEND_RATE,
    EQUITY,
    MAX_DEPOSIT,
    MAX_LOAN_PER_BORROWER,
)

# Largest payment schedule we will project, to bound the response size.
MAX_YEARS = 50

DEFAULTS = {
    'equity': EQUITY,
    'config': {
        'dividendRate': DIVIDEND_RATE,
        'deductionRate': DEDUCTION_RATE,
        'maxLoanPerBorrower': MAX_LOAN_PER_BORROWER,
        'maxDeposit': MAX_DEPOSIT,
    },
}


class RequestError(ValueError):
    """A problem with the request body rather than with the projection."""


def _number(payload, key, default=None):
    """Read a finite number from the payload."""
    value = payload.get(key, default)

    if value is None:
        raise RequestError(f'Missing "{key}"')

    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RequestError(f'"{key}" must be a number')

    if value != value or value in (float('inf'), float('-inf')):
        raise RequestError(f'"{key}" must be finite')

    return float(value)


def _flag(payload, key, default=True):
    """Read a boolean from the payload."""
    value = payload.get(key, default)

    if not isinstance(value, bool):
        raise RequestError(f'"{key}" must be a boolean')

    return value


def build_response(payload) -> dict:
    """Project the schedules for a request payload.

    Parameters
    ----------
    payload : dict
        Decoded JSON request body.

    Returns
    -------
    dict
        JSON-serialisable projection, with every monetary series rounded
        to two decimals.

    Raises
    ------
    RequestError
        The payload is malformed.
    ValueError
        The inputs are individually well-formed but not a valid loan.
        Raised by loan_calculator.
    """
    if not isinstance(payload, dict):
        raise RequestError('Body must be a JSON object')

    overrides = payload.get('config') or {}
    if not isinstance(overrides, dict):
        raise RequestError('"config" must be a JSON object')

    price = _number(payload, 'price')
    equity = _number(payload, 'equity')
    years = _number(payload, 'years')
    borrowers = _number(payload, 'borrowers')

    if years > MAX_YEARS:
        raise RequestError(f'Payment schedule cannot exceed {MAX_YEARS} years')

    if borrowers != int(borrowers):
        raise RequestError('"borrowers" must be a whole number')

    if price - equity < 0:
        raise ValueError('Equity cannot exceed the purchase price')

    apartment = Apartment(
        price=price,
        joint_expenses=_number(payload, 'jointExpenses'),
    )
    loan = Loan(
        amount=price - equity,
        nominal_rate=_number(payload, 'nominalRate'),
        years=int(years),
    )
    dividend = CustomerDividend(
        deposit=_number(payload, 'deposit'),
        borrowers=int(borrowers),
        dividend_rate=_number(overrides, 'dividendRate', DIVIDEND_RATE),
        max_loan_per_borrower=_number(
            overrides, 'maxLoanPerBorrower', MAX_LOAN_PER_BORROWER
        ),
        max_deposit=_number(overrides, 'maxDeposit', MAX_DEPOSIT),
    )
    expenses = MonthlyCost(
        loan=loan,
        apartment=apartment,
        customer_dividend=dividend,
        deduction_rate=_number(overrides, 'deductionRate', DEDUCTION_RATE),
        include_dividend=_flag(payload, 'includeDividend'),
        include_deduction=_flag(payload, 'includeDeduction'),
    )

    schedules = expenses.get_schedules()
    series = {
        key: [round(float(value), 2) for value in schedule]
        for key, schedule in schedules.items()
    }

    return {
        'amount': round(loan.amount, 2),
        'monthlyRate': loan.get_monthly_rate(),
        'months': loan.get_number_of_months(),
        'annuity': round(loan.get_annuity(), 2),
        'jointExpensesShare': round(
            apartment.joint_expenses / dividend.borrowers, 2
        ),
        # Month 0 is the opening balance, so interest is first paid in month 1.
        'totalInterest': round(float(sum(schedules['interest'][1:])), 2),
        'balance': series['balance'],
        'interest': series['interest'],
        'dividend': series['dividend'],
        'deduction': series['deduction'],
        'monthlyCost': series['monthly_cost'],
    }


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        encoded = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(encoded)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        self._send(200, DEFAULTS)

    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)

        try:
            payload = json.loads(self.rfile.read(length) or b'{}')
        except json.JSONDecodeError:
            self._send(400, {'error': 'Body must be valid JSON'})
            return

        try:
            self._send(200, build_response(payload))
        except ValueError as error:
            # Covers RequestError and the ValueErrors raised by loan_calculator.
            self._send(400, {'error': str(error)})
        except Exception:  # noqa: BLE001 - never leak a traceback to the client
            self.log_error('Failed to build schedule: %s', traceback.format_exc())
            self._send(500, {'error': 'Could not build the schedule'})
