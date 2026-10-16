"""Tests for the loan projection and the /api/schedule request layer."""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, 'api'))

from loan_calculator import Apartment, CustomerDividend, Loan, MonthlyCost  # noqa: E402
from schedule import RequestError, build_response  # noqa: E402
from tax import get_income_tax, get_net_pay, get_step_tax, get_withholding  # noqa: E402

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
        self.assertEqual(cost[0], 0)
        self.assertAlmostEqual(cost[1], 11510.88046422484, places=8)
        self.assertAlmostEqual(cost[2], 11514.941569448969, places=8)
        self.assertAlmostEqual(cost[181], 12589.147711936313, places=8)
        self.assertAlmostEqual(cost[360], 14823.567342798555, places=8)

    def test_interest_is_paid_on_the_previous_balance(self):
        expenses = make_expenses()
        schedules = expenses.get_schedules()
        rate = expenses.loan.get_monthly_rate()
        self.assertEqual(schedules['interest'][0], 0)
        self.assertAlmostEqual(schedules['interest'][1], 2.79e6 * rate, places=8)
        self.assertAlmostEqual(
            schedules['interest'][360], schedules['balance'][359] * rate, places=8
        )

    def test_total_interest_is_total_paid_minus_principal(self):
        expenses = make_expenses()
        total = expenses.get_interest_schedule().sum()
        paid = expenses.loan.get_annuity() * 360
        self.assertAlmostEqual(total, paid - 2.79e6, places=6)

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
            schedules['monthly_cost'][1],
            bare.loan.get_annuity(),
            places=8,
        )

    def test_dividend_toggle_changes_the_monthly_cost(self):
        on = make_expenses().get_schedules()
        off = make_expenses(includeDividend=False).get_monthly_cost()
        self.assertAlmostEqual(
            off[1] - on['monthly_cost'][1], on['dividend'][1] / 12, places=8
        )
        self.assertAlmostEqual(on['dividend'][1] / 12, 813.75, places=8)

    def test_at_most_two_borrowers_count_towards_the_loan_cap(self):
        two = make_expenses(borrowers=2).get_schedules()['dividend']
        four = make_expenses(borrowers=4).get_schedules()['dividend']
        self.assertAlmostEqual(two[1], four[1], places=8)

    def test_eligible_deposit_is_capped(self):
        at_cap = make_expenses(deposit=2e6).get_schedules()['dividend']
        over_cap = make_expenses(deposit=5e6).get_schedules()['dividend']
        self.assertAlmostEqual(at_cap[1], over_cap[1], places=8)

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


class QuantileEstimateTest(unittest.TestCase):
    def test_baseline_is_the_monthly_cost(self):
        expenses = make_expenses()
        estimate = expenses.get_quantile_estimate(0.0225, 0.0375)
        self.assertEqual(
            list(estimate['baseline']), list(expenses.get_monthly_cost())
        )

    def test_quantiles_reprice_the_same_loan(self):
        estimate = make_expenses().get_quantile_estimate(0.0225, 0.0375)
        upper = make_expenses(nominalRate=0.0375).get_monthly_cost()
        lower = make_expenses(nominalRate=0.0225).get_monthly_cost()
        self.assertEqual(list(estimate['upper']), list(upper))
        self.assertEqual(list(estimate['lower']), list(lower))

    def test_does_not_change_the_baseline_loan(self):
        expenses = make_expenses()
        expenses.get_quantile_estimate(0.0225, 0.0375)
        self.assertEqual(expenses.loan.nominal_rate, 0.0492)

    def test_lower_quantile_costs_less_every_month(self):
        estimate = make_expenses().get_quantile_estimate(0.0225, 0.0375)
        self.assertTrue((estimate['lower'][1:] < estimate['upper'][1:]).all())

    def test_defaults_come_from_config(self):
        from config import LOWER_QUANTILE_RATE, UPPER_QUANTILE_RATE
        expenses = make_expenses()
        default = expenses.get_quantile_estimate()
        explicit = expenses.get_quantile_estimate(
            LOWER_QUANTILE_RATE, UPPER_QUANTILE_RATE
        )
        self.assertEqual(list(default['upper']), list(explicit['upper']))
        self.assertEqual(list(default['lower']), list(explicit['lower']))

    def test_rejects_crossed_quantiles(self):
        with self.assertRaises(ValueError):
            make_expenses().get_quantile_estimate(0.04, 0.03)


