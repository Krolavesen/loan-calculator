import matplotlib.pyplot as plt
import numpy as np
from loan_calculator import Apartment, Loan, CustomerDividend
from loan_calculator import MonthlyCost, LoanBorrower


# Loan borrowers.
person1 = LoanBorrower(
    income=720_000,
    savings=300_000,
    debt=200_000
)
person2 = LoanBorrower(
    income=130_000,
    savings=2_600_000,
    debt=500_000
)

# Apartment.
osterhaus_gate_8b = Apartment(
    price=6.55e6, joint_expenses=3929
)

# Actual projected monthly costs.
loan = Loan(
    amount=osterhaus_gate_8b.price - LoanBorrower.joint_savings,
    nominal_rate=0.035,
    years=30
)

# Lower quantile in 2027/28.
lower = Loan(
    amount=osterhaus_gate_8b.price - LoanBorrower.joint_savings,
    nominal_rate=0.0225,
    years=30
)
# Upper quantile in 2027/28
upper = Loan(
    amount=osterhaus_gate_8b.price - LoanBorrower.joint_savings,
    nominal_rate=0.0375,
    years=30
)

# Customer dividend.
dividend = CustomerDividend(
    deposit=0,
    borrowers=LoanBorrower.borrowers
)

# Actual projected monthly expenses.
expenses = MonthlyCost(
    loan=loan,
    apartment=osterhaus_gate_8b,
    customer_dividend=dividend
)

# Upper quantile of projected interest in 2027/28.
upper_expenses = MonthlyCost(
    loan=upper,
    apartment=osterhaus_gate_8b,
    customer_dividend=dividend
)
# Lower quantile of projected interest in 2027/28.
lower_expenses = MonthlyCost(
    loan=lower,
    apartment=osterhaus_gate_8b,
    customer_dividend=dividend
)

# Number of months in the payment schedule.
n = loan.get_number_of_months()

# Months 0 through 360.
month = np.arange(n + 1)

# Monthly expenses for each month in the payment schedule.
cost = expenses.get_monthly_cost()

# Upepr and lower bound of projected interest in 27/28.
upper_cost = upper_expenses.get_monthly_cost()
lower_cost = lower_expenses.get_monthly_cost()

if __name__ == "__main__":

    plt.plot(
        month, cost,
        label="Net cost per month, 3.5 nom."
    )
    plt.plot(
        month, upper_cost,
        color="red", linestyle="--",
        label="Upper quantile 3.75 nom."
    )
    plt.plot(
        month, lower_cost,
        color="green", linestyle="--",
        label="Lower quantile, 2.25 nom."
    )
    plt.fill_between(
        month, upper_cost, lower_cost,
        color="orange", alpha=0.2
    )

    # plt.hlines(
    #     xmin=month[0], xmax=month[-1],
    #     y=loan.get_annuity(), linestyles="--",
    #     label=f"Annuity:{loan.get_annuity():,.0f},-",
    #     colors="orange"
    # )

    # plt.hlines(
    #     xmin=month[0], xmax=month[-1],
    #     y=cost[0], linestyles="--",
    #     label=f"Tax deduction:{cost[0]:,.0f},-", colors="green"
    # )

    plt.xlabel("Month")
    plt.legend()
    plt.title(
        f"Monthly Expense with lower and upper bound \n" +
        f"of projected interest in 2027/28 (3650`, 3.5 nom.)"
    )
    plt.savefig("monthly_expenses.png")
    plt.close()
