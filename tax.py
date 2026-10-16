"""Estimate Norwegian income tax on a salary, with and without the interest
deduction on a mortgage.

The estimate covers the three parts of tax on wages: tax on alminnelig
inntekt, trinnskatt and trygdeavgift. It leaves out everything else, such as
wealth tax, other deductions and the lower trygdeavgift threshold, so it is an
estimate rather than a tax return. Rates live in config.py.
"""
from config import (
    MINIMUM_DEDUCTION_CAP,
    MINIMUM_DEDUCTION_RATE,
    PERSONAL_ALLOWANCE,
    SOCIAL_SECURITY_RATE,
    STEP_TAX_BRACKETS,
    DEDUCTION_RATE,
    WITHHOLDING_MONTHS,
)


def get_minimum_deduction(
    gross_salary,
    rate=MINIMUM_DEDUCTION_RATE,
    cap=MINIMUM_DEDUCTION_CAP,
) -> float:
    """Calculate the minimum deduction (minstefradrag) on a salary.

    Parameters
    ----------
    gross_salary : float
        Annual gross salary in NOK.

    Returns
    -------
    float
        Minimum deduction in NOK, a share of the salary up to a cap.
    """
    return min(gross_salary * rate, cap)


def get_step_tax(gross_salary, brackets=STEP_TAX_BRACKETS) -> float:
    """Calculate the step tax (trinnskatt) on a salary.

    Parameters
    ----------
    gross_salary : float
        Annual gross salary in NOK.
    brackets : list of (float, float)
        (threshold, rate) pairs in rising order. Each rate applies to the
        part of the salary above its threshold, up to the next threshold.

    Returns
    -------
    float
        Step tax in NOK.
    """
    tax = 0

    for i, (threshold, rate) in enumerate(brackets):
        ceiling = brackets[i + 1][0] if i + 1 < len(brackets) else float('inf')
        taxable = min(gross_salary, ceiling) - threshold

        if taxable > 0:
            tax += taxable * rate

    return tax


def get_income_tax(
    gross_salary,
    interest=0,
    deduction_rate=DEDUCTION_RATE,
    personal_allowance=PERSONAL_ALLOWANCE,
    social_security_rate=SOCIAL_SECURITY_RATE,
) -> float:
    """Estimate the annual income tax on a salary.

    Parameters
    ----------
    gross_salary : float
        Annual gross salary in NOK.
    interest : float, optional
        Annual interest paid on debt in NOK. Deducted from alminnelig
        inntekt, so it saves deduction_rate of itself at most.
    deduction_rate : float, optional
        Tax rate on alminnelig inntekt. Defaults to DEDUCTION_RATE in
        config.py.

    Returns
    -------
    float
        Estimated income tax in NOK.

    Raises
    ------
    ValueError
        Salary and interest cannot be negative.
    """
    if gross_salary < 0:
        raise ValueError('Salary cannot be negative')

    if interest < 0:
        raise ValueError('Interest cannot be negative')

    general_income = (
        gross_salary - get_minimum_deduction(gross_salary) - interest
    )
    general_tax = max(general_income - personal_allowance, 0) * deduction_rate

    return (
        general_tax
        + get_step_tax(gross_salary)
        + gross_salary * social_security_rate
    )


def get_withholding(annual_tax, months=WITHHOLDING_MONTHS) -> float:
    """Estimate the tabelltrekk in a regular month.

    The tax table spreads the year's tax over `months` months rather than
    12, because June is trekkfri and December is withheld at half. The
    table looks up each month's salary separately, so this is the
    annualised tax divided by the withholding months.

    Parameters
    ----------
    annual_tax : float
        Estimated income tax for the year in NOK.

    Returns
    -------
    float
        Withholding in a regular month in NOK.
    """
    return annual_tax / months


def get_net_pay(gross_salary, interest=0) -> dict:
    """Estimate the yearly and monthly net pay on a salary.

    Parameters
    ----------
    gross_salary : float
        Annual gross salary in NOK.
    interest : float, optional
        Annual interest paid on debt in NOK, entered in the skattekort.

    Returns
    -------
    dict
        'tax' and 'net' per year, and 'net_monthly' as the yearly average.
        'withholding' is the tabelltrekk in a regular month, and
        'net_regular_month' the pay that lands after it. 'saved' is the
        tax the interest deduction saves per year, compared to no
        interest, and 'saved_monthly' its effect on a regular month.
    """
    tax = get_income_tax(gross_salary, interest)
    tax_without_interest = get_income_tax(gross_salary)
    saved = tax_without_interest - tax
    withholding = get_withholding(tax)

    return {
        'tax': tax,
        'net': gross_salary - tax,
        'net_monthly': (gross_salary - tax) / 12,
        'withholding': withholding,
        'net_regular_month': gross_salary / 12 - withholding,
        'saved': saved,
        'saved_monthly': get_withholding(saved),
    }
