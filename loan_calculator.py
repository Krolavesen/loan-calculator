import numpy as np
from config import MAX_DEPOSIT, MAX_LOAN_PER_BORROWER
from config import DIVIDEND_RATE, DEDUCTION_RATE


class Apartment:
    def __init__(self, price, joint_expenses) -> None:
        """Initialize an Apartment object.

        Parameters
        ----------
        price : float
            Total purchase price of the apartment in NOK.
        joint_expenses : float
            Monthly joint apartment expenses in NOK.
        """
        self.price = price
        self.joint_expenses = joint_expenses


class Loan:
    def __init__(self, amount, nominal_rate, years) -> None:
        """Initialize a Loan object.

        Parameters
        ----------
        amount : float
            Principal loan amount in NOK.
        nominal_rate : float
            Annual nominal interest rate expressed as a decimal.
            For example, 4.92% is represented as 0.0492.
        years : int
            Number of years in the payment schedule of a Loan object.
        """
        self.amount = amount
        self.nominal_rate = nominal_rate
        self.years = years

    def get_monthly_rate(self) -> float:
        """Calculate the monthly interest rate from the nominal rate.

        Returns
        -------
        float
            Monthly interest rate expressed as a decimal. 
            For example, a nominal rate of 4.92% corresponds to a
            monthly rate of 0.0492 / 12.

        Raises
        ------
        ValueError
            Nominal rates must be positive
        """
        if self.nominal_rate <= 0:
            raise ValueError("Nominal rate must be positive")

        return self.nominal_rate / 12

    def get_number_of_months(self) -> int:
        """Calculate the number of months in the payment schedule.

        Returns
        -------
        int
            Total number of months in the payment schedule.

        Raises
        ------
        ValueError
            Years in payment schedule must be positive.
        """
        if self.years <= 0:
            raise ValueError('Years must be positive')

        return self.years * 12

    def get_annuity(self) -> float:
        """Calculate the projected annuity of a Loan object.

        Returns
        -------
        float
            Monthly payment of a loan in NOK.

        Raises
        ------
        ValueError
            Loan amount cannot be negative.
        """
        if self.amount < 0:
            raise ValueError('Loan amount cannot be negative')

        monthly_rate = self.get_monthly_rate()
        months = self.get_number_of_months()

        annuity = (
            monthly_rate / (1 - (1 + monthly_rate) ** (-months))
            * self.amount
        )

        return annuity


class LoanBorrower:
    borrowers = 0
    joint_savings = 0

    def __init__(self, income, savings, debt) -> None:
        self.income = income
        self.savings = savings
        self.debt = debt
        LoanBorrower.borrowers += 1
        LoanBorrower.joint_savings += savings

    def get_max_loan_by_debt(self) -> float:
        return self.income * 5 - self.debt

    def get_max_purchase_price(self) -> float:
        return self.get_max_loan_by_debt() + self.savings


class CustomerDividend:
    def __init__(self, deposit, borrowers) -> None:
        """Initialize a CustomerDividend object.

        Parameters
        ----------
        deposit : float
            Amount deposited during the previous calendar year in NOK.
        borrowers : int
            Number of borrowers associated with a loan.
        """
        self.deposit = deposit
        self.borrowers = borrowers

    def get_dividend(self, loan_balance_schedule) -> np.ndarray:
        """Calculate the projected dividend rate over the payment schedule.

        Parameters
        ----------
        loan_balance_schedule : np.ndarray
            Outstanding loan balance for each month, including the 
            initial balance at month 0.

        Returns
        -------
        np.ndarray
            Dividend for each month in the payment schedule in NOK.

        Raises
        ------
        ValueError
            Deposit cannot be negative.
        ValueError
            Number of borrowers must be positive.
        """

        if self.deposit < 0:
            raise ValueError("Deposit cannot be negative")

        if self.borrowers <= 0:
            raise ValueError("Number of borrowers must be positive")

        borrowers = min(self.borrowers, 2)

        loan_limit = MAX_LOAN_PER_BORROWER * borrowers
        deposit_limit = MAX_DEPOSIT

        eligible_loan = np.minimum(loan_balance_schedule, loan_limit)
        eligible_deposit = min(self.deposit, deposit_limit)

        return (eligible_loan + eligible_deposit) * DIVIDEND_RATE


class MonthlyCost:
    def __init__(self, loan, apartment, customer_dividend):
        """Initialize a MonthlyCost object.

        Parameters
        ----------
        loan : Loan
            Loan object used to calculate the loan cost in NOK.
        apartment : Apartment
            Apartment object used to calculate joint expenses in NOK.
        customer_dividend : CustomerDividend
            CustomerDividend object used to calculate dividend returns
            in NOK.
        """
        self.loan = loan
        self.apartment = apartment
        self.customer_dividend = customer_dividend

    def _get_outstanding_balance_schedule(self) -> np.ndarray:
        """Calculate the projected outstanding balance schedule.

        Returns
        -------
        np.ndarray
            Outstanding loan balance for each month in the payment 
            schedule in NOK.
        """
        annuity = self.loan.get_annuity()
        interest = self.loan.get_monthly_rate()
        loan = self.loan.amount

        n = self.loan.get_number_of_months()
        months = np.arange(n + 1)

        outstanding_balance = (
            loan * (1 + interest) ** months
            - annuity * ((1 + interest) ** months - 1) / interest
        )
        return outstanding_balance

    def get_interest_schedule(self) -> np.ndarray:
        """Calculate the projected interest schedule.

        Returns
        -------
        np.ndarray
            Interest payment for each month in the payment schedule 
            in NOK.
        """
        balance = self._get_outstanding_balance_schedule()
        interest = self.loan.get_monthly_rate()
        return balance * interest

    def _get_customer_dividend(self) -> np.ndarray:
        """Calculate the projected customer dividend schedule.

        Returns
        -------
        np.ndarray
            Customer dividend for each month in the payment schedule 
            in NOK.
        """
        balance = self._get_outstanding_balance_schedule()
        return self.customer_dividend.get_dividend(balance)

    def _get_tax_deduction(self) -> np.ndarray:
        """Calculate the projected tax deduction schedule.

        Returns
        -------
        np.ndarray
            Tax deduction for each month in the payment schedule in NOK.
        """
        interest = self.get_interest_schedule()
        return interest * DEDUCTION_RATE

    def get_monthly_cost(self) -> np.ndarray:
        """Calculate the projected monthly cost schedule.

        Returns
        -------
        np.ndarray
            Monthly cost for each month in the payment schedule in NOK.
        """
        annuity = self.loan.get_annuity()
        deduction = self._get_tax_deduction()
        dividend = self._get_customer_dividend() / 12
        joint_expenses = (
            self.apartment.joint_expenses
            / self.customer_dividend.borrowers  # change to borrowers from Borrower object
        )
        return annuity - deduction  # + joint expenses - dividend
