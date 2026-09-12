"""Tests for the loan projection and the /api/schedule request layer."""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, 'api'))

from loan_calculator import Apartment, CustomerDividend, Loan, MonthlyCost  # noqa: E402
from schedule import RequestError, build_response  # noqa: E402

# The Osterhaus gate 8B example from main.py.
PAYLOAD = {
    'price': 6.69e6,
    'jointExpenses': 3929,
    'equity': 3.9e6,
    'nominalRate': 0.0492,
    'years': 30,
    'borrowers': 2,
    'deposit': 0,
    'includeDividend': True,
    'includeDeduction': True,
}


def make_expenses(**overrides):
    """Build a MonthlyCost for the reference example."""
    payload = {**PAYLOAD, **overrides}
    apartment = Apartment(
        price=payload['price'], joint_expenses=payload['jointExpenses']
    )
    loan = Loan(
        amount=payload['price'] - payload['equity'],
        nominal_rate=payload['nominalRate'],
        years=payload['years'],
    )
    dividend = CustomerDividend(
        deposit=payload['deposit'], borrowers=payload['borrowers']
    )
    return MonthlyCost(
        loan=loan,
        apartment=apartment,
        customer_dividend=dividend,
        include_dividend=payload['includeDividend'],
        include_deduction=payload['includeDeduction'],
    )


class MonthlyCostTest(unittest.TestCase):
    def test_annuity(self):
        loan = Loan(amount=2.79e6, nominal_rate=0.0492, years=30)
        self.assertAlmostEqual(loan.get_annuity(), 14841.21046422484, places=8)

    def test_monthly_cost_schedule(self):
        cost = make_expenses().get_monthly_cost()
        self.assertAlmostEqual(cost[0], 13475.380464224838, places=8)
        self.assertAlmostEqual(cost[1], 13479.441569448967, places=8)
        self.assertAlmostEqual(cost[180], 14553.647711936312, places=8)
        self.assertAlmostEqual(cost[360], 16805.710464224838, places=8)

    def test_amortises_to_zero(self):
        balance = make_expenses().get_schedules()['balance']
        self.assertEqual(len(balance), 361)
        self.assertAlmostEqual(balance[0], 2.79e6, places=6)
        self.assertAlmostEqual(balance[360], 0, places=6)

    def test_toggles_drop_their_terms(self):
        bare = make_expenses(includeDividend=False, includeDeduction=False)
        schedules = bare.get_schedules()
        self.assertEqual(list(schedules['dividend']), [0] * 361)
        self.assertEqual(list(schedules['deduction']), [0] * 361)
        self.assertAlmostEqual(
            schedules['monthly_cost'][0],
            bare.loan.get_annuity() + 3929 / 2,
            places=8,
        )

    def test_at_most_two_borrowers_count_towards_the_loan_cap(self):
        two = make_expenses(borrowers=2).get_schedules()['dividend']
        four = make_expenses(borrowers=4).get_schedules()['dividend']
        self.assertAlmostEqual(two[0], four[0], places=8)

    def test_eligible_deposit_is_capped(self):
        at_cap = make_expenses(deposit=2e6).get_schedules()['dividend']
        over_cap = make_expenses(deposit=5e6).get_schedules()['dividend']
        self.assertAlmostEqual(at_cap[0], over_cap[0], places=8)

    def test_config_overrides_are_honoured(self):
        dividend = CustomerDividend(deposit=0, borrowers=2, dividend_rate=0)
        expenses = MonthlyCost(
            loan=Loan(amount=2.79e6, nominal_rate=0.0492, years=30),
            apartment=Apartment(price=6.69e6, joint_expenses=3929),
            customer_dividend=dividend,
            deduction_rate=0,
        )
        schedules = expenses.get_schedules()
        self.assertEqual(list(schedules['dividend']), [0] * 361)
        self.assertEqual(list(schedules['deduction']), [0] * 361)


class BuildResponseTest(unittest.TestCase):
    def test_matches_the_reference_example(self):
        body = build_response(PAYLOAD)
        self.assertEqual(body['months'], 360)
        self.assertEqual(body['amount'], 2.79e6)
        self.assertAlmostEqual(body['annuity'], 14841.21, places=2)
        self.assertAlmostEqual(body['monthlyCost'][0], 13475.38, places=2)
        self.assertAlmostEqual(body['monthlyCost'][360], 16805.71, places=2)
        self.assertEqual(body['jointExpensesShare'], 1964.5)

    def test_every_series_covers_month_zero_to_the_last_month(self):
        body = build_response(PAYLOAD)
        for key in ('balance', 'interest', 'dividend', 'deduction', 'monthlyCost'):
            self.assertEqual(len(body[key]), 361, key)

    def test_config_overrides_reach_the_projection(self):
        body = build_response(
            {**PAYLOAD, 'config': {'dividendRate': 0, 'deductionRate': 0}}
        )
        self.assertEqual(body['dividend'], [0] * 361)
        self.assertEqual(body['deduction'], [0] * 361)

    def test_rejects_a_missing_field(self):
        payload = {key: value for key, value in PAYLOAD.items() if key != 'price'}
        with self.assertRaises(RequestError):
            build_response(payload)

    def test_rejects_a_non_numeric_field(self):
        with self.assertRaises(RequestError):
            build_response({**PAYLOAD, 'price': 'lots'})

    def test_rejects_a_boolean_masquerading_as_a_number(self):
        with self.assertRaises(RequestError):
            build_response({**PAYLOAD, 'years': True})

    def test_rejects_a_schedule_that_is_too_long(self):
        with self.assertRaises(RequestError):
            build_response({**PAYLOAD, 'years': 500})

    def test_rejects_equity_above_the_purchase_price(self):
        with self.assertRaises(ValueError):
            build_response({**PAYLOAD, 'equity': 7e6})

    def test_rejects_a_non_positive_nominal_rate(self):
        with self.assertRaises(ValueError):
            build_response({**PAYLOAD, 'nominalRate': 0})


if __name__ == '__main__':
    unittest.main()
