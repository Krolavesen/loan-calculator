import { useEffect, useState } from 'react'
import { Accordion } from '@base-ui/react/accordion'
import { Tabs } from '@base-ui/react/tabs'
import { CostChart } from './components/CostChart'
import { CountField } from './components/CountField'
import { MoneyField } from './components/MoneyField'
import { RateField } from './components/RateField'
import { ScheduleTable } from './components/ScheduleTable'
import { YearBarChart } from './components/YearBarChart'
import { ToggleField } from './components/ToggleField'
import { fetchDefaults, type Config, type Defaults, type LoanInput, type Person, type Schedule } from './lib/api'
import { formatMoney, formatPercent } from './lib/format'
import { toEffectiveRate, toNominalRate } from './lib/rates'
import { useSchedule } from './lib/useSchedule'

/** The Osterhaus gate 8B example from `main.py`. Equity comes from `config.py`. */
const EXAMPLE = {
  price: 6.55e6,
  jointExpenses: 3929,
  nominalRate: 0.035,
  years: 30,
  borrowers: 2,
  deposit: 0,
  includeDividend: true,
  includeDeduction: true,
  ownershipShare: 0.5,
  salaries: [0, 0] as [number, number],
  studentLoans: [0, 0] as [number, number],
}

/** Highest loan-to-value Norwegian lenders may grant: 10 % equity is required. */
const MAX_LOAN_TO_VALUE = 0.9

/** Stress-test bump applied to the nominal rate, as a decimal. */
const STRESS_BUMP = 0.03

export function App() {
  const [defaults, setDefaults] = useState<Defaults | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchDefaults(controller.signal)
      .then(setDefaults)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Could not reach the API')
      })
    return () => controller.abort()
  }, [])

  return (
    <div className="app">
      <header className="masthead">
        <h1>Loan calculator</h1>
        <p>
          Projected monthly cost of an annuity mortgage, net of customer dividend and tax
          deduction. Every figure is calculated by the Python model in this repo.
        </p>
      </header>

      {error ? (
        <p className="panel error" role="alert">
          {error}
        </p>
      ) : defaults ? (
        <Calculator defaults={defaults} />
      ) : (
        <p className="panel muted">Loading defaults…</p>
      )}
    </div>
  )
}