class TaxTest(unittest.TestCase):
    def test_step_tax_is_marginal_per_bracket(self):
        self.assertEqual(get_step_tax(200_000), 0)
        # 1.7 % of the first bracket, 4 % of the part in the second.
        self.assertAlmostEqual(
            get_step_tax(400_000),
            (318_300 - 226_100) * 0.017 + (400_000 - 318_300) * 0.04,
            places=6,
        )

    def test_interest_saves_the_deduction_rate(self):
        saved = get_income_tax(720_000) - get_income_tax(720_000, 100_000)
        self.assertAlmostEqual(saved, 100_000 * 0.22, places=6)

    def test_interest_cannot_push_tax_below_zero(self):
        self.assertEqual(get_net_pay(0, 100_000)['saved'], 0)

    def test_net_pay_adds_up(self):
        pay = get_net_pay(720_000, 100_000)
        self.assertAlmostEqual(pay['net'], 720_000 - pay['tax'], places=6)
        self.assertAlmostEqual(pay['net_monthly'] * 12, pay['net'], places=6)

    def test_tabelltrekk_spreads_the_tax_over_ten_and_a_half_months(self):
        self.assertAlmostEqual(get_withholding(105_000), 10_000, places=6)
        pay = get_net_pay(720_000, 100_000)
        self.assertAlmostEqual(pay['withholding'] * 10.5, pay['tax'], places=6)
        self.assertAlmostEqual(
            pay['net_regular_month'], 60_000 - pay['withholding'], places=6
        )
        # A regular month lands less than the yearly average.
        self.assertLess(pay['net_regular_month'], pay['net_monthly'])
        self.assertAlmostEqual(pay['saved_monthly'] * 10.5, pay['saved'], places=6)

    def test_rejects_negative_inputs(self):
        with self.assertRaises(ValueError):
            get_income_tax(-1)
        with self.assertRaises(ValueError):
            get_income_tax(100, -1)


