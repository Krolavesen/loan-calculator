export interface LoanInput {
  /** Total purchase price of the apartment, in NOK. */
  price: number
  /** Monthly joint apartment expenses ("felleskostnader"), in NOK. */
  jointExpenses: number
  /** Equity (egenkapital) brought by person 1 and person 2, in NOK. */
  equities: [number, number]
  /** Annual nominal interest rate as a decimal, e.g. 0.0492 for 4.92 %. */
  nominalRate: number
  /** Length of the payment schedule, in years. */
  years: number
  /** Number of borrowers on the loan. */
  borrowers: number
  /** Amount deposited during the previous calendar year, in NOK. */
  deposit: number
  /** Include the projected customer dividend in the monthly cost. */
  includeDividend: boolean
  /** Include the projected tax deduction in the monthly cost. */
  includeDeduction: boolean
  /** Person 1's share of the loan as a decimal; person 2 owns the rest. */
  ownershipShare: number
  /** Person 1's share of the bank loan, or null to derive it from ownership and equity. */
  loanShare: number | null
  /** Gross annual salary for person 1 and person 2, in NOK. */
  salaries: [number, number]
  /** Monthly student loan received from Lånekassen by person 1 and person 2, in NOK. */
  studentLoans: [number, number]
  /** Recurring payments for person 1 and person 2. */
  recurringPayments: [RecurringPaymentInput[], RecurringPaymentInput[]]
}

export interface RecurringPaymentInput {
  amount: number
  period: 'month' | 'year'
}

/** One owner's share of the loan and its effect on their pay. */
export interface Person {
  share: number
  equity: number
  /** Their share of the purchase price. */
  priceShare: number
  /** Price share less equity. Negative if their equity exceeds their share. */
  loan: number
  /** Their part of the bank loan. */
  bankLoan: number
  /** Their part of the bank loan as a share of the whole loan. */
  loanShare: number
  /** Settled with the other owner: owed to them (positive) or lent to them (negative). */
  privateLoan: number
  grossSalary: number
  /** Their share of the month-1 loan cost. */
  monthlyCost: number
  /** Half the joint expenses: an even split between the two owners. */
  monthlyExpenses: number
  monthlyCostWithExpenses: number
  /** Their share of the interest paid in year 1: the skattekort figure. */
  annualInterest: number
  /** Their share of the interest paid in each year, year 1 first. */
  annualInterestByYear: number[]
  /** Tax the deduction saves per year at the full rate. */
  maxAnnualDeduction: number
  /** Tax the deduction saves them per year on their salary. */
  annualDeduction: number
  tax: number
  /** Tabelltrekk in a regular month. June is trekkfri and December half. */
  withholding: number
  /** Pay that lands in a regular month after tabelltrekk. */
  netMonthly: number
  netMonthlyWithoutDeduction: number
  leftAfterLoan: number
  leftAfterLoanAndExpenses: number
  /** Monthly student loan received, tax-free and outside the tax estimate. */
  studentLoan: number
  /** Their recurring payments, per month. */
  recurringMonthly: number
  /** Left after the loan, joint expenses and recurring payments, with the student loan added. */
  leftAfterAll: number
}

/** Overrides for the constants in `config.py`. */
export interface Config {
  dividendRate: number
  deductionRate: number
  maxLoanPerBorrower: number
  maxDeposit: number
  /** Lower quantile of the projected nominal rate, as a decimal. */
  lowerQuantileRate: number
  /** Upper quantile of the projected nominal rate, as a decimal. */
  upperQuantileRate: number
}

/**
 * Monthly cost at the lower and upper quantile of the projected nominal rate.
 * The rates are a fixed forecast, so they don't follow `nominalRate` or the
 * stress test.
 */
export interface Quantiles {
  lowerRate: number
  upperRate: number
  /** Same indexing as `Schedule.monthlyCost`. */
  lower: number[]
  upper: number[]
  lowerWithExpenses: number[]
  upperWithExpenses: number[]
}

/** Defaults served from `config.py`. */
export interface Defaults {
  config: Config
}

export interface Schedule {
  amount: number
  /** Loan amount as a share of the purchase price (belåningsgrad), as a decimal. */
  loanToValue: number
  monthlyRate: number
  months: number
  annuity: number
  /** Monthly joint expenses for the whole property. */
  jointExpenses: number
  totalInterest: number
  /**
   * Each series covers month 0 through `months`, so has `months + 1` entries.
   * Month 0 is the opening balance: payments, and so interest, dividend,
   * deduction and monthly cost, start in month 1.
   */
  balance: number[]
  interest: number[]
  dividend: number[]
  deduction: number[]
  monthlyCost: number[]
  /** `monthlyCost` plus the joint expenses in every paid month. */
  monthlyCostWithExpenses: number[]
  /** Interest paid in each year of the loan, year 1 first. */
  annualInterest: number[]
  /** Whether `loanShare` was set by hand rather than derived. */
  loanShareSetByHand: boolean
  persons: [Person, Person]
  quantiles: Quantiles
}

const ENDPOINT = '/api/schedule'

/** An error the API reported, safe to show to the user. */
export class ApiError extends Error {}

async function readError(response: Response): Promise<never> {
  let message = `Request failed (${response.status})`

  try {
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      message = (body as { error: string }).error
    }
  } catch {
    // Keep the status-based message.
  }

  throw new ApiError(message)
}

/** Fetch the defaults defined in `config.py`. */
export async function fetchDefaults(signal?: AbortSignal): Promise<Defaults> {
  const response = await fetch(ENDPOINT, { signal })
  if (!response.ok) return readError(response)
  return (await response.json()) as Defaults
}

/** Project the schedules for a set of inputs. */
export async function fetchSchedule(
  input: LoanInput,
  config: Config,
  signal?: AbortSignal,
): Promise<Schedule> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, config }),
    signal,
  })
  if (!response.ok) return readError(response)
  return (await response.json()) as Schedule
}