function Calculator({ defaults }: { defaults: Defaults }) {
  const [input, setInput] = useState<LoanInput>({ ...EXAMPLE, equities: defaults.equities })
  const [config, setConfig] = useState<Config>(defaults.config)
  const [stressed, setStressed] = useState(false)

  const patch = (changes: Partial<LoanInput>) => setInput((prev) => ({ ...prev, ...changes }))
  const patchConfig = (changes: Partial<Config>) => setConfig((prev) => ({ ...prev, ...changes }))

  const activeInput = stressed
    ? { ...input, nominalRate: input.nominalRate + STRESS_BUMP }
    : input
  const { schedule, error, pending } = useSchedule(activeInput, config)

  return (
    <div className="layout">
      <form className="panel inputs" onSubmit={(event) => event.preventDefault()}>
        <section className="group">
          <h2 className="group-title">Property</h2>
          <MoneyField
            label="Purchase price"
            value={input.price}
            onValueChange={(price) => patch({ price })}
            step={50_000}
          />
          <MoneyField
            label="Joint expenses / month"
            description="Felleskostnader, split across borrowers."
            value={input.jointExpenses}
            onValueChange={(jointExpenses) => patch({ jointExpenses })}
            step={100}
          />
          <MoneyField
            label="Equity, person 1"
            value={input.equities[0]}
            onValueChange={(equity) => patch({ equities: [equity, input.equities[1]] })}
            step={50_000}
          />
          <MoneyField
            label="Equity, person 2"
            description={schedule ? describeLoanToValue(schedule.loanToValue) : undefined}
            value={input.equities[1]}
            onValueChange={(equity) => patch({ equities: [input.equities[0], equity] })}
            step={50_000}
          />
        </section>

        <section className="group">
          <h2 className="group-title">Loan</h2>
          <RateField
            label="Nominal rate"
            value={input.nominalRate}
            onValueChange={(nominalRate) => patch({ nominalRate })}
            min={0.0001}
            max={0.5}
          />
          <RateField
            label="Effective rate"
            description="Nominal rate compounded monthly, excluding fees."
            value={toEffectiveRate(input.nominalRate)}
            onValueChange={(effectiveRate) => patch({ nominalRate: toNominalRate(effectiveRate) })}
            min={toEffectiveRate(0.0001)}
            max={toEffectiveRate(0.5)}
          />
          <CountField
            label="Payment schedule"
            value={input.years}
            onValueChange={(years) => patch({ years })}
            min={1}
            max={50}
            suffix="years"
          />
          <CountField
            label="Borrowers"
            value={input.borrowers}
            onValueChange={(borrowers) => patch({ borrowers })}
            min={1}
            max={8}
          />
          <CountField
            label="Ownership split"
            description={`Person 1 owns ${formatPercent(input.ownershipShare)}, person 2 ${formatPercent(1 - input.ownershipShare)}. Each borrows their share of the price less their equity.`}
            value={Math.round(input.ownershipShare * 100)}
            onValueChange={(percent) => patch({ ownershipShare: percent / 100 })}
            min={0}
            max={100}
            suffix="% person 1"
          />
          <MoneyField
            label="Deposit last calendar year"
            description="Counts towards the customer dividend."
            value={input.deposit}
            onValueChange={(deposit) => patch({ deposit })}
            step={50_000}
          />
        </section>

        <section className="group">
          <h2 className="group-title">Adjustments</h2>
          <ToggleField
            label="Customer dividend"
            description="Conservative estimate — see the README."
            checked={input.includeDividend}
            onCheckedChange={(includeDividend) => patch({ includeDividend })}
          />
          <ToggleField
            label="Tax deduction"
            checked={input.includeDeduction}
            onCheckedChange={(includeDeduction) => patch({ includeDeduction })}
          />
          <ToggleField
            label={`Stress test (+${formatPercent(STRESS_BUMP)})`}
            description="Re-runs the projection at a higher nominal rate."
            checked={stressed}
            onCheckedChange={setStressed}
          />
        </section>

        <Accordion.Root className="accordion">
          <Accordion.Item className="accordion-item">
            <Accordion.Header>
              <Accordion.Trigger className="accordion-trigger">
                Assumptions
                <span className="accordion-icon" aria-hidden="true">
                  +
                </span>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel className="accordion-panel">
              <div className="accordion-body">
                <p className="field-hint">Defaults come from config.py.</p>
                <RateField
                  label="Dividend rate"
                  value={config.dividendRate}
                  onValueChange={(dividendRate) => patchConfig({ dividendRate })}
                  max={0.2}
                  step={0.0005}
                />
                <RateField
                  label="Tax deduction rate"
                  value={config.deductionRate}
                  onValueChange={(deductionRate) => patchConfig({ deductionRate })}
                  max={0.5}
                  step={0.01}
                />
                <MoneyField
                  label="Max loan per borrower"
                  value={config.maxLoanPerBorrower}
                  onValueChange={(maxLoanPerBorrower) => patchConfig({ maxLoanPerBorrower })}
                  step={100_000}
                />
                <MoneyField
                  label="Max deposit"
                  value={config.maxDeposit}
                  onValueChange={(maxDeposit) => patchConfig({ maxDeposit })}
                  step={100_000}
                />
                <RateField
                  label="Forecast rate, lower quantile"
                  description="Projected nominal rate in 2027/28."
                  value={config.lowerQuantileRate}
                  onValueChange={(lowerQuantileRate) => patchConfig({ lowerQuantileRate })}
                  min={0.0001}
                  max={Math.min(0.5, config.upperQuantileRate)}
                  step={0.0025}
                />
                <RateField
                  label="Forecast rate, upper quantile"
                  description="Projected nominal rate in 2027/28."
                  value={config.upperQuantileRate}
                  onValueChange={(upperQuantileRate) => patchConfig({ upperQuantileRate })}
                  min={Math.max(0.0001, config.lowerQuantileRate)}
                  max={0.5}
                  step={0.0025}
                />
              </div>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion.Root>
      </form>

      <div className="panel results" aria-busy={pending}>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {schedule ? (
          <Results
            schedule={schedule}
            stressed={stressed}
            pending={pending}
            salaries={input.salaries}
            studentLoans={input.studentLoans}
            onSalaryChange={(index, salary) => {
              const salaries: [number, number] = [...input.salaries]
              salaries[index] = salary
              patch({ salaries })
            }}
            onStudentLoanChange={(index, studentLoan) => {
              const studentLoans: [number, number] = [...input.studentLoans]
              studentLoans[index] = studentLoan
              patch({ studentLoans })
            }}
          />
        ) : (
          <p className="muted">Calculating…</p>
        )}
      </div>
    </div>
  )
}

