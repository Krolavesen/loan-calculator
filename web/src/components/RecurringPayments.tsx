import { NumberField } from '@base-ui/react/number-field'
import type { RecurringPayment } from '../lib/form'
import { formatMoney } from '../lib/format'

interface RecurringPaymentsProps {
  payments: RecurringPayment[]
  onChange: (payments: RecurringPayment[]) => void
  /** Monthly total from the API, once it has answered. */
  monthlyTotal: number | null
}

const newId = () => Math.random().toString(36).slice(2, 10)

/** A list of named, recurring outgoings such as subscriptions or other loans. */
export function RecurringPayments({ payments, onChange, monthlyTotal }: RecurringPaymentsProps) {
  const update = (id: string, changes: Partial<RecurringPayment>) =>
    onChange(payments.map((p) => (p.id === id ? { ...p, ...changes } : p)))

  return (
    <fieldset className="recurring">
      <legend className="field-label">Recurring payments</legend>

      {payments.length > 0 ? (
        <ul className="recurring-list">
          {payments.map((payment, i) => {
            const label = payment.name.trim() || `Payment ${i + 1}`
            return (
              <li key={payment.id} className="recurring-row">
                <input
                  className="views-input recurring-name"
                  value={payment.name}
                  onChange={(event) => update(payment.id, { name: event.target.value })}
                  placeholder="e.g. Spotify, car loan"
                  aria-label={`Name of payment ${i + 1}`}
                  maxLength={40}
                />
                <NumberField.Root
                  className="number-field recurring-amount"
                  value={payment.amount}
                  onValueChange={(amount) => update(payment.id, { amount })}
                  min={0}
                  step={100}
                  locale="nb-NO"
                  format={{ style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }}
                >
                  <NumberField.Group className="number-group">
                    <NumberField.Input className="number-input" aria-label={`Amount for ${label}`} />
                  </NumberField.Group>
                </NumberField.Root>
                <select
                  className="views-select recurring-period"
                  value={payment.period}
                  onChange={(event) =>
                    update(payment.id, { period: event.target.value as RecurringPayment['period'] })
                  }
                  aria-label={`How often ${label} is paid`}
                >
                  <option value="month">per month</option>
                  <option value="year">per year</option>
                </select>
                <button
                  type="button"
                  className="button recurring-remove"
                  onClick={() => onChange(payments.filter((p) => p.id !== payment.id))}
                  aria-label={`Remove ${label}`}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="recurring-footer">
        <button
          type="button"
          className="button"
          onClick={() => onChange([...payments, { id: newId(), name: '', amount: null, period: 'month' }])}
        >
          + Add payment
        </button>
        {payments.length > 0 && monthlyTotal !== null ? (
          <span className="recurring-total">
            Total <strong>{formatMoney(monthlyTotal)}</strong> / month
          </span>
        ) : null}
      </div>
      <p className="field-hint">Yearly payments count as a twelfth each month.</p>
    </fieldset>
  )
}
