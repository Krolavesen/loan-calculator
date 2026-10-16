import { Fragment, useEffect, useState } from 'react'
import { fetchSchedule, type Config, type Person, type Schedule } from '../lib/api'
import { isReady, toLoanInput, type FormValues } from '../lib/form'
import { formatMoney, formatPercent } from '../lib/format'
import { toEffectiveRate } from '../lib/rates'
import type { SavedView } from '../lib/views'

/** One side of the comparison: a saved view or the current inputs. */
interface Side {
  form: FormValues
  config: Config
  stressed: boolean
}

interface Projected extends Side {
  schedule: Schedule | null
}

type Value = number | boolean | null
type Kind = 'money' | 'percent' | 'count' | 'bool' | 'split'

interface Row {
  group: string
  label: string
  kind: Kind
  value: (side: Projected) => Value
}

const CURRENT = '__current__'

const person = (i: 0 | 1, pick: (p: Person) => number) => (side: Projected) =>
  side.schedule ? pick(side.schedule.persons[i]) : null

const recurringTotal = (i: 0 | 1) => (side: Projected) =>
  side.form.recurringPayments[i].reduce(
    (sum, p) => sum + (p.amount ?? 0) / (p.period === 'year' ? 12 : 1),
    0,
  )

function personRows(i: 0 | 1): Row[] {
  const group = `Person ${i + 1}`
  return [
    { group, label: 'Bank loan', kind: 'money', value: person(i, (p) => p.bankLoan) },
    { group, label: 'Share of the bank loan', kind: 'percent', value: person(i, (p) => p.loanShare) },
    { group, label: 'Settled between you (+ owes, − lends)', kind: 'money', value: person(i, (p) => p.privateLoan) },
    { group, label: 'Loan / month', kind: 'money', value: person(i, (p) => p.monthlyCost) },
    { group, label: 'Joint expenses / month', kind: 'money', value: person(i, (p) => p.monthlyExpenses) },
    { group, label: 'Loan + expenses / month', kind: 'money', value: person(i, (p) => p.monthlyCostWithExpenses) },
    { group, label: 'Skattekort: renter på gjeld, year 1', kind: 'money', value: person(i, (p) => p.annualInterest) },
    { group, label: 'Tax saved / year', kind: 'money', value: person(i, (p) => p.maxAnnualDeduction) },
    { group, label: 'Tax / year', kind: 'money', value: person(i, (p) => p.tax) },
    { group, label: 'Tabelltrekk / month', kind: 'money', value: person(i, (p) => p.withholding) },
    { group, label: 'Net pay, regular month', kind: 'money', value: person(i, (p) => p.netMonthly) },
    { group, label: 'Left after everything / month', kind: 'money', value: person(i, (p) => p.leftAfterAll) },
  ]
}