function Results({
  schedule,
  stressed,
  pending,
  salaries,
  studentLoans,
  onSalaryChange,
  onStudentLoanChange,
}: {
  schedule: Schedule
  stressed: boolean
  pending: boolean
  salaries: [number, number]
  studentLoans: [number, number]
  onSalaryChange: (index: 0 | 1, salary: number) => void
  onStudentLoanChange: (index: 0 | 1, studentLoan: number) => void
}) {
  const first = schedule.monthlyCost[1]!
  const last = schedule.monthlyCost[schedule.months]!
  const { quantiles } = schedule
  const forecast = `Forecast ${formatPercent(quantiles.lowerRate)}–${formatPercent(quantiles.upperRate)}`

  return (
    <div className={pending ? 'stale' : undefined}>
      {stressed ? (
        <p className="badge" role="status">
          Stress-tested rate
        </p>
      ) : null}

      <dl className="stats">
        <Stat label="Loan amount" value={formatMoney(schedule.amount)} />
        <Stat label="Annuity / month" value={formatMoney(schedule.annuity)} />
        <Stat label="Cost month 1" value={formatMoney(first)} emphasis />
        <Stat label="Month 1, forecast" value={formatRange(quantiles, 1)} />
        <Stat label={`Cost month ${schedule.months}`} value={formatMoney(last)} />
        <Stat label={`Month ${schedule.months}, forecast`} value={formatRange(quantiles, schedule.months)} />
        <Stat label="Total interest" value={formatMoney(schedule.totalInterest)} />
        <Stat
          label="Loan + expenses, month 1"
          value={formatMoney(schedule.monthlyCostWithExpenses[1]!)}
          emphasis
        />
      </dl>

      <Tabs.Root defaultValue="chart" className="tabs">
        <Tabs.List className="tab-list">
          <Tabs.Tab value="chart" className="tab">
            Loan
          </Tabs.Tab>
          <Tabs.Tab value="total" className="tab">
            Loan + expenses
          </Tabs.Tab>
          <Tabs.Tab value="balance" className="tab">
            Balance
          </Tabs.Tab>
          <Tabs.Tab value="table" className="tab">
            Schedule
          </Tabs.Tab>
          <Tabs.Indicator className="tab-indicator" />
        </Tabs.List>
        <Tabs.Panel value="chart" className="tab-panel">
          <CostChart
            series={schedule.monthlyCost.slice(1)}
            startMonth={1}
            band={{
              lower: quantiles.lower.slice(1),
              upper: quantiles.upper.slice(1),
              label: forecast,
            }}
            label="Monthly loan cost"
          />
        </Tabs.Panel>
        <Tabs.Panel value="total" className="tab-panel">
          <CostChart
            series={schedule.monthlyCostWithExpenses.slice(1)}
            startMonth={1}
            band={{
              lower: quantiles.lowerWithExpenses.slice(1),
              upper: quantiles.upperWithExpenses.slice(1),
              label: forecast,
            }}
            label={`Loan + ${formatMoney(schedule.jointExpenses)} joint expenses`}
          />
        </Tabs.Panel>
        <Tabs.Panel value="balance" className="tab-panel">
          <CostChart series={schedule.balance} label="Outstanding balance" />
        </Tabs.Panel>
        <Tabs.Panel value="table" className="tab-panel">
          <ScheduleTable schedule={schedule} />
        </Tabs.Panel>
      </Tabs.Root>

      <Owners
        schedule={schedule}
        salaries={salaries}
        studentLoans={studentLoans}
        onSalaryChange={onSalaryChange}
        onStudentLoanChange={onStudentLoanChange}
      />
    </div>
  )
}

/** Each owner's share of the loan, their skattekort figure and net pay. */
function Owners({
  schedule,
  salaries,
  studentLoans,
  onSalaryChange,
  onStudentLoanChange,
}: {
  schedule: Schedule
  salaries: [number, number]
  studentLoans: [number, number]
  onSalaryChange: (index: 0 | 1, salary: number) => void
  onStudentLoanChange: (index: 0 | 1, studentLoan: number) => void
}) {
  return (
    <section className="owners">
      <h2 className="group-title">Per owner</h2>
      <Tabs.Root defaultValue="0" className="tabs">
        <Tabs.List className="tab-list">
          {schedule.persons.map((person, i) => (
            <Tabs.Tab key={i} value={String(i)} className="tab">
              Person {i + 1} · {formatPercent(person.share)}
            </Tabs.Tab>
          ))}
          <Tabs.Indicator className="tab-indicator" />
        </Tabs.List>
        {schedule.persons.map((person, i) => (
          <Tabs.Panel key={i} value={String(i)} className="tab-panel">
            <Owner
              person={person}
              otherIndex={i === 0 ? 1 : 0}
              salary={salaries[i]!}
              studentLoan={studentLoans[i]!}
              onSalaryChange={(salary) => onSalaryChange(i as 0 | 1, salary)}
              onStudentLoanChange={(studentLoan) => onStudentLoanChange(i as 0 | 1, studentLoan)}
            />
          </Tabs.Panel>
        ))}
      </Tabs.Root>
    </section>
  )
}

