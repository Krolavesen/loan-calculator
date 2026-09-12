import { useEffect, useState } from 'react'
import { Accordion } from '@base-ui/react/accordion'
import { Tabs } from '@base-ui/react/tabs'
import { CostChart } from './components/CostChart'
import { CountField } from './components/CountField'
import { MoneyField } from './components/MoneyField'
import { RateField } from './components/RateField'
import { ScheduleTable } from './components/ScheduleTable'
import { ToggleField } from './components/ToggleField'
import { fetchDefaults, type Config, type Defaults, type LoanInput, type Schedule } from './lib/api'
import { formatMoney, formatPercent } from './lib/format'
import { useSchedule } from './lib/useSchedule'

/** The Osterhaus gate 8B example from `main.py`. Equity comes from `config.py`. */
const EXAMPLE = {
  price: 6.69e6,
  jointExpenses: 3929,
  nominalRate: 0.0492,
  years: 30,
  borrowers: 2,
  deposit: 0,
  includeDividend: true,
  includeDeduction: true,
}

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
  const [input, setInput] = useState<LoanInput>({ ...EXAMPLE, equity: defaults.equity })
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
            label="Equity"
            value={input.equity}
            onValueChange={(equity) => patch({ equity })}
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
          <Results schedule={schedule} stressed={stressed} pending={pending} />
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
}: {
  schedule: Schedule
  stressed: boolean
  pending: boolean
}) {
  const first = schedule.monthlyCost[0]!
  const last = schedule.monthlyCost[schedule.months]!

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
        <Stat label={`Cost month ${schedule.months}`} value={formatMoney(last)} />
        <Stat label="Total interest" value={formatMoney(schedule.totalInterest)} />
        <Stat label="Joint expenses share" value={formatMoney(schedule.jointExpensesShare)} />
      </dl>

      <Tabs.Root defaultValue="chart" className="tabs">
        <Tabs.List className="tab-list">
          <Tabs.Tab value="chart" className="tab">
            Monthly cost
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
          <CostChart series={schedule.monthlyCost} label="Monthly cost" />
        </Tabs.Panel>
        <Tabs.Panel value="balance" className="tab-panel">
          <CostChart series={schedule.balance} label="Outstanding balance" />
        </Tabs.Panel>
        <Tabs.Panel value="table" className="tab-panel">
          <ScheduleTable schedule={schedule} />
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  )
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? 'stat stat-emphasis' : 'stat'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