const ROWS: Row[] = [
  { group: 'Inputs', label: 'Purchase price', kind: 'money', value: (s) => s.form.price },
  { group: 'Inputs', label: 'Joint expenses / month', kind: 'money', value: (s) => s.form.jointExpenses },
  { group: 'Inputs', label: 'Equity, person 1', kind: 'money', value: (s) => s.form.equities[0] },
  { group: 'Inputs', label: 'Equity, person 2', kind: 'money', value: (s) => s.form.equities[1] },
  { group: 'Inputs', label: 'Nominal rate', kind: 'percent', value: (s) => s.form.nominalRate },
  { group: 'Inputs', label: 'Effective rate', kind: 'percent', value: (s) => toEffectiveRate(s.form.nominalRate) },
  { group: 'Inputs', label: 'Payment schedule (years)', kind: 'count', value: (s) => s.form.years },
  { group: 'Inputs', label: 'Borrowers', kind: 'count', value: (s) => s.form.borrowers },
  { group: 'Inputs', label: 'Ownership split, person 1', kind: 'percent', value: (s) => s.form.ownershipShare },
  { group: 'Inputs', label: 'Loan split, person 1', kind: 'split', value: (s) => s.form.loanShare },
  { group: 'Inputs', label: 'Deposit last calendar year', kind: 'money', value: (s) => s.form.deposit },
  { group: 'Inputs', label: 'Customer dividend', kind: 'bool', value: (s) => s.form.includeDividend },
  { group: 'Inputs', label: 'Tax deduction', kind: 'bool', value: (s) => s.form.includeDeduction },
  { group: 'Inputs', label: 'Stress test', kind: 'bool', value: (s) => s.stressed },
  { group: 'Inputs', label: 'Salary / year, person 1', kind: 'money', value: (s) => s.form.salaries[0] },
  { group: 'Inputs', label: 'Salary / year, person 2', kind: 'money', value: (s) => s.form.salaries[1] },
  { group: 'Inputs', label: 'Student loan / month, person 1', kind: 'money', value: (s) => s.form.studentLoans[0] },
  { group: 'Inputs', label: 'Student loan / month, person 2', kind: 'money', value: (s) => s.form.studentLoans[1] },
  { group: 'Inputs', label: 'Recurring payments / month, person 1', kind: 'money', value: recurringTotal(0) },
  { group: 'Inputs', label: 'Recurring payments / month, person 2', kind: 'money', value: recurringTotal(1) },

  { group: 'Assumptions', label: 'Dividend rate', kind: 'percent', value: (s) => s.config.dividendRate },
  { group: 'Assumptions', label: 'Tax deduction rate', kind: 'percent', value: (s) => s.config.deductionRate },
  { group: 'Assumptions', label: 'Max loan per borrower', kind: 'money', value: (s) => s.config.maxLoanPerBorrower },
  { group: 'Assumptions', label: 'Max deposit', kind: 'money', value: (s) => s.config.maxDeposit },
  { group: 'Assumptions', label: 'Forecast rate, lower', kind: 'percent', value: (s) => s.config.lowerQuantileRate },
  { group: 'Assumptions', label: 'Forecast rate, upper', kind: 'percent', value: (s) => s.config.upperQuantileRate },

  { group: 'Household', label: 'Loan amount', kind: 'money', value: (s) => s.schedule?.amount ?? null },
  { group: 'Household', label: 'Loan-to-value', kind: 'percent', value: (s) => s.schedule?.loanToValue ?? null },
  { group: 'Household', label: 'Annuity / month', kind: 'money', value: (s) => s.schedule?.annuity ?? null },
  { group: 'Household', label: 'Cost month 1', kind: 'money', value: (s) => s.schedule?.monthlyCost[1] ?? null },
  {
    group: 'Household',
    label: 'Cost last month',
    kind: 'money',
    value: (s) => (s.schedule ? s.schedule.monthlyCost[s.schedule.months]! : null),
  },
  {
    group: 'Household',
    label: 'Loan + expenses, month 1',
    kind: 'money',
    value: (s) => s.schedule?.monthlyCostWithExpenses[1] ?? null,
  },
  { group: 'Household', label: 'Month 1, forecast low', kind: 'money', value: (s) => s.schedule?.quantiles.lower[1] ?? null },
  { group: 'Household', label: 'Month 1, forecast high', kind: 'money', value: (s) => s.schedule?.quantiles.upper[1] ?? null },
  { group: 'Household', label: 'Interest, year 1', kind: 'money', value: (s) => s.schedule?.annualInterest[0] ?? null },
  { group: 'Household', label: 'Total interest', kind: 'money', value: (s) => s.schedule?.totalInterest ?? null },

  ...personRows(0),
  ...personRows(1),
]

const points = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2, signDisplay: 'always' })
const counts = new Intl.NumberFormat('nb-NO', { signDisplay: 'always' })
const signedMoney = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  maximumFractionDigits: 0,
  signDisplay: 'always',
})

function show(kind: Kind, value: Value): string {
  if (kind === 'bool') return value ? 'On' : 'Off'
  if (kind === 'split' && value === null) return 'Auto'
  if (value === null || typeof value === 'boolean') return '—'
  if (kind === 'money') return formatMoney(value)
  if (kind === 'percent' || kind === 'split') return formatPercent(value)
  return String(value)
}