function Owner({
  person,
  otherIndex,
  salary,
  studentLoan,
  onSalaryChange,
  onStudentLoanChange,
}: {
  person: Person
  /** Index of the other owner, for the labels. */
  otherIndex: 0 | 1
  salary: number
  studentLoan: number
  onSalaryChange: (salary: number) => void
  onStudentLoanChange: (studentLoan: number) => void
}) {
  const hasSalary = salary > 0
  const other = `person ${otherIndex + 1}`

  return (
    <div className="owner">
      <dl className="stats">
        <Stat label={`Share of price (${formatPercent(person.share)})`} value={formatMoney(person.priceShare)} />
        <Stat label="Equity" value={formatMoney(person.equity)} />
        <Stat
          label={`Bank loan (${formatPercent(person.loanShare)} of loan)`}
          value={formatMoney(person.bankLoan)}
          emphasis
        />
        {person.privateLoan > 0 ? (
          <Stat label={`Owes ${other} on top`} value={formatMoney(person.privateLoan)} />
        ) : person.privateLoan < 0 ? (
          <Stat label={`Lends to ${other}`} value={formatMoney(-person.privateLoan)} />
        ) : null}
      </dl>
      {person.privateLoan < 0 ? (
        <p className="field-hint">
          Their equity covers more than their share of the price. {capitalize(other)} takes the whole bank
          loan and owes them the rest privately, which gets no interest or tax deduction here.
        </p>
      ) : null}

      <dl className="stats">
        <Stat label="Loan / month" value={formatMoney(person.monthlyCost)} />
        <Stat
          label="Joint expenses / month (half)"
          value={formatMoney(person.monthlyExpenses)}
        />
        <Stat label="Loan + expenses / month" value={formatMoney(person.monthlyCostWithExpenses)} emphasis />
      </dl>

      <dl className="stats">
        <Stat label="Skattekort: renter på gjeld, year 1" value={formatMoney(person.annualInterest)} />
        <Stat label="Tax saved / year" value={formatMoney(person.maxAnnualDeduction)} />
      </dl>

      <YearBarChart values={person.annualInterestByYear} label="Interest to enter in skattekort, per year" />

      <div className="owner-pay">
        <MoneyField
          label="Gross salary / year"
          description="Estimated with 2026 rates on wages: trygdeavgift, trinnskatt and 22 % on general income after minstefradrag and personfradrag. Withheld as tabelltrekk over 10.5 months, so June is trekkfri and December half. See config.py."
          value={salary}
          onValueChange={onSalaryChange}
          step={10_000}
        />
        <MoneyField
          label="Student loan received / month"
          description="From Lånekassen. Tax-free, so it is added to net pay and left out of the tax estimate."
          value={studentLoan}
          onValueChange={onStudentLoanChange}
          step={500}
        />
        {hasSalary ? (
          <dl className="stats">
            <Stat label="Tabelltrekk / month" value={formatMoney(person.withholding)} />
            <Stat label="Net pay, regular month, no deduction" value={formatMoney(person.netMonthlyWithoutDeduction)} />
            <Stat label="Net pay, regular month, with deduction" value={formatMoney(person.netMonthly)} emphasis />
            <Stat label="Tax / year" value={formatMoney(person.tax)} />
            <Stat label="Left after loan + expenses / month" value={formatMoney(person.leftAfterLoanAndExpenses)} />
            {studentLoan > 0 ? (
              <Stat label="Left after loan + expenses, with student loan" value={formatMoney(person.leftAfterAll)} emphasis />
            ) : null}
          </dl>
        ) : (
          <p className="muted">Enter a salary to estimate net pay with the deduction.</p>
        )}
      </div>
    </div>
  )
}

/** Describe the loan-to-value, and flag it when it's over the lending limit. */
function describeLoanToValue(loanToValue: number) {
  const equityShare = formatPercent(1 - loanToValue)
  const summary = `Loan-to-value ${formatPercent(loanToValue)}, equity ${equityShare} of the price.`
  return loanToValue > MAX_LOAN_TO_VALUE
    ? `${summary} Over the ${formatPercent(MAX_LOAN_TO_VALUE)} limit.`
    : summary
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Format the forecast band for one month as "9 514–11 003 kr". */
function formatRange(quantiles: Schedule['quantiles'], month: number) {
  const lower = formatMoney(quantiles.lower[month]!).replace(/\s*kr$/, '')
  return `${lower}–${formatMoney(quantiles.upper[month]!)}`
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? 'stat stat-emphasis' : 'stat'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