class OwnershipTest(unittest.TestCase):
    def test_defaults_to_an_even_split_with_no_salary(self):
        persons = build_response(PAYLOAD)['persons']
        self.assertEqual([p['share'] for p in persons], [0.5, 0.5])
        self.assertEqual([p['grossSalary'] for p in persons], [0, 0])
        self.assertEqual(persons[0]['netMonthly'], 0)

    def test_each_person_borrows_their_share_of_the_price_less_equity(self):
        body = build_response(
            {**PAYLOAD, 'price': 6.55e6, 'equities': [2e5, 2.5e6]}
        )
        one, two = body['persons']
        self.assertEqual(body['amount'], 6.55e6 - 2.7e6)
        self.assertEqual([one['priceShare'], two['priceShare']], [3.275e6, 3.275e6])
        self.assertEqual([one['loan'], two['loan']], [3.075e6, 7.75e5])
        self.assertEqual([one['bankLoan'], two['bankLoan']], [3.075e6, 7.75e5])
        self.assertEqual([one['privateLoan'], two['privateLoan']], [0, 0])
        self.assertAlmostEqual(one['loan'] + two['loan'], body['amount'], places=6)
        self.assertAlmostEqual(one['loanShare'], 3.075e6 / 3.85e6, places=12)

    def test_costs_follow_the_loan_split_not_the_ownership_split(self):
        body = build_response(
            {**PAYLOAD, 'price': 6.55e6, 'equities': [2e5, 2.5e6]}
        )
        one, two = body['persons']
        self.assertAlmostEqual(
            one['monthlyCost'], body['monthlyCost'][1] * one['loanShare'], places=1
        )
        self.assertAlmostEqual(
            one['annualInterest'], body['annualInterest'][0] * one['loanShare'], places=1
        )
        self.assertGreater(one['annualInterest'], two['annualInterest'])

    def test_equity_above_the_share_means_a_negative_loan(self):
        body = build_response(
            {**PAYLOAD, 'price': 6.55e6, 'equities': [0, 3.5e6]}
        )
        one, two = body['persons']
        self.assertEqual(two['loan'], -2.25e5)
        self.assertEqual(one['loan'], 3.275e6)
        # Person 1 takes the whole bank loan and owes the rest privately.
        self.assertEqual(one['bankLoan'], body['amount'])
        self.assertEqual(one['loanShare'], 1)
        self.assertEqual(one['privateLoan'], 2.25e5)
        self.assertEqual(two['bankLoan'], 0)
        self.assertEqual(two['privateLoan'], -2.25e5)
        self.assertEqual(two['monthlyCost'], 0)
        self.assertEqual(two['annualInterest'], 0)
        self.assertEqual(two['annualDeduction'], 0)

    def test_single_equity_is_split_by_ownership_share(self):
        body = build_response({**PAYLOAD, 'ownershipShare': 0.2})
        one, two = body['persons']
        self.assertEqual([one['equity'], two['equity']], [3.9e6 * 0.2, 3.9e6 * 0.8])
        self.assertAlmostEqual(one['loanShare'], 0.2, places=12)

    def test_rejects_negative_equity(self):
        with self.assertRaises(ValueError):
            build_response({**PAYLOAD, 'equities': [-1, 1e6]})

    def test_split_covers_the_whole_loan(self):
        body = build_response({**PAYLOAD, 'ownershipShare': 0.2})
        one, two = body['persons']
        self.assertEqual([one['share'], two['share']], [0.2, 0.8])
        self.assertAlmostEqual(
            one['monthlyCost'] + two['monthlyCost'], body['monthlyCost'][1], places=1
        )
        self.assertAlmostEqual(
            one['annualInterest'] + two['annualInterest'], body['annualInterest'][0], places=1
        )

    def test_annual_interest_covers_every_payment(self):
        body = build_response(PAYLOAD)
        self.assertEqual(len(body['annualInterest']), 30)
        self.assertAlmostEqual(sum(body['annualInterest']), body['totalInterest'], places=0)
        self.assertGreater(body['annualInterest'][0], body['annualInterest'][29])

    def test_bigger_share_gets_more_deduction(self):
        body = build_response(
            {**PAYLOAD, 'ownershipShare': 0.2, 'salaries': [720_000, 720_000]}
        )
        one, two = body['persons']
        self.assertLess(one['annualDeduction'], two['annualDeduction'])
        self.assertAlmostEqual(two['maxAnnualDeduction'], two['annualInterest'] * 0.22, places=1)
        self.assertAlmostEqual(two['annualDeduction'], two['maxAnnualDeduction'], places=1)
        self.assertAlmostEqual(two['annualDeduction'], two['annualInterest'] * 0.22, places=1)
        self.assertAlmostEqual(
            two['netMonthly'] - two['netMonthlyWithoutDeduction'],
            two['annualDeduction'] / 10.5,
            places=1,
        )
        self.assertAlmostEqual(two['withholding'] * 10.5, two['tax'], places=1)
        self.assertAlmostEqual(
            two['netMonthly'], 720_000 / 12 - two['withholding'], places=1
        )
        self.assertAlmostEqual(
            two['leftAfterLoan'], two['netMonthly'] - two['monthlyCost'], places=1
        )
        self.assertAlmostEqual(
            two['leftAfterLoanAndExpenses'],
            two['netMonthly'] - two['monthlyCostWithExpenses'],
            places=1,
        )

    def test_joint_expenses_are_split_evenly(self):
        body = build_response(
            {**PAYLOAD, 'price': 6.55e6, 'ownershipShare': 0.33, 'equities': [2e5, 2.5e6]}
        )
        one, two = body['persons']
        # An even split, whatever the ownership share or the loans.
        self.assertEqual([one['monthlyExpenses'], two['monthlyExpenses']], [1964.5, 1964.5])
        self.assertGreater(one['monthlyCost'], two['monthlyCost'])
        self.assertAlmostEqual(
            one['monthlyCostWithExpenses'], one['monthlyCost'] + 1964.5, places=2
        )

    def test_student_loan_is_tax_free_income(self):
        body = build_response(
            {**PAYLOAD, 'salaries': [720_000, 720_000], 'studentLoans': [3_000, 0]}
        )
        one, two = body['persons']
        self.assertEqual(one['studentLoan'], 3_000)
        self.assertAlmostEqual(one['leftAfterAll'], one['leftAfterLoanAndExpenses'] + 3_000, places=2)
        self.assertAlmostEqual(two['leftAfterAll'], two['leftAfterLoanAndExpenses'], places=2)
        # It does not touch the tax estimate.
        self.assertEqual(one['tax'], two['tax'])
        self.assertEqual(one['netMonthly'], two['netMonthly'])

    def test_rejects_a_share_outside_zero_to_one(self):
        with self.assertRaises(RequestError):
            build_response({**PAYLOAD, 'ownershipShare': 1.5})

    def test_rejects_malformed_salaries(self):
        with self.assertRaises(RequestError):
            build_response({**PAYLOAD, 'salaries': [1]})
        with self.assertRaises(RequestError):
            build_response({**PAYLOAD, 'salaries': ['a', 1]})


