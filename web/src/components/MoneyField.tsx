import { Field } from '@base-ui/react/field'
import { NumberField } from '@base-ui/react/number-field'

interface MoneyFieldProps {
  label: string
  description?: string
  /** Null when the field is blank. */
  value: number | null
  onValueChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
}

export function MoneyField({
  label,
  description,
  value,
  onValueChange,
  min = 0,
  max,
  step = 10_000,
}: MoneyFieldProps) {
  return (
    <Field.Root className="field">
      <NumberField.Root
        className="number-field"
        value={value}
        onValueChange={(next) => onValueChange(next)}
        min={min}
        max={max}
        step={step}
        largeStep={step * 10}
        locale="nb-NO"
        format={{ style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }}
      >
        <Field.Label className="field-label" render={<NumberField.ScrubArea />}>
          {label}
          <NumberField.ScrubAreaCursor />
        </Field.Label>
        <NumberField.Group className="number-group">
          <NumberField.Decrement className="stepper" aria-label={`Decrease ${label}`}>
            −
          </NumberField.Decrement>
          <NumberField.Input className="number-input" />
          <NumberField.Increment className="stepper" aria-label={`Increase ${label}`}>
            +
          </NumberField.Increment>
        </NumberField.Group>
      </NumberField.Root>
      {description ? <Field.Description className="field-hint">{description}</Field.Description> : null}
    </Field.Root>
  )
}
