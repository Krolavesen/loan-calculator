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
from tax import get_net_pay  # noqa: E402
from config import (  # noqa: E402
    DEDUCTION_RATE,
    DIVIDEND_RATE,
    LOWER_QUANTILE_RATE,
    MAX_DEPOSIT,
    MAX_LOAN_PER_BORROWER,
    UPPER_QUANTILE_RATE,
)

# Largest payment schedule we will project, to bound the response size.
MAX_YEARS = 50

DEFAULTS = {
    'config': {
        'dividendRate': DIVIDEND_RATE,
        'deductionRate': DEDUCTION_RATE,
        'maxLoanPerBorrower': MAX_LOAN_PER_BORROWER,
        'maxDeposit': MAX_DEPOSIT,
        'lowerQuantileRate': LOWER_QUANTILE_RATE,
        'upperQuantileRate': UPPER_QUANTILE_RATE,
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


def _loan_share(payload):
    """Read person 1's share of the bank loan, or None to derive it."""
    if payload.get('loanShare') is None:
        return None

    share = _number(payload, 'loanShare')

    if not 0 <= share <= 1:
        raise RequestError('"loanShare" must be between 0 and 1')

    return share


def _share(payload) -> float:
    """Read person 1's share of the loan from the payload."""
    share = _number(payload, 'ownershipShare', 0.5)

    if not 0 <= share <= 1:
        raise RequestError('"ownershipShare" must be between 0 and 1')

    return share


def _pair(payload, key, default) -> list:
    """Read a list of two numbers, one per person, from the payload."""
    values = payload.get(key, default)

    if not isinstance(values, list) or len(values) != 2:
        raise RequestError(f'"{key}" must be a list of two numbers')

    return [_number({key: value}, key) for value in values]


def _recurring(payload) -> list:
    """Read each person's recurring payments as a monthly total.

    Each payment is {"amount": NOK, "period": "month" | "year"}. A yearly
    payment counts as a twelfth of itself each month.
    """
    lists = payload.get('recurringPayments', [[], []])

    if not isinstance(lists, list) or len(lists) != 2:
        raise RequestError('"recurringPayments" must be a list of two lists')

    totals = []
    for payments in lists:
        if not isinstance(payments, list):
            raise RequestError('"recurringPayments" must be a list of two lists')

        total = 0
        for payment in payments:
            if not isinstance(payment, dict):
                raise RequestError('Each recurring payment must be an object')

            amount = _number(payment, 'amount', 0)
            period = payment.get('period', 'month')

            if amount < 0:
                raise RequestError('A recurring payment cannot be negative')

            if period not in ('month', 'year'):
                raise RequestError('"period" must be "month" or "year"')

            total += amount if period == 'month' else amount / 12

        totals.append(total)

    return totals


def _equities(payload, share) -> list:
    """Read each person's equity, or split a single "equity" by share."""
    if 'equities' in payload:
        equities = _pair(payload, 'equities', None)
    else:
        equity = _number(payload, 'equity')
        equities = [equity * share, equity * (1 - share)]

    if min(equities) < 0:
        raise ValueError('Equity cannot be negative')

    return equities


def _annual_interest(interest) -> list:
    """Sum the monthly interest schedule into calendar years of the loan."""
    paid = interest[1:]
    return [
        float(paid[start:start + 12].sum())
        for start in range(0, len(paid), 12)
    ]


def _person(
    share, equity, price, loan_amount, salary, student_loan, recurring,
    joint_expenses, schedules, annual_interest, deduction_rate,
    loan_share_override=None,
) -> dict:
    """Project one owner's part of the loan and its effect on their pay.

    The owner is responsible for their share of the price. What their
    equity does not cover, they borrow, so their part of the loan is
    `share * price - equity`. Payments, interest and the tax deduction
    follow that part of the loan, not the ownership share. The interest
    for the first year is what goes in the skattekort under "renter på
    gjeld".

    If one owner's equity exceeds their share, the other takes the whole
    bank loan and owes them the rest privately. That private balance is
    reported separately and gets no interest or deduction here.

    `loan_share_override` sets their share of the bank loan by hand
    instead. What they need beyond their equity and what they borrow from
    the bank can then differ, and the difference is the private balance.
    """
    loan = share * price - equity

    if loan_share_override is None:
        bank_loan = min(max(loan, 0), loan_amount)
        loan_share = bank_loan / loan_amount if loan_amount else 0
    else:
        loan_share = loan_share_override
        bank_loan = loan_share * loan_amount

    interest_year_one = (
        annual_interest[0] * loan_share if annual_interest else 0
    )
    pay = get_net_pay(salary, max(interest_year_one, 0))
    monthly_cost = float(schedules['monthly_cost'][1] * loan_share)
    # Joint expenses are split evenly between the two owners.
    monthly_expenses = joint_expenses / 2

    return {
        'share': share,
        'equity': equity,
        # Their share of the purchase price.
        'priceShare': round(share * price, 2),
        # What they need beyond their equity. Negative means their equity
        # exceeds their share.
        'loan': round(loan, 2),
        # Their part of the bank loan.
        'bankLoan': round(bank_loan, 2),
        'loanShare': loan_share,
        # Owed to the other owner on top of the bank loan (positive), or
        # lent to them (negative).
        'privateLoan': round(loan - bank_loan, 2),
        'grossSalary': salary,
        'monthlyCost': round(monthly_cost, 2),
        'monthlyExpenses': round(monthly_expenses, 2),
        'monthlyCostWithExpenses': round(monthly_cost + monthly_expenses, 2),
        'annualInterest': round(float(interest_year_one), 2),
        'annualInterestByYear': [round(i * loan_share, 2) for i in annual_interest],
        # The deduction at the full rate, which a high enough salary gets.
        'maxAnnualDeduction': round(float(interest_year_one * deduction_rate), 2),
        # The deduction their salary actually gets.
        'annualDeduction': round(pay['saved'], 2),
        'tax': round(pay['tax'], 2),
        # Tabelltrekk in a regular month, and the pay that lands after it.
        'withholding': round(pay['withholding'], 2),
        'netMonthly': round(pay['net_regular_month'], 2),
        'netMonthlyWithoutDeduction': round(
            pay['net_regular_month'] - pay['saved_monthly'], 2
        ),
        'leftAfterLoan': round(pay['net_regular_month'] - monthly_cost, 2),
        'leftAfterLoanAndExpenses': round(
            pay['net_regular_month'] - monthly_cost - monthly_expenses, 2
        ),
        # Student loan received from Lånekassen: tax-free income on top of
        # net pay, outside the tax estimate.
        'studentLoan': student_loan,
        # Their own recurring payments, such as subscriptions, per month.
        'recurringMonthly': round(recurring, 2),
        # Left after the loan, joint expenses and recurring payments, with
        # the student loan added.
        'leftAfterAll': round(
            pay['net_regular_month'] + student_loan
            - monthly_cost - monthly_expenses - recurring,
            2,
        ),
    }


def _with_expenses(monthly_cost, joint_expenses) -> list:
    """Add the joint expenses to every paid month of a cost schedule."""
    total = monthly_cost.copy()
    total[1:] += joint_expenses
    return _series(total)


def _series(schedule) -> list:
    """Round a projected schedule to two decimals for the response."""
    return [round(float(value), 2) for value in schedule]


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
    years = _number(payload, 'years')
    share = _share(payload)
    loan_share = _loan_share(payload)
    equities = _equities(payload, share)
    equity = sum(equities)
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
    deduction_rate = _number(overrides, 'deductionRate', DEDUCTION_RATE)
    expenses = MonthlyCost(
        loan=loan,
        apartment=apartment,
        customer_dividend=dividend,
        deduction_rate=deduction_rate,
        include_dividend=_flag(payload, 'includeDividend'),
        include_deduction=_flag(payload, 'includeDeduction'),
    )

    salaries = _pair(payload, 'salaries', [0, 0])
    student_loans = _pair(payload, 'studentLoans', [0, 0])
    recurring = _recurring(payload)

    lower_rate = _number(overrides, 'lowerQuantileRate', LOWER_QUANTILE_RATE)
    upper_rate = _number(overrides, 'upperQuantileRate', UPPER_QUANTILE_RATE)
    estimate = expenses.get_quantile_estimate(lower_rate, upper_rate)

    schedules = expenses.get_schedules()
    series = {
        key: _series(schedule) for key, schedule in schedules.items()
    }
    annual_interest = _annual_interest(schedules['interest'])

    return {
        'amount': round(loan.amount, 2),
        # Share of the purchase price financed by the loan (belåningsgrad).
        'loanToValue': loan.amount / price if price else 0,
        'monthlyRate': loan.get_monthly_rate(),
        'months': loan.get_number_of_months(),
        'annuity': round(loan.get_annuity(), 2),
        'jointExpenses': apartment.joint_expenses,
        'totalInterest': round(float(sum(schedules['interest'])), 2),
        'balance': series['balance'],
        'interest': series['interest'],
        'dividend': series['dividend'],
        'deduction': series['deduction'],
        'monthlyCost': series['monthly_cost'],
        # The loan cost plus the joint expenses, which the model leaves out.
        'monthlyCostWithExpenses': _with_expenses(
            schedules['monthly_cost'], apartment.joint_expenses
        ),
        # Interest paid in each year of the loan, year 1 first.
        'annualInterest': [round(i, 2) for i in annual_interest],
        # Whether the bank loan split was set by hand, not derived.
        'loanShareSetByHand': loan_share is not None,
        # Each owner's share: person 1 owns `ownershipShare`, person 2 the rest.
        'persons': [
            _person(
                person_share, person_equity, price, loan.amount, salary,
                student_loan, person_recurring, apartment.joint_expenses,
                schedules, annual_interest, deduction_rate, person_loan_share,
            )
            for (
                person_share, person_equity, salary, student_loan,
                person_recurring, person_loan_share,
            ) in zip(
                (share, 1 - share), equities, salaries, student_loans, recurring,
                (None, None) if loan_share is None else (loan_share, 1 - loan_share),
            )
        ],
        # Monthly cost at the lower and upper quantile of the projected rate.
        # The rates are a fixed forecast, independent of nominalRate.
        'quantiles': {
            'lowerRate': lower_rate,
            'upperRate': upper_rate,
            'lower': _series(estimate['lower']),
            'upper': _series(estimate['upper']),
            'lowerWithExpenses': _with_expenses(
                estimate['lower'], apartment.joint_expenses
            ),
            'upperWithExpenses': _with_expenses(
                estimate['upper'], apartment.joint_expenses
            ),
        },
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