class BuildResponseTest(unittest.TestCase):
    def test_matches_the_reference_example(self):
        body = build_response(PAYLOAD)
        self.assertEqual(body['months'], 360)
        self.assertEqual(body['amount'], 2.79e6)
        self.assertAlmostEqual(body['annuity'], 14841.21, places=2)
        self.assertEqual(body['monthlyCost'][0], 0)
        self.assertAlmostEqual(body['monthlyCost'][1], 11510.88, places=2)
        self.assertAlmostEqual(body['monthlyCost'][360], 14823.57, places=2)
        self.assertAlmostEqual(body['totalInterest'], 2552835.77, places=2)
        self.assertEqual(body['jointExpenses'], 3929)
        self.assertEqual(body['monthlyCostWithExpenses'][0], 0)
        self.assertAlmostEqual(
            body['monthlyCostWithExpenses'][1], body['monthlyCost'][1] + 3929, places=2
        )
        self.assertAlmostEqual(
            body['quantiles']['upperWithExpenses'][1],
            body['quantiles']['upper'][1] + 3929,
            places=2,
        )
        self.assertAlmostEqual(body['loanToValue'], 2.79e6 / 6.69e6, places=12)

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

    def test_quantiles_use_the_config_rates(self):
        body = build_response(PAYLOAD)
        quantiles = body['quantiles']
        self.assertEqual(quantiles['lowerRate'], 0.0225)
        self.assertEqual(quantiles['upperRate'], 0.0375)
        self.assertEqual(len(quantiles['lower']), 361)
        self.assertEqual(len(quantiles['upper']), 361)
        self.assertLess(quantiles['lower'][1], quantiles['upper'][1])

    def test_quantiles_ignore_the_nominal_rate(self):
        base = build_response(PAYLOAD)['quantiles']
        stressed = build_response({**PAYLOAD, 'nominalRate': 0.0792})['quantiles']
        self.assertEqual(base, stressed)

    def test_quantile_rate_overrides_reach_the_projection(self):
        body = build_response(
            {**PAYLOAD, 'config': {'lowerQuantileRate': 0.03, 'upperQuantileRate': 0.03}}
        )
        self.assertEqual(body['quantiles']['lower'], body['quantiles']['upper'])

    def test_rejects_crossed_quantile_rates(self):
        with self.assertRaises(ValueError):
            build_response(
                {**PAYLOAD, 'config': {'lowerQuantileRate': 0.05, 'upperQuantileRate': 0.03}}
            )

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