/** The difference B − A, or null when the two are the same. */
function difference(kind: Kind, a: Value, b: Value): string | null {
  if (kind === 'bool' || kind === 'split') {
    if (a === b) return null
    if (kind === 'split' && typeof a === 'number' && typeof b === 'number') {
      return `${points.format((b - a) * 100)} pp`
    }
    return 'Changed'
  }

  // A blank money field counts as 0, as it does in the calculation.
  const x = typeof a === 'number' ? a : kind === 'money' ? 0 : null
  const y = typeof b === 'number' ? b : kind === 'money' ? 0 : null
  if (x === null || y === null) return a === b ? null : 'Changed'

  const delta = y - x
  if (kind === 'money') return Math.abs(delta) < 0.5 ? null : signedMoney.format(delta)
  if (kind === 'percent') return Math.abs(delta) < 1e-6 ? null : `${points.format(delta * 100)} pp`
  return delta === 0 ? null : counts.format(delta)
}

interface CompareViewsProps {
  views: SavedView[]
  current: Side
  stressBump: number
  onClose: () => void
}

/** Pick two views, or a view and the current inputs, and list every difference. */
export function CompareViews({ views, current, stressBump, onClose }: CompareViewsProps) {
  const options = [{ value: CURRENT, label: 'Current inputs' }, ...views.map((v) => ({ value: v.name, label: v.name }))]
  const [left, setLeft] = useState(views[0]?.name ?? CURRENT)
  const [right, setRight] = useState(views[1]?.name ?? CURRENT)
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [results, setResults] = useState<[Projected, Projected] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sideFor = (name: string): Side => {
    const view = views.find((v) => v.name === name)
    return view ? { form: view.form, config: view.config, stressed: view.stressed } : current
  }

  const a = sideFor(left)
  const b = sideFor(right)
  const key = JSON.stringify([a, b])

  useEffect(() => {
    const controller = new AbortController()

    const project = async (side: Side): Promise<Projected> => {
      if (!isReady(side.form)) return { ...side, schedule: null }
      const input = toLoanInput(side.form)
      if (side.stressed) input.nominalRate += stressBump
      return { ...side, schedule: await fetchSchedule(input, side.config, controller.signal) }
    }

    Promise.all([project(a), project(b)])
      .then((projected) => {
        setResults(projected)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : 'Could not reach the API')
      })

    return () => controller.abort()
    // `key` captures both sides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stressBump])

  const rows = results
    ? ROWS.map((row) => {
        const va = row.value(results[0])
        const vb = row.value(results[1])
        return { row, a: show(row.kind, va), b: show(row.kind, vb), diff: difference(row.kind, va, vb) }
      })
    : []
  const shown = onlyChanged ? rows.filter((r) => r.diff !== null) : rows
  const changedCount = rows.filter((r) => r.diff !== null).length

  const picker = (label: string, value: string, onChange: (value: string) => void) => (
    <label className="views-field">
      <span className="field-label">{label}</span>
      <select className="views-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )

  const labelFor = (name: string) => options.find((o) => o.value === name)?.label ?? name

  return (
    <section className="panel compare" aria-label="Compare views">
      <div className="compare-head">
        <h2 className="group-title">Compare views</h2>
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="compare-controls">
        {picker('A', left, setLeft)}
        {picker('B', right, setRight)}
        <label className="compare-toggle">
          <input type="checkbox" checked={onlyChanged} onChange={(event) => setOnlyChanged(event.target.checked)} />
          Only show differences
        </label>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !results ? (
        <p className="muted">Calculating…</p>
      ) : (
        <>
          <p className="field-hint compare-summary">
            {left === right
              ? 'Pick two different views to see what changes.'
              : `${changedCount} of ${rows.length} fields differ. Difference is B − A.`}
          </p>
          <div className="compare-wrap">
            <table className="schedule compare-table">
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">A · {labelFor(left)}</th>
                  <th scope="col">B · {labelFor(right)}</th>
                  <th scope="col">Difference</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ row, a, b, diff }, i) => (
                  <Fragment key={`${row.group}-${row.label}`}>
                    {i === 0 || shown[i - 1]!.row.group !== row.group ? (
                      <tr className="compare-group">
                        <th scope="rowgroup" colSpan={4}>
                          {row.group}
                        </th>
                      </tr>
                    ) : null}
                    <tr className={diff ? 'compare-changed' : undefined}>
                      <th scope="row">{row.label}</th>
                      <td>{a}</td>
                      <td>{b}</td>
                      <td className="compare-diff">{diff ?? '—'}</td>
                    </tr>
                  </Fragment>
                ))}
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="compare-empty">
                      No differences.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
